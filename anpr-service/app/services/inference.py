"""Bounded fair inference admission, shared by camera monitors and manual requests."""
import asyncio
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor

from fastapi import HTTPException
from ..anpr.recognizer import get_recognizer
from ..config import settings


class InferenceScheduler:
    def __init__(self):
        self.pending = OrderedDict()
        self.event = asyncio.Event()
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="anpr")
        self.worker = None
        self.manual_count = 0
        self.closed = False

    def start(self):
        self.worker = asyncio.create_task(self._run())

    def submit_monitor(self, key, image, callback, expires_at=None):
        if self.closed:
            return
        # Replacing preserves FIFO position; one pending image per camera.
        self.pending[("camera", key)] = (image, False, callback, expires_at)
        self.event.set()

    def remove_monitor(self, key):
        self.pending.pop(("camera", key), None)

    async def recognize(self, image):
        if self.closed or self.manual_count >= settings.max_manual_pending:
            raise HTTPException(503, "Reconhecimento ocupado; tente novamente")
        self.manual_count += 1
        future = asyncio.get_running_loop().create_future()
        key = ("manual", object())
        def complete(result, error):
            self.manual_count -= 1
            if not future.done():
                if error:
                    future.set_exception(HTTPException(500, "Falha no reconhecimento"))
                else:
                    future.set_result(result)
        self.pending[key] = (image, True, complete, None)
        self.event.set()
        try:
            return await asyncio.wait_for(future, settings.inference_timeout_seconds)
        except TimeoutError as exc:
            raise HTTPException(504, "Tempo de reconhecimento excedido") from exc
        finally:
            # Cancel pending work; active work retains its slot until the real thread ends.
            if self.pending.pop(key, None) is not None:
                self.manual_count -= 1

    async def _run(self):
        while not self.closed:
            await self.event.wait()
            if not self.pending:
                self.event.clear()
                continue
            _, (image, fallback, callback, expires_at) = self.pending.popitem(last=False)
            if expires_at is not None and time.monotonic() >= expires_at:
                continue
            result, error = None, None
            try:
                result = await asyncio.get_running_loop().run_in_executor(
                    self.pool, self._infer, image, fallback)
            except Exception as exc:
                error = exc
            callback(result, error)

    @staticmethod
    def _infer(image, fallback):
        return get_recognizer().reconhecer_melhor(image, full_frame_fallback=fallback)

    async def close(self):
        self.closed = True
        for _, _, callback, _ in self.pending.values():
            callback(None, RuntimeError("Service stopping"))
        self.pending.clear()
        self.event.set()
        if self.worker:
            await self.worker  # Never release model ownership while the native thread is running.
        self.pool.shutdown(wait=True)
