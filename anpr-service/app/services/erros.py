"""Exceções de domínio mapeadas para respostas HTTP."""


class PlacaNaoReconhecidaError(Exception):
    """Placa não foi reconhecida pelo OCR nem informada no corpo."""


class CameraNaoConfiguradaError(Exception):
    """A câmera não possui URL de snapshot configurada nem foi descoberta."""


class CameraSnapshotError(Exception):
    """Falha ao obter o snapshot da câmera (rede, autenticação ou resposta inválida)."""
