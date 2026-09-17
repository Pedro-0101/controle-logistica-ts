"""Testes do recorte de bordas e remapeamento de bounding boxes no reconhecedor."""

import numpy as np

from app.anpr.plate import normalizar_placa
from app.anpr.recognizer import CandidatoPlaca, PlacaRecognizer


def _recognizer_sem_modelo() -> PlacaRecognizer:
    """Instancia o reconhecedor sem carregar PaddleOCR (métodos são mockados)."""
    return object.__new__(PlacaRecognizer)


def test_reconhecer_recorta_bordas_e_remapeia_box(monkeypatch):
    recognizer = _recognizer_sem_modelo()
    visto = {}
    placa = normalizar_placa("ABC1D23")

    def fake_yolo(imagem):
        visto["shape"] = imagem.shape
        return [CandidatoPlaca(placa=placa, confianca=0.9, raw="ABC1D23", box=(30.0, 40.0, 90.0, 70.0))]

    monkeypatch.setattr(recognizer, "_reconhecer_yolo", fake_yolo)
    imagem = np.zeros((100, 200, 3), dtype=np.uint8)

    candidatos = recognizer.reconhecer(imagem)

    assert visto["shape"] == (80, 160, 3)  # 10% de cada borda
    assert candidatos[0].box == (50.0, 50.0, 110.0, 80.0)  # remapeado para a original


def test_reconhecer_usa_fallback_na_imagem_recortada(monkeypatch):
    recognizer = _recognizer_sem_modelo()
    visto = {}
    placa = normalizar_placa("ABC1D23")

    monkeypatch.setattr(recognizer, "_reconhecer_yolo", lambda imagem: [])

    def fake_full(imagem):
        visto["shape"] = imagem.shape
        return [CandidatoPlaca(placa=placa, confianca=0.9, raw="ABC1D23", box=None)]

    monkeypatch.setattr(recognizer, "_reconhecer_paddle_completo", fake_full)
    imagem = np.zeros((100, 200, 3), dtype=np.uint8)

    candidatos = recognizer.reconhecer(imagem, full_frame_fallback=True)

    assert visto["shape"] == (80, 160, 3)
    assert candidatos[0].box is None


def test_reconhecer_sem_fallback_nao_chama_ocr_completo(monkeypatch):
    recognizer = _recognizer_sem_modelo()
    monkeypatch.setattr(recognizer, "_reconhecer_yolo", lambda imagem: [])
    chamado = {"full": False}

    def fake_full(imagem):
        chamado["full"] = True
        return []

    monkeypatch.setattr(recognizer, "_reconhecer_paddle_completo", fake_full)
    imagem = np.zeros((100, 200, 3), dtype=np.uint8)

    candidatos = recognizer.reconhecer(imagem, full_frame_fallback=False)

    assert candidatos == []
    assert chamado["full"] is False
