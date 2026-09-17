"""Continuous capture with expiring observations; no database or credentials in responses."""
import asyncio
import logging
import time
from collections import Counter
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import cv2
from fastapi import APIRouter, HTTPException, Request, Response
from ..schemas import MonitorIn
from ..config import settings
from ..services.camera import CameraConfig, SnapshotClient
from ..services.imagem import decodificar

logger = logging.getLogger("anpr")

router = APIRouter(tags=["monitors"])


def iso(value):
    return value.isoformat() if value else None


class CameraMonitor:
    def __init__(self, camera_id, config, scheduler):
        self.camera_id, self.config, self.scheduler = camera_id, config, scheduler
        self.client = SnapshotClient(CameraConfig(config.host, config.port, config.user,
                                   config.password, config.auth, config.camera_url))
        self.status = "waiting"
        self.observation_id = None
        self.plate = self.confidence = self.box = self.evidence = None
        self.captured_at = self.last_seen = None
        self.last_mono = 0.0
        self.reads = 0
        # Histórico das últimas leituras para votação, com o instante de cada
        # uma: uma leitura errada pontual do OCR não zera a confirmação da placa
        # mais votada e leituras antigas expiram pela janela temporal.
        self.historico: list[tuple[str, float]] = []
        self.epoch = 0
        self.closed = False
        self.task = None

    def start(self):
        self.task = asyncio.create_task(self._capture())

    def invalidate(self, status):
        self.status = status
        self.observation_id = self.plate = self.confidence = self.box = self.evidence = None
        self.captured_at = self.last_seen = None
        self.reads = 0
        self.historico = []

    def state(self):
        if self.observation_id and time.monotonic() - self.last_mono >= self.config.stale_after_seconds:
            self.invalidate("stale")
        return dict(cameraId=self.camera_id, status=self.status, observationId=self.observation_id,
                    placa=self.plate, confianca=self.confidence, box=self.box,
                    capturedAt=iso(self.captured_at), lastSeenAt=iso(self.last_seen),
                    expiresAt=iso(self.last_seen + timedelta(seconds=self.config.stale_after_seconds))
                    if self.last_seen else None, consecutiveReads=self.reads)

    def _votes(self, now):
        """Conta os votos válidos na janela temporal, descartando leituras antigas.

        Cada leitura vale por `anpr_read_ttl_seconds`; a janela total é
        `confirmation_reads * anpr_read_ttl_seconds` (ex.: 2 leituras × 10 s = 20 s).
        """
        cutoff = now - self.config.confirmation_reads * settings.anpr_read_ttl_seconds
        self.historico = [(placa, ts) for placa, ts in self.historico if ts >= cutoff]
        return Counter(placa for placa, _ in self.historico)

    def accept(self, result, error, epoch, captured, monotonic, jpeg):
        if self.closed or epoch != self.epoch:
            return
        self.state()
        if time.monotonic() - monotonic >= self.config.stale_after_seconds:
            return
        if error:
            logger.warning("[monitor:%s] Erro na captura: %s", self.camera_id, error)
            self.invalidate("offline")
            return
        # Votação multi-frame com janela temporal: frames sem placa não zeram os
        # votos, tolerando falhas intermitentes do OCR enquanto o veículo
        # permanece no enquadramento. Leituras antigas expiram pelo relógio.
        votos = self._votes(monotonic)
        if result is None:
            if self.status != "confirmed":
                if self.plate and votos.get(self.plate):
                    self.reads = votos[self.plate]
                    self.last_seen, self.last_mono = captured, monotonic
                else:
                    self.invalidate("waiting")
            return
        self.historico.append((result.placa.valor, monotonic))
        votos = self._votes(monotonic)
        mais_votada = max(votos, key=votos.get)
        if mais_votada != self.plate:
            logger.info(
                "[monitor:%s] Nova placa detectada: %s (confianca=%.2f) | Votos: %d/%d",
                self.camera_id, mais_votada, float(result.confianca),
                votos[mais_votada], self.config.confirmation_reads,
            )
            # Troca a observação sem limpar o histórico que elegeu a nova placa.
            self.observation_id = str(uuid4())
            self.plate = mais_votada
            self.captured_at = captured
            self.evidence = jpeg
            self.status = "candidate"
        self.reads = votos[self.plate]
        self.last_seen, self.last_mono = captured, monotonic
        self.confidence = float(result.confianca)
        self.box = list(result.box) if result.box else None
        if self.reads >= self.config.confirmation_reads or self.status == "confirmed":
            if self.status != "confirmed":
                logger.info(
                    "[monitor:%s] *** PLACA CONFIRMADA: %s (confianca=%.2f) | Leituras: %d/%d | observation_id=%s",
                    self.camera_id, self.plate, self.confidence,
                    self.reads, self.config.confirmation_reads, self.observation_id,
                )
            self.status = "confirmed"
        else:
            self.status = "candidate"

    async def _capture(self):
        failures = 0
        while not self.closed:
            captured, monotonic = datetime.now(UTC), time.monotonic()
            try:
                content, _ = await self.client.capture()
                image = decodificar(content)
                ok, encoded = cv2.imencode(".jpg", image)
                if not ok:
                    raise ValueError("Invalid JPEG")
                epoch = self.epoch
                self.scheduler.submit_monitor(self.camera_id, image,
                    lambda result, error, e=epoch, c=captured, m=monotonic, j=encoded.tobytes():
                        self.accept(result, error, e, c, m, j),
                    expires_at=monotonic + self.config.stale_after_seconds)
                failures = 0
            except asyncio.CancelledError:
                raise
            except Exception:
                self.epoch += 1  # Discard inference from before this capture failure.
                self.scheduler.remove_monitor(self.camera_id)
                self.invalidate("offline")
                failures += 1
            delay = min(max(30, self.config.interval_seconds),
                        self.config.interval_seconds * 2 ** min(failures, 5))
            await asyncio.sleep(delay)

    async def close(self):
        self.closed = True
        self.scheduler.remove_monitor(self.camera_id)
        if self.task:
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
        await self.client.close()
        self.invalidate("offline")


class MonitorManager:
    def __init__(self, scheduler):
        self.scheduler = scheduler
        self.monitors = {}
        self.lock = asyncio.Lock()

    async def upsert(self, camera_id, config):
        async with self.lock:
            old = self.monitors.get(camera_id)
            if old and old.config == config:
                return old
            if not old and len(self.monitors) >= settings.max_monitors:
                raise HTTPException(503, "Limite de câmeras atingido")
            if old:
                await old.close()
            monitor = CameraMonitor(camera_id, config, self.scheduler)
            self.monitors[camera_id] = monitor
            monitor.start()
            return monitor

    def get(self, camera_id):
        if camera_id not in self.monitors:
            raise HTTPException(404, "Câmera não monitorada")
        return self.monitors[camera_id]

    async def remove(self, camera_id):
        async with self.lock:
            monitor = self.monitors.pop(camera_id, None)
            if monitor:
                await monitor.close()

    async def close(self):
        for monitor in list(self.monitors.values()):
            await monitor.close()
        self.monitors.clear()


@router.put("/monitors/{camera_id}")
async def upsert(camera_id: str, body: MonitorIn, request: Request):
    return (await request.app.state.monitors.upsert(camera_id, body)).state()


@router.get("/monitors")
async def list_monitors(request: Request):
    return list(request.app.state.monitors.monitors)


@router.delete("/monitors/{camera_id}", status_code=204)
async def remove(camera_id: str, request: Request):
    await request.app.state.monitors.remove(camera_id)
    return Response(status_code=204)


@router.get("/monitors/{camera_id}")
async def state(camera_id: str, request: Request):
    return request.app.state.monitors.get(camera_id).state()


@router.get("/monitors/{camera_id}/observations/{observation_id}/image")
async def evidence(camera_id: str, observation_id: str, request: Request):
    monitor = request.app.state.monitors.get(camera_id)
    current = monitor.state()
    if current['observationId'] != observation_id or not monitor.evidence:
        raise HTTPException(409, "Observação expirada ou substituída")
    return Response(monitor.evidence, media_type="image/jpeg", headers={"Cache-Control": "no-store"})
