"""Testes da votação multi-frame na confirmação de placas do CameraMonitor."""

import time
from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest

from app.anpr.plate import Placa
from app.anpr.recognizer import CandidatoPlaca
from app.routers.monitors import CameraMonitor
from app.schemas import MonitorIn


@pytest.fixture
def criar_monitor(monkeypatch):
    monkeypatch.setattr("app.routers.monitors.SnapshotClient", lambda config: MagicMock())

    def factory(confirmation_reads=2, stale_after_seconds=5):
        config = MonitorIn(
            host="camera",
            confirmation_reads=confirmation_reads,
            stale_after_seconds=stale_after_seconds,
        )
        return CameraMonitor("cam1", config, None)

    return factory


def ler(monitor, placa, confianca=0.9):
    """Simula uma inferência confirmada com a placa informada."""
    resultado = CandidatoPlaca(Placa(placa, "mercosul"), confianca, placa, (1, 2, 30, 12))
    monitor.accept(resultado, None, monitor.epoch, datetime.now(UTC), time.monotonic(), b"jpg")


def ler_vazio(monitor):
    """Simula uma inferência sem placa detectada (frame em branco)."""
    monitor.accept(None, None, monitor.epoch, datetime.now(UTC), time.monotonic(), b"jpg")


def test_confirma_apos_leituras_suficientes(criar_monitor):
    monitor = criar_monitor(confirmation_reads=2)
    ler(monitor, "ABC1D23")
    assert monitor.state()["status"] == "candidate"
    ler(monitor, "ABC1D23")
    estado = monitor.state()
    assert estado["status"] == "confirmed"
    assert estado["placa"] == "ABC1D23"
    assert estado["consecutiveReads"] == 2


def test_misread_pontual_nao_zera_confirmacao(criar_monitor):
    monitor = criar_monitor(confirmation_reads=2)
    ler(monitor, "ABC1D23")
    ler(monitor, "ABC1D23")
    assert monitor.state()["status"] == "confirmed"
    ler(monitor, "XYZ9X99")  # leitura errada pontual do OCR
    estado = monitor.state()
    assert estado["placa"] == "ABC1D23"  # continua sendo a mais votada
    assert estado["status"] == "confirmed"
    assert estado["consecutiveReads"] == 2


def test_troca_para_placa_mais_votada(criar_monitor):
    monitor = criar_monitor(confirmation_reads=2)
    ler(monitor, "ABC1D23")
    ler(monitor, "ABC1D23")
    observacao_anterior = monitor.observation_id
    assert monitor.state()["status"] == "confirmed"
    # Novo veículo: leituras da nova placa superam a antiga na janela.
    ler(monitor, "XYZ9X99")
    ler(monitor, "XYZ9X99")
    ler(monitor, "XYZ9X99")
    estado = monitor.state()
    assert estado["placa"] == "XYZ9X99"
    assert estado["status"] == "confirmed"  # 3 votos na janela >= 2
    assert monitor.observation_id != observacao_anterior


def test_nova_placa_fica_candidata_ate_acumular_votos(criar_monitor):
    monitor = criar_monitor(confirmation_reads=3)
    ler(monitor, "ABC1D23")
    ler(monitor, "ABC1D23")
    ler(monitor, "ABC1D23")
    assert monitor.state()["status"] == "confirmed"
    ler(monitor, "XYZ9X99")
    estado = monitor.state()
    # XYZ tem 1 voto, ABC ainda tem 3 na janela: não troca ainda.
    assert estado["placa"] == "ABC1D23"
    assert estado["status"] == "confirmed"


def test_frame_vazio_zera_votos_quando_candidata(criar_monitor):
    monitor = criar_monitor(confirmation_reads=2)
    ler(monitor, "ABC1D23")
    assert monitor.state()["status"] == "candidate"
    ler_vazio(monitor)
    estado = monitor.state()
    assert estado["status"] == "candidate"
    assert estado["consecutiveReads"] == 0
    assert monitor.historico == []


def test_frame_vazio_tolerado_quando_confirmada(criar_monitor):
    monitor = criar_monitor(confirmation_reads=2)
    ler(monitor, "ABC1D23")
    ler(monitor, "ABC1D23")
    assert monitor.state()["status"] == "confirmed"
    ler_vazio(monitor)
    estado = monitor.state()
    assert estado["status"] == "confirmed"
    assert estado["consecutiveReads"] == 2  # votos preservados


def test_erro_de_inferencia_invalida_para_offline(criar_monitor):
    monitor = criar_monitor(confirmation_reads=2)
    ler(monitor, "ABC1D23")
    monitor.accept(None, RuntimeError("falha"), monitor.epoch,
                   datetime.now(UTC), time.monotonic(), b"jpg")
    estado = monitor.state()
    assert estado["status"] == "offline"
    assert estado["placa"] is None


def test_observacao_expira_como_stale(criar_monitor, monkeypatch):
    monitor = criar_monitor(confirmation_reads=2, stale_after_seconds=5)
    relogio = [1000.0]
    monkeypatch.setattr("app.routers.monitors.time.monotonic", lambda: relogio[0])

    def ler_no_relogio(placa):
        resultado = CandidatoPlaca(Placa(placa, "mercosul"), .9, placa, None)
        monitor.accept(resultado, None, monitor.epoch,
                       datetime.now(UTC), relogio[0], b"jpg")

    ler_no_relogio("ABC1D23")
    ler_no_relogio("ABC1D23")
    assert monitor.state()["status"] == "confirmed"
    relogio[0] += 10  # avança o relógio além do stale_after
    estado = monitor.state()
    assert estado["status"] == "stale"
    assert estado["placa"] is None


def test_epoch_diferente_descarta_resultado(criar_monitor):
    monitor = criar_monitor(confirmation_reads=2)
    resultado = CandidatoPlaca(Placa("ABC1D23", "mercosul"), .9, "ABC1D23", None)
    monitor.accept(resultado, None, epoch=999,
                   captured=datetime.now(UTC), monotonic=time.monotonic(), jpeg=b"jpg")
    estado = monitor.state()
    assert estado["status"] == "waiting"
    assert estado["placa"] is None
