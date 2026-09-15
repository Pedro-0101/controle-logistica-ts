"""Pré-processamento leve de imagens (OpenCV) para melhorar a leitura do OCR.

Técnicas aplicadas aos recortes de placa antes do PaddleOCR:

- CLAHE: equalização adaptativa de histograma no canal de luminância (LAB),
  melhora o contraste em cenas de baixa luz, contraluz ou sombras.
- Filtro bilateral: reduz ruído preservando as bordas dos caracteres
  (diferente de um blur gaussiano, que borra os contornos).
- Upscale cúbico: amplia recortes pequenos de placa até uma altura mínima,
  faixa em que o PaddleOCR tem melhor acurácia (~64px ou mais).

Todas as operações são puramente OpenCV (sem rede neural adicional) e podem
ser desativadas por configuração (ANPR_PREPROCESSAR / ANPR_UPSCALE_ALTURA_MIN).
"""

import cv2
import numpy as np

from ..config import settings


def melhorar_contraste(imagem: np.ndarray) -> np.ndarray:
    """Aplica CLAHE no canal L (LAB); devolve a imagem com contraste realçado."""
    lab = cv2.cvtColor(imagem, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)


def reduzir_ruido(imagem: np.ndarray) -> np.ndarray:
    """Filtro bilateral leve: remove ruído sem desfocar as bordas dos caracteres."""
    return cv2.bilateralFilter(imagem, 5, 50, 50)


def ampliar(imagem: np.ndarray, altura_min: int) -> np.ndarray:
    """Amplia a imagem (interpolação cúbica) até atingir `altura_min` pixels de altura.

    Retorna a imagem original quando já é grande o suficiente ou quando
    `altura_min` é 0 (recurso desativado).
    """
    altura = imagem.shape[0]
    if altura_min <= 0 or altura <= 0 or altura >= altura_min:
        return imagem
    escala = altura_min / altura
    return cv2.resize(imagem, None, fx=escala, fy=escala, interpolation=cv2.INTER_CUBIC)


def preparar_recorte(recorte: np.ndarray, altura_min: int | None = None) -> np.ndarray:
    """Prepara um recorte de placa para o OCR: contraste + denoise + upscale."""
    if not settings.anpr_preprocessar:
        return recorte
    if altura_min is None:
        altura_min = settings.anpr_upscale_altura_min
    imagem = melhorar_contraste(recorte)
    imagem = reduzir_ruido(imagem)
    return ampliar(imagem, altura_min)


def realcar_imagem(imagem: np.ndarray) -> np.ndarray:
    """Realce de contraste da imagem inteira (usado no fallback sem YOLO)."""
    if not settings.anpr_preprocessar:
        return imagem
    return melhorar_contraste(imagem)
