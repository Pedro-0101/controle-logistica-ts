"""Decodificação e persistência de imagens de captura."""

import base64
from io import BytesIO
from PIL import Image, UnidentifiedImageError
from uuid import uuid4
from datetime import UTC, datetime

import cv2
import numpy as np

from ..config import settings


def decodificar(conteudo: bytes) -> np.ndarray:
    """Decodifica bytes em uma imagem BGR.

    Raises:
        ValueError: Se o conteúdo não for uma imagem válida.
    """
    if len(conteudo) > settings.max_snapshot_bytes:
        raise ValueError("imagem excede o limite de tamanho")
    if not conteudo:
        raise ValueError("imagem inválida")
    try:
        with Image.open(BytesIO(conteudo)) as header:
            if header.width * header.height > settings.max_image_pixels:
                raise ValueError("resolução da imagem excede o limite")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("imagem inválida") from exc
    arr = np.frombuffer(conteudo, dtype=np.uint8)
    imagem = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if imagem is None:
        raise ValueError("imagem inválida")
    return imagem


def decodificar_base64(dado: str) -> np.ndarray:
    """Decodifica uma string base64 (com ou sem prefixo data URI) em imagem BGR."""
    if len(dado) > ((settings.max_snapshot_bytes + 2) // 3) * 4 + 128:
        raise ValueError("imagem excede o limite de tamanho")
    if "," in dado:
        dado = dado.split(",", 1)[1]
    try:
        conteudo = base64.b64decode(dado, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise ValueError("base64 inválida") from exc
    return decodificar(conteudo)


def salvar(conteudo: bytes) -> str:
    """Grava a imagem em disco e retorna o caminho absoluto."""
    settings.imagens_dir.mkdir(parents=True, exist_ok=True)
    nome = f"{datetime.now(UTC).strftime('%Y%m%dT%H%M%S%f')}-{uuid4().hex}.jpg"
    caminho = settings.imagens_dir / nome
    caminho.write_bytes(conteudo)
    files = sorted(settings.imagens_dir.glob("*.jpg"), key=lambda path: path.name)
    for old in files[:-max(1, settings.max_saved_images)]:
        old.unlink(missing_ok=True)
    return str(caminho)
