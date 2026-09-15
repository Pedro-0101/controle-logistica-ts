"""Normalização e validação de placas brasileiras (Mercosul e modelo antigo)."""

import re
from dataclasses import dataclass

# Mercosul: LLLNLNN (ex: ABC1D23)
# Antiga:   LLLNNNN (ex: ABC1234)
MERCOSUL_RE = re.compile(r"^[A-Z]{3}\d[A-Z]\d{2}$")
ANTIGA_RE = re.compile(r"^[A-Z]{3}\d{4}$")

# Caracteres de dígito que o OCR costuma entregar onde deveria haver letra.
DIGITO_PARA_LETRA = {
    "0": "O",
    "1": "I",
    "2": "Z",
    "3": "E",
    "4": "A",
    "5": "S",
    "6": "G",
    "7": "T",
    "8": "B",
    "9": "Q",
}
# Caracteres de letra que o OCR costuma entregar onde deveria haver dígito.
LETRA_PARA_DIGITO = {
    "O": "0",
    "Q": "0",
    "D": "0",
    "I": "1",
    "L": "1",
    "J": "1",
    "Z": "2",
    "E": "3",
    "A": "4",
    "S": "5",
    "G": "6",
    "T": "7",
    "B": "8",
}

MERCOSUL_POS = "LLLNLNN"
ANTIGA_POS = "LLLNNNN"


@dataclass(frozen=True)
class Placa:
    valor: str  # placa normalizada, ex: "ABC1D23"
    formato: str  # "mercosul" | "antiga"

    def formatar(self) -> str:
        return (
            self.valor
            if self.formato == "mercosul"
            else f"{self.valor[:3]}-{self.valor[3:]}"
        )


def _ajustar(texto: str, padrao: str) -> tuple[str, int] | None:
    """Corrige confusões de OCR posição a posição.

    Retorna `(placa_ajustada, quantidade_de_correcoes)` ou None se não for
    possível ajustar ao padrão informado. O número de correções permite
    escolher, entre dois formatos válidos, o mais provável.
    """
    saida: list[str] = []
    correcoes = 0
    for ch, tipo in zip(texto, padrao, strict=True):
        if tipo == "L":
            if ch.isalpha():
                saida.append(ch)
            elif ch in DIGITO_PARA_LETRA:
                saida.append(DIGITO_PARA_LETRA[ch])
                correcoes += 1
            else:
                return None
        else:  # "N"
            if ch.isdigit():
                saida.append(ch)
            elif ch in LETRA_PARA_DIGITO:
                saida.append(LETRA_PARA_DIGITO[ch])
                correcoes += 1
            else:
                return None

    resultado = "".join(saida)
    if padrao == MERCOSUL_POS and MERCOSUL_RE.match(resultado):
        return resultado, correcoes
    if padrao == ANTIGA_POS and ANTIGA_RE.match(resultado):
        return resultado, correcoes
    return None


def _classificar(texto: str) -> Placa | None:
    if len(texto) != 7:
        return None
    if MERCOSUL_RE.match(texto):
        return Placa(valor=texto, formato="mercosul")
    if ANTIGA_RE.match(texto):
        return Placa(valor=texto, formato="antiga")
    # Só tenta corrigir confusões do OCR se já houver pelo menos 2 dígitos,
    # evitando falso positivo em palavras (ex.: "TERRAPLENAGEM").
    if sum(c.isdigit() for c in texto) < 2:
        return None
    # Quando ambos os formatos são possíveis, escolhe o que exige menos
    # correções de OCR — cada correção é uma chance adicional de erro.
    melhor: tuple[str, str, int] | None = None
    for padrao in (MERCOSUL_POS, ANTIGA_POS):
        ajuste = _ajustar(texto, padrao)
        if ajuste is None:
            continue
        formato = "mercosul" if padrao == MERCOSUL_POS else "antiga"
        if melhor is None or ajuste[1] < melhor[2]:
            melhor = (ajuste[0], formato, ajuste[1])
    if melhor is not None:
        return Placa(valor=melhor[0], formato=melhor[1])
    return None


def normalizar_placa(raw: str) -> Placa | None:
    """Normaliza uma string bruta do OCR para uma Placa válida (ou None)."""
    if not raw:
        return None
    s = raw.upper()
    # 1) string inteira, sem separadores
    completo = re.sub(r"[^A-Z0-9]", "", s)
    if len(completo) == 7:
        resultado = _classificar(completo)
        if resultado:
            return resultado
    # 2) cada palavra (separada por espaço) — evita achar placa dentro de texto longo
    for palavra in s.split():
        limpo = re.sub(r"[^A-Z0-9]", "", palavra)
        resultado = _classificar(limpo)
        if resultado:
            return resultado
    return None
