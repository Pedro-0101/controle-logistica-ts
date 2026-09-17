"""Reconhecimento de placas via YOLO (detecção) + PaddleOCR (leitura).

Pipeline em dois estágios:
1. YOLO detecta as regiões de placa na imagem (~50-200ms)
2. PaddleOCR lê o texto de cada recorte (~0.3-1s por placa)

Mais rápido e preciso que rodar PaddleOCR na imagem inteira.
Faz fallback para PaddleOCR completo se YOLO não detectar nada.
"""

import os
from dataclasses import dataclass, replace

import numpy as np

from .plate import Placa, normalizar_placa
from .preprocessamento import cortar_bordas, preparar_recorte, realcar_imagem


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

    def reconhecer(self, imagem: np.ndarray, full_frame_fallback: bool = True) -> list[CandidatoPlaca]:
        """Retorna os candidatos a placa em uma imagem (BGR, OpenCV).

        As bordas são recortadas antes da inferência (para descartar overlays
        da câmera como nome/data-hora). Tenta YOLO+PaddleOCR primeiro (recorte
        original; se o OCR não ler nada válido, repete com o recorte
        pré-processado). Se ainda assim não houver candidatos, faz fallback
        para PaddleOCR na imagem recortada.

        Os bounding boxes retornados são remapeados para as coordenadas da
        imagem original recebida.
        """
        recortada, offset_x, offset_y = cortar_bordas(imagem)
        candidatos = self._reconhecer_yolo(recortada)
        if not candidatos and full_frame_fallback:
            candidatos = self._reconhecer_paddle_completo(recortada)
        if offset_x or offset_y:
            candidatos = [
                replace(c, box=(
                    c.box[0] + offset_x, c.box[1] + offset_y,
                    c.box[2] + offset_x, c.box[3] + offset_y,
                ) if c.box else None)
                for c in candidatos
            ]
        return candidatos

    def _reconhecer_yolo(self, imagem: np.ndarray) -> list[CandidatoPlaca]:
        """Etapa 1: YOLO detecta placa → PaddleOCR lê o recorte.

        Duas tentativas por imagem: primeiro o recorte original (rápido e
        suficiente na maioria dos casos); se nenhum recorte gerar placa
        válida, repete com pré-processamento (contraste + upscale), que
        resgata placas difíceis sem penalizar as fáceis.
        """
        from ..config import settings
        from .detector import detectar_placas, recortar_placa

        deteccoes = detectar_placas(imagem)
        if not deteccoes:
            return []

        candidatos = self._ocr_em_recortes(imagem, deteccoes, preprocessar=False)
        if candidatos or not settings.anpr_preprocessar:
            return candidatos
        return self._ocr_em_recortes(imagem, deteccoes, preprocessar=True)

    def _ocr_em_recortes(
        self, imagem: np.ndarray, deteccoes, preprocessar: bool
    ) -> list[CandidatoPlaca]:
        """Roda o OCR nos recortes das detecções (com ou sem pré-processamento)."""
        from .detector import recortar_placa

        candidatos: list[CandidatoPlaca] = []
        for det in deteccoes:
            recorte = recortar_placa(imagem, det)
            if recorte.size == 0:
                continue
            if preprocessar:
                recorte = preparar_recorte(recorte)

            resultado = self._ocr.predict(recorte)
            for pagina in resultado:
                textos = pagina["rec_texts"]
                scores = pagina["rec_scores"]
                for texto, score in zip(textos, scores, strict=False):
                    placa = normalizar_placa(texto)
                    if placa is not None:
                        candidatos.append(
                            CandidatoPlaca(
                                placa=placa,
                                confianca=float(score) * det.confianca,
                                raw=texto,
                                box=(float(det.x1), float(det.y1), float(det.x2), float(det.y2)),
                            )
                        )

        return candidatos

    def _reconhecer_paddle_completo(self, imagem: np.ndarray) -> list[CandidatoPlaca]:
        """Fallback: PaddleOCR na imagem inteira (sem YOLO), com realce de contraste."""
        resultado = self._ocr.predict(realcar_imagem(imagem))
        candidatos: list[CandidatoPlaca] = []
        for pagina in resultado:
            textos = pagina["rec_texts"]
            scores = pagina["rec_scores"]
            boxes = pagina.get("rec_boxes")
            if boxes is None:
                boxes = pagina.get("rec_polys")
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

    def reconhecer_melhor(self, imagem: np.ndarray, full_frame_fallback: bool = True) -> CandidatoPlaca | None:
        """Retorna apenas o candidato de maior confiança (ou None)."""
        candidatos = self.reconhecer(imagem, full_frame_fallback=full_frame_fallback)
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
