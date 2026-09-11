import asyncio
from pathlib import Path
from unittest.mock import AsyncMock
import base64

import httpx
import numpy as np
import pytest

from app.config import settings
from app.services.camera import CameraConfig, SnapshotClient, capturar_snapshot, _montar_auth
from app.services.erros import CameraSnapshotError, CameraNaoConfiguradaError
from app.services.imagem import decodificar, decodificar_base64, salvar


def test_image_decode_and_retention(jpeg, tmp_path, monkeypatch):
    assert decodificar(jpeg).shape == (32, 64, 3)
    encoded = base64.b64encode(jpeg).decode()
    assert np.array_equal(decodificar_base64("data:image/jpeg;base64," + encoded), decodificar(jpeg))
    monkeypatch.setattr(settings, "imagens_dir", tmp_path)
    monkeypatch.setattr(settings, "max_saved_images", 2)
    first = Path(salvar(jpeg))
    second = Path(salvar(jpeg))
    third = Path(salvar(jpeg))
    assert not first.exists() and second.exists() and third.exists()
    assert third.read_bytes() == jpeg
    assert len(list(tmp_path.iterdir())) == 2


@pytest.mark.parametrize("content", [b"", b"garbage", b"\xff\xd8\xffbroken"])
def test_invalid_images(content):
    with pytest.raises(ValueError):
        decodificar(content)


def test_limits_and_bad_base64(jpeg, monkeypatch):
    with pytest.raises(ValueError, match="base64"):
        decodificar_base64("****")
    monkeypatch.setattr(settings, "max_snapshot_bytes", 8)
    with pytest.raises(ValueError, match="tamanho"):
        decodificar(jpeg)
    with pytest.raises(ValueError, match="tamanho"):
        decodificar_base64("A" * 200)
    monkeypatch.setattr(settings, "max_snapshot_bytes", 8000)
    monkeypatch.setattr(settings, "max_image_pixels", 10)
    with pytest.raises(ValueError, match="resolução"):
        decodificar(jpeg)


def test_decode_rejects_opencv_failure(jpeg, monkeypatch):
    monkeypatch.setattr("app.services.imagem.cv2.imdecode", lambda *args: None)
    with pytest.raises(ValueError):
        decodificar(jpeg)


def with_transport(monkeypatch, handler):
    original = httpx.AsyncClient
    monkeypatch.setattr("app.services.camera.httpx.AsyncClient",
                        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))


def test_discovery_cached_and_recovers(jpeg, monkeypatch):
    calls = []
    fail = [False]
    def handler(request):
        calls.append(str(request.url))
        if request.url.path == "/cgi-bin/snapshot.cgi" and not request.url.query:
            return httpx.Response(200, content=b"<html>login</html>")
        if fail[0]:
            return httpx.Response(500)
        return httpx.Response(200, content=jpeg)
    with_transport(monkeypatch, handler)
    async def run():
        camera = SnapshotClient(CameraConfig("camera", tipo_autenticacao="basic"))
        try:
            image, url = await camera.capture()
            assert image == jpeg and url.endswith("?channel=1")
            assert len(calls) == 2
            await camera.capture()
            assert len(calls) == 3 and calls[-1] == url
            fail[0] = True
            with pytest.raises(CameraSnapshotError, match="Falha"):
                await camera.capture()
            assert camera.url is None
            fail[0] = False
            assert (await camera.capture())[0] == jpeg
        finally:
            await camera.close()
        assert camera.client.is_closed
    asyncio.run(run())


@pytest.mark.parametrize("failure", ["http", "empty", "large", "network"])
def test_explicit_snapshot_failures_no_credential_leak(failure, jpeg, monkeypatch):
    def handler(request):
        if failure == "network":
            raise httpx.ConnectError("password-secret at http://user:password-secret@camera")
        return httpx.Response(500 if failure == "http" else 200,
                              content=b"" if failure == "empty" else jpeg)
    with_transport(monkeypatch, handler)
    if failure == "large":
        monkeypatch.setattr(settings, "max_snapshot_bytes", 2)
    async def run():
        with pytest.raises(CameraSnapshotError) as exc:
            await capturar_snapshot(CameraConfig("camera", url_snapshot="http://camera/snap"))
        assert "password-secret" not in str(exc.value)
    asyncio.run(run())


def test_discovery_not_found_and_timeout(monkeypatch):
    def handler(request):
        raise httpx.ConnectError("offline")
    with_transport(monkeypatch, handler)
    async def run():
        camera = SnapshotClient(CameraConfig("camera"))
        with pytest.raises(CameraNaoConfiguradaError):
            await camera.capture()
        async def slow():
            await asyncio.sleep(1)
        monkeypatch.setattr(camera, "_capture", slow)
        monkeypatch.setattr(settings, "capture_timeout_seconds", .001)
        with pytest.raises(CameraSnapshotError, match="Tempo"):
            await camera.capture()
        await camera.close()
    asyncio.run(run())
    assert isinstance(_montar_auth(CameraConfig("camera")), httpx.DigestAuth)
