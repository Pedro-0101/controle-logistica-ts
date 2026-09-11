"""Captura de snapshot de câmeras IP (Dahua, Hikvision, Intelbras etc.).

Sem dependência de banco: a câmera é representada por um dataclass simples.
"""

import asyncio
from dataclasses import dataclass
from ..config import settings

import httpx

from .erros import CameraNaoConfiguradaError, CameraSnapshotError

CAMINHOS_SNAPSHOT = [
    "/cgi-bin/snapshot.cgi",
    "/cgi-bin/snapshot.cgi?channel=1",
    "/cgi-bin/snapshot.cgi?channel=0",
    "/webcapture.jpg?command=snap&channel=1",
    "/tmpfs/auto.jpg",
    "/snapshot.jpg",
    "/jpg/image.jpg",
    "/onvif/snapshot",
    "/cgi-bin/images_cgi?channel=0&subtype=0",
    "/cgi-bin/currentpic.cgi",
    "/Streaming/channels/1/picture",
    "/ISAPI/Streaming/channels/101/picture",
    "/cap.jpg",
]


@dataclass(frozen=True)
class CameraConfig:
    ip: str
    porta: int = 80
    usuario: str = ""
    senha: str = ""
    tipo_autenticacao: str = "digest"  # digest | basic
    url_snapshot: str | None = None


def _montar_auth(camera: CameraConfig) -> httpx.Auth:
    """Monta httpx.Auth a partir das credenciais da câmera."""
    if camera.tipo_autenticacao.lower() == "basic":
        return httpx.BasicAuth(camera.usuario, camera.senha)
    return httpx.DigestAuth(camera.usuario, camera.senha)


def _montar_base(camera: CameraConfig) -> str:
    """Monta a base URL (host:port) a partir da câmera."""
    if camera.porta == 80:
        return f"http://{camera.ip}"
    return f"http://{camera.ip}:{camera.porta}"


def _is_image(content: bytes) -> bool:
    return content.startswith(b"\xff\xd8\xff") or content.startswith(b"\x89PNG\r\n\x1a\n")


class SnapshotClient:
    """Per-camera reusable connection pool; discovered URL is retained until failure."""
    def __init__(self, camera: CameraConfig):
        self.camera = camera
        self.url = camera.url_snapshot
        self.client = httpx.AsyncClient(auth=_montar_auth(camera), timeout=5.0)

    async def _get(self, url):
        async with self.client.stream("GET", url) as response:
            response.raise_for_status()
            body = bytearray()
            async for chunk in response.aiter_bytes():
                if len(body) + len(chunk) > settings.max_snapshot_bytes:
                    raise CameraSnapshotError("Snapshot excede o limite de tamanho")
                body.extend(chunk)
            return bytes(body)

    async def capture(self) -> tuple[bytes, str]:
        try:
            async with asyncio.timeout(settings.capture_timeout_seconds):
                return await self._capture()
        except TimeoutError as exc:
            raise CameraSnapshotError("Tempo de captura excedido") from exc

    async def _capture(self) -> tuple[bytes, str]:
        if not self.url:
            for path in CAMINHOS_SNAPSHOT:
                candidate = f"{_montar_base(self.camera)}{path}"
                try:
                    content = await self._get(candidate)
                    if _is_image(content):
                        self.url = candidate
                        return content, candidate
                except (httpx.HTTPError, CameraSnapshotError):
                    continue
            raise CameraNaoConfiguradaError("Nenhum endpoint de snapshot válido respondeu")
        try:
            content = await self._get(self.url)
            if not _is_image(content):
                raise CameraSnapshotError("Snapshot vazio ou formato inválido")
            return content, self.url
        except (httpx.HTTPError, CameraSnapshotError) as exc:
            if not self.camera.url_snapshot:
                self.url = None
            # HTTP exceptions contain URLs/credentials. Never expose their text.
            raise CameraSnapshotError("Falha ao capturar snapshot da câmera") from exc

    async def close(self):
        await self.client.aclose()


async def capturar_snapshot(camera: CameraConfig) -> tuple[bytes, str]:
    client = SnapshotClient(camera)
    try:
        return await client.capture()
    finally:
        await client.close()
