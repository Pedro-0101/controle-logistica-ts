"""Testes do pré-processamento de imagens (CLAHE, denoise, upscale)."""

import numpy as np

from app.anpr.preprocessamento import (
    ampliar,
    melhorar_contraste,
    preparar_recorte,
    realcar_imagem,
    reduzir_ruido,
)
from app.config import settings


def _imagem_baixo_contraste():
    """Imagem cinza com degrau suave de 60 para 90 (contraste fraco)."""
    imagem = np.full((40, 120, 3), 60, dtype=np.uint8)
    imagem[:, 60:] = 90
    return imagem


def test_melhorar_contraste_amplia_diferenca():
    original = _imagem_baixo_contraste()
    realcada = melhorar_contraste(original)
    assert realcada.shape == original.shape
    # CLAHE deve esticar o degrau 60→90 para uma faixa bem mais ampla.
    assert np.ptp(realcada.astype(int)) > np.ptp(original.astype(int))


def test_reduzir_ruido_preserva_dimensoes():
    ruidosa = np.random.default_rng(42).integers(0, 255, (40, 120, 3), dtype=np.uint8)
    suave = reduzir_ruido(ruidosa)
    assert suave.shape == ruidosa.shape
    assert suave.dtype == np.uint8


def test_ampliar_atinge_altura_minima():
    pequena = np.zeros((20, 60, 3), dtype=np.uint8)
    ampliada = ampliar(pequena, 64)
    assert ampliada.shape[0] == 64


def test_ampliar_nao_altera_imagem_grande():
    grande = np.zeros((100, 300, 3), dtype=np.uint8)
    assert np.array_equal(ampliar(grande, 64), grande)


def test_ampliar_desativado_com_zero():
    pequena = np.zeros((20, 60, 3), dtype=np.uint8)
    assert np.array_equal(ampliar(pequena, 0), pequena)


def test_preparar_recorte_aplica_contraste_e_upscale():
    recorte = _imagem_baixo_contraste()[:20, :60]  # 20px de altura
    preparado = preparar_recorte(recorte)
    assert preparado.shape[0] == settings.anpr_upscale_altura_min
    # O degrau de contraste deve sobreviver ao pipeline completo.
    assert np.ptp(preparado.astype(int)) >= np.ptp(recorte.astype(int))


def test_preparar_recorte_desativado_retorna_original(monkeypatch):
    monkeypatch.setattr(settings, "anpr_preprocessar", False)
    recorte = _imagem_baixo_contraste()
    assert preparar_recorte(recorte) is recorte


def test_preparar_recorte_sem_upscale_quando_altura_min_zero(monkeypatch):
    monkeypatch.setattr(settings, "anpr_upscale_altura_min", 0)
    recorte = _imagem_baixo_contraste()
    preparado = preparar_recorte(recorte)
    assert preparado.shape == recorte.shape
    assert preparado is not recorte  # contraste/denoise ainda aplicados


def test_realcar_imagem_melhora_contraste():
    original = _imagem_baixo_contraste()
    realcada = realcar_imagem(original)
    assert realcada.shape == original.shape
    assert np.ptp(realcada.astype(int)) > np.ptp(original.astype(int))


def test_realcar_imagem_desativada_retorna_original(monkeypatch):
    monkeypatch.setattr(settings, "anpr_preprocessar", False)
    original = _imagem_baixo_contraste()
    assert realcar_imagem(original) is original
