"""Detecção de placas veiculares via YOLO.

Usa um modelo YOLOv8 treinado para detectar regiões de placas em imagens.
O recorte da placa é então enviado ao PaddleOCR para leitura do texto.
"""

import os
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class DeteccaoPlaca:
    """Região detectada por YOLO com confiança."""
    x1: int
    y1: int
    x2: int
    y2: int
    confianca: float


_model = None


def _carregar_modelo():
    """Carrega o modelo YOLO (singleton, sob demanda)."""
    global _model
    if _model is not None:
        return _model

    from ultralytics import YOLO

    modelo_path = os.environ.get(
        "ANPR_YOLO_MODEL",
        "https://huggingface.co/Koushim/yolov8-license-plate-detection/resolve/main/best.pt",
    )
    _model = YOLO(modelo_path)
    return _model


def detectar_placas(
    imagem: np.ndarray,
    conf_min: float = 0.25,
    margem: int = 10,
) -> list[DeteccaoPlaca]:
    """Detecta regiões de placas na imagem usando YOLO.

    Args:
        imagem: Imagem BGR (OpenCV).
        conf_min: Confiança mínima para considerar uma detecção.
        margem: Pixels de margem ao redor do bounding box.

    Returns:
        Lista de detecções ordenadas por confiança (decrescente).
    """
    model = _carregar_modelo()
    h, w = imagem.shape[:2]

    resultados = model.predict(
        imagem,
        conf=conf_min,
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
