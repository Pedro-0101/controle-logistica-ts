"""Detecção de placas veiculares via YOLO.

Usa um modelo YOLO treinado para detectar regiões de placas em imagens.
O recorte da placa é então enviado ao PaddleOCR para leitura do texto.

O modelo é resolvido por prioridade:
1. ANPR_YOLO_MODEL (caminho local ou URL explícita)
2. weights/best.pt dentro do serviço ou na raiz do projeto
3. URL pública do HuggingFace (download na primeira execução)
"""

from dataclasses import dataclass

import cv2
import numpy as np

from ..config import BASE_DIR, settings

URL_MODELO_HUGGINGFACE = (
    "https://huggingface.co/Koushim/yolov8-license-plate-detection/resolve/main/best.pt"
)


@dataclass(frozen=True)
class DeteccaoPlaca:
    """Região detectada por YOLO com confiança."""
    x1: int
    y1: int
    x2: int
    y2: int
    confianca: float


_model = None


def _resolver_modelo() -> str:
    """Resolve o caminho/URL do modelo YOLO conforme a configuração."""
    if settings.anpr_yolo_model:
        return settings.anpr_yolo_model
    candidatos = (
        BASE_DIR / "weights" / "best.pt",
        BASE_DIR.parent / "weights" / "best.pt",
    )
    for caminho in candidatos:
        if caminho.exists():
            return str(caminho)
    return URL_MODELO_HUGGINGFACE


def _carregar_modelo():
    """Carrega o modelo YOLO (singleton, sob demanda)."""
    global _model
    if _model is not None:
        return _model

    import torch
    from ultralytics import YOLO

    # Limita o pool nativo do PyTorch: em máquinas com pouca RAM cada thread
    # extra multiplica buffers de ativação e pode causar OOM (3221225477 no Windows).
    try:
        torch.set_num_threads(settings.anpr_native_threads)
        if settings.anpr_native_threads == 1:
            torch.set_num_interop_threads(1)
    except (RuntimeError, ValueError):
        # set_num_interop_threads só pode ser chamado antes do primeiro trabalho.
        pass
    _model = YOLO(_resolver_modelo())
    return _model


def detectar_placas(
    imagem: np.ndarray,
    conf_min: float | None = None,
    margem: int = 10,
) -> list[DeteccaoPlaca]:
    """Detecta regiões de placas na imagem usando YOLO.

    Args:
        imagem: Imagem BGR (OpenCV).
        conf_min: Confiança mínima para considerar uma detecção
            (None usa o padrão configurado em ANPR_YOLO_CONF).
        margem: Pixels de margem ao redor do bounding box.

    Returns:
        Lista de detecções ordenadas por confiança (decrescente).
    """
    model = _carregar_modelo()
    h, w = imagem.shape[:2]
    if conf_min is None:
        conf_min = settings.anpr_yolo_conf

    resultados = model.predict(
        imagem,
        conf=conf_min,
        imgsz=settings.anpr_yolo_imgsz,
        verbose=False,
    )

    deteccoes: list[DeteccaoPlaca] = []
    if not resultados:
        return deteccoes

    for resultado in resultados:
        if resultado.boxes is None:
            continue
        for box in resultado.boxes:
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
            conf = float(box.conf[0])
            deteccoes.append(DeteccaoPlaca(
                x1=max(0, int(x1) - margem),
                y1=max(0, int(y1) - margem),
                x2=min(w, int(x2) + margem),
                y2=min(h, int(y2) + margem),
                confianca=conf,
            ))

    deteccoes.sort(key=lambda d: d.confianca, reverse=True)
    return deteccoes


def recortar_placa(imagem: np.ndarray, deteccao: DeteccaoPlaca) -> np.ndarray:
    """Recorta a região da placa da imagem."""
    return imagem[deteccao.y1:deteccao.y2, deteccao.x1:deteccao.x2]
