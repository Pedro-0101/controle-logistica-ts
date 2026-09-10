"""Reconhecimento de placas via PaddleOCR (ANPR offline).

O import do PaddleOCR é feito sob demanda (dentro do construtor), pois é um
carregamento pesado e deve ficar fora do caminho de requests que informam a
placa explicitamente.
"""

import os
from dataclasses import dataclass

import numpy as np

from .plate import Placa, normalizar_placa


@dataclass(frozen=True)
class CandidatoPlaca:
    placa: Placa
    confianca: float
    raw: str
    box: tuple[float, float, float, float] | None = None


def _extrair_box(boxes, indice: int) -> tuple[float, float, float, float] | None:
    """Converte o box do PaddleOCR (rec_boxes ou rec_polys) para (x1, y1, x2, y2).

    Aceita tanto um retângulo [x1, y1, x2, y2] quanto um polígono de 4 pontos
    [[x, y], ...] (flatten em 8 valores), convertendo para o bounding box mínimo.
    """
    try:
        box = boxes[indice]
    except (IndexError, TypeError):
        return None
    coords = [float(v) for v in np.asarray(box).reshape(-1)]
    if len(coords) == 4:
        return (coords[0], coords[1], coords[2], coords[3])
    if len(coords) >= 8:
        xs = coords[0::2]
        ys = coords[1::2]
        return (min(xs), min(ys), max(xs), max(ys))
    return None


class PlacaRecognizer:
    def __init__(self, lang: str = "en") -> None:
        # Definidas antes do import do paddleocr para evitar falhas de
        # oneDNN/MKLDNN em algumas CPUs.
        os.environ.setdefault("PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT", "False")
        os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
        from paddleocr import PaddleOCR

        self._ocr = PaddleOCR(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            lang=lang,
        )

    def reconhecer(self, imagem: np.ndarray) -> list[CandidatoPlaca]:
        """Retorna os candidatos a placa em uma imagem (BGR, OpenCV)."""
        resultado = self._ocr.predict(imagem)
        candidatos: list[CandidatoPlaca] = []
        for pagina in resultado:
            textos = pagina["rec_texts"]
            scores = pagina["rec_scores"]
            boxes = pagina.get("rec_boxes") or pagina.get("rec_polys")
            for indice, (texto, score) in enumerate(
                zip(textos, scores, strict=False)
            ):
                placa = normalizar_placa(texto)
                if placa is not None:
                    candidatos.append(
                        CandidatoPlaca(
                            placa=placa,
                            confianca=float(score),
                            raw=texto,
                            box=_extrair_box(boxes, indice) if boxes is not None else None,
                        )
                    )
        return candidatos

    def reconhecer_melhor(self, imagem: np.ndarray) -> CandidatoPlaca | None:
        """Retorna apenas o candidato de maior confiança (ou None)."""
        candidatos = self.reconhecer(imagem)
        if not candidatos:
            return None
        return max(candidatos, key=lambda c: c.confianca)


_recognizer: PlacaRecognizer | None = None


def get_recognizer() -> PlacaRecognizer:
    """Retorna a instância única do reconhecedor, criando-a sob demanda."""
    global _recognizer
    if _recognizer is None:
        from ..config import settings

        _recognizer = PlacaRecognizer(lang=settings.anpr_lang)
    return _recognizer
