"""Testes da resolução do modelo YOLO (sem carregar pesos)."""

from app.anpr import detector


def test_modelo_do_env_tem_prioridade(monkeypatch):
    monkeypatch.setattr(detector.settings, "anpr_yolo_model", "meu-modelo.pt")
    assert detector._resolver_modelo() == "meu-modelo.pt"


def test_usa_weights_local_quando_existe(monkeypatch, tmp_path):
    monkeypatch.setattr(detector.settings, "anpr_yolo_model", "")
    monkeypatch.setattr(detector, "BASE_DIR", tmp_path)
    (tmp_path / "weights").mkdir()
    (tmp_path / "weights" / "best.pt").write_bytes(b"x")
    assert detector._resolver_modelo() == str(tmp_path / "weights" / "best.pt")


def test_cai_para_url_huggingface_sem_weights_local(monkeypatch, tmp_path):
    monkeypatch.setattr(detector.settings, "anpr_yolo_model", "")
    monkeypatch.setattr(detector, "BASE_DIR", tmp_path)  # sem weights/best.pt
    assert detector._resolver_modelo() == detector.URL_MODELO_HUGGINGFACE
