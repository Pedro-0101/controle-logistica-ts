"""Bounded fair inference admission, shared by camera monitors and manual requests."""
import asyncio
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor

from fastapi import HTTPException
from ..anpr.recognizer import get_recognizer
from ..config import settings
from .stats import InferenceStats


class InferenceScheduler:
    def __init__(self):
        self.pending = OrderedDict()
        self.event = asyncio.Event()
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="anpr")
        self.worker = None
        self.manual_count = 0
        self.closed = False
        self.stats = InferenceStats()
        self.stats.queue(0, False, settings.max_monitors + settings.max_manual_pending)
        self.active_key = None

    def start(self):
        self.worker = asyncio.create_task(self._run())

    def busy(self, key):
        return self.active_key == ("camera", key) or ("camera", key) in self.pending

    def _gauge(self):
        self.stats.queue(len(self.pending), self.active_key is not None,
                         settings.max_monitors + settings.max_manual_pending)

    def submit_monitor(self, key, image, callback, expires_at=None, captured_at=None):
        if self.closed:
            return False
        if self.active_key == ("camera", key):
            self.stats.increment("admission_skipped", camera_id=key)
            return False
        # Replacing preserves FIFO position; one pending image per camera.
        if ("camera", key) in self.pending:
            self.stats.increment("replaced", camera_id=key)
        self.pending[("camera", key)] = (image, False, callback, expires_at, time.monotonic(), captured_at)
        self.stats.increment("submitted", camera_id=key)
        self._gauge()
        self.event.set()
        return True

    def remove_monitor(self, key):
        self.pending.pop(("camera", key), None)
        self._gauge()

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
        self.pending[key] = (image, True, complete, None, time.monotonic(), None)
        self.stats.increment("manual_submitted")
        self._gauge()
        self.event.set()
        try:
            return await asyncio.wait_for(future, settings.inference_timeout_seconds)
        except TimeoutError as exc:
            self.stats.increment("manual_timeout")
            raise HTTPException(504, "Tempo de reconhecimento excedido") from exc
        finally:
            # Cancel pending work; active work retains its slot until the real thread ends.
            if self.pending.pop(key, None) is not None:
                self.manual_count -= 1
            self._gauge()

    async def _run(self):
        while not self.closed:
            await self.event.wait()
            if not self.pending:
                self.event.clear()
                continue
            key, (image, fallback, callback, expires_at, queued, captured) = self.pending.popitem(last=False)
            camera_id = key[1] if key[0] == "camera" else None
            if expires_at is not None and time.monotonic() >= expires_at:
                self.stats.increment("expired_before_inference", camera_id=camera_id)
                self._gauge()
                continue
            result, error = None, None
            self.active_key = key
            self._gauge()
            self.stats.observe("queue_wait", time.monotonic() - queued, camera_id)
            start = time.monotonic()
            if captured is not None:
                self.stats.observe("frame_age", start - captured, camera_id)
            try:
                result = await asyncio.get_running_loop().run_in_executor(
                    self.pool, self._infer, image, fallback)
                elapsed = time.monotonic() - start
                if result is not None:
                    self.stats.record(elapsed)
            except Exception as exc:
                error = exc
            finally:
                ended = time.monotonic()
                self.stats.observe("inference", ended - start, camera_id)
                self.stats.increment("inference_error" if error else "recognized" if result is not None else "no_plate", camera_id=camera_id)
                if captured is not None:
                    self.stats.observe("capture_to_result", ended - captured, camera_id)
                if expires_at is not None and ended >= expires_at:
                    self.stats.increment("expired_after_inference", camera_id=camera_id)
                self.active_key = None
                self._gauge()
            try:
                callback(result, error)
            except Exception:
                self.stats.increment("callback_error", camera_id=camera_id)

    @staticmethod
    def _infer(image, fallback):
        # A config global é um teto: se desligada, nunca roda o fallback pesado
        # do PaddleOCR na imagem inteira (economiza tempo e memória).
        allow_fallback = fallback and settings.anpr_full_frame_fallback
        return get_recognizer().reconhecer_melhor(image, full_frame_fallback=allow_fallback)

    async def close(self):
        self.closed = True
        for _, _, callback, _, _, _ in self.pending.values():
            callback(None, RuntimeError("Service stopping"))
        self.pending.clear()
        self._gauge()
        self.event.set()
        if self.worker:
            await self.worker  # Never release model ownership while the native thread is running.
        self.pool.shutdown(wait=True)
