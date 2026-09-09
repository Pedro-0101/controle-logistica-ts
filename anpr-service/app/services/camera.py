"""Captura de snapshot de câmeras IP (Dahua, Hikvision, Intelbras etc.).

Sem dependência de banco: a câmera é representada por um dataclass simples.
"""

from dataclasses import dataclass

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
    return f"http://{camera.ip}:{camera.porta}"


async def _descobrir_snapshot(
    base: str, auth: httpx.Auth, timeout: float = 5.0
) -> str | None:
    """Testa endpoints comuns de snapshot e retorna a URL que funcionou."""
    async with httpx.AsyncClient(auth=auth, timeout=timeout) as client:
        for caminho in CAMINHOS_SNAPSHOT:
            url = f"{base}{caminho}"
            try:
                resp = await client.get(url)
                if resp.status_code == 200 and resp.content:
                    return url
            except httpx.HTTPError:
                continue
    return None


async def capturar_snapshot(camera: CameraConfig) -> tuple[bytes, str]:
    """Baixa o snapshot JPEG e retorna (conteudo, url_utilizada).

    Raises:
        CameraNaoConfiguradaError: Se a câmera não possui URL e a
            auto-descoberta não encontrou nenhum endpoint válido.
        CameraSnapshotError: Se a captura falhar.
    """
    auth = _montar_auth(camera)
    base = _montar_base(camera)
    timeout = 5.0

    url = camera.url_snapshot
    if not url:
        url = await _descobrir_snapshot(base, auth, timeout)
        if url is None:
            raise CameraNaoConfiguradaError(
                "Nenhum endpoint de snapshot respondeu. "
                "Verifique IP, porta, credenciais ou configure url_snapshot manualmente."
            )

    try:
        async with httpx.AsyncClient(auth=auth, timeout=timeout) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            conteudo = resp.content
    except httpx.HTTPError as exc:
        raise CameraSnapshotError(f"Falha ao capturar snapshot: {exc}") from exc

    if not conteudo:
        raise CameraSnapshotError("Snapshot vazio")

    return conteudo, url
