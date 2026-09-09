"""Testes de normalização e validação de placas brasileiras."""

from app.anpr.plate import Placa, normalizar_placa


def test_normaliza_placa_mercosul_valida():
    assert normalizar_placa("ABC1D23") == Placa("ABC1D23", "mercosul")


def test_normaliza_placa_antiga_valida():
    assert normalizar_placa("ABC1234") == Placa("ABC1234", "antiga")


def test_ignora_minusculas_e_separadores():
    assert normalizar_placa("abc-1234") == Placa("ABC1234", "antiga")


def test_corrige_confusoes_de_ocr_digito_no_lugar_de_letra():
    assert normalizar_placa("4BC1234") == Placa("ABC1Z34", "mercosul")


def test_encontra_placa_dentro_de_texto_com_espacos():
    assert normalizar_placa("veículo ABC1D23 passando") == Placa("ABC1D23", "mercosul")


def test_retorna_none_para_texto_vazio():
    assert normalizar_placa("") is None


def test_retorna_none_para_palavra_longas_sem_formato():
    assert normalizar_placa("TERRAPLENAGEM") is None


def test_retorna_none_para_texto_sem_placa():
    assert normalizar_placa("sem placa aqui") is None


def test_formata_placa_antiga_com_hifen():
    assert Placa("ABC1234", "antiga").formatar() == "ABC-1234"


def test_formata_placa_mercosul_sem_hifen():
    assert Placa("ABC1D23", "mercosul").formatar() == "ABC1D23"
