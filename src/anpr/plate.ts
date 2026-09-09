export type PlacaFormato = 'mercosul' | 'antiga';

export interface Placa {
  valor: string;
  formato: PlacaFormato;
}

const MERCOSUL_RE = /^[A-Z]{3}\d[A-Z]\d{2}$/;
const ANTIGA_RE = /^[A-Z]{3}\d{4}$/;

const DIGITO_PARA_LETRA: Record<string, string> = {
  '0': 'O',
  '1': 'I',
  '2': 'Z',
  '3': 'E',
  '4': 'A',
  '5': 'S',
  '6': 'G',
  '7': 'T',
  '8': 'B',
  '9': 'Q',
};

const LETRA_PARA_DIGITO: Record<string, string> = {
  O: '0',
  Q: '0',
  D: '0',
  I: '1',
  L: '1',
  Z: '2',
  E: '3',
  A: '4',
  S: '5',
  G: '6',
  T: '7',
  B: '8',
};

const MERCOSUL_POS = 'LLLNLNN';
const ANTIGA_POS = 'LLLNNNN';

function ajustar(texto: string, padrao: string): string | null {
  const saida: string[] = [];
  for (let i = 0; i < padrao.length; i++) {
    const ch = texto[i];
    const tipo = padrao[i];
    if (tipo === 'L') {
      if (/[A-Z]/.test(ch)) {
        saida.push(ch);
      } else if (ch in DIGITO_PARA_LETRA) {
        saida.push(DIGITO_PARA_LETRA[ch]);
      } else {
        return null;
      }
    } else {
      if (/\d/.test(ch)) {
        saida.push(ch);
      } else if (ch in LETRA_PARA_DIGITO) {
        saida.push(LETRA_PARA_DIGITO[ch]);
      } else {
        return null;
      }
    }
  }

  const resultado = saida.join('');
  if (padrao === MERCOSUL_POS && MERCOSUL_RE.test(resultado)) {
    return resultado;
  }
  if (padrao === ANTIGA_POS && ANTIGA_RE.test(resultado)) {
    return resultado;
  }
  return null;
}

function classificar(texto: string): Placa | null {
  if (texto.length !== 7) {
    return null;
  }
  if (MERCOSUL_RE.test(texto)) {
    return { valor: texto, formato: 'mercosul' };
  }
  if (ANTIGA_RE.test(texto)) {
    return { valor: texto, formato: 'antiga' };
  }
  const digitos = (texto.match(/\d/g) ?? []).length;
  if (digitos < 2) {
    return null;
  }
  for (const padrao of [MERCOSUL_POS, ANTIGA_POS]) {
    const corrigido = ajustar(texto, padrao);
    if (corrigido) {
      return {
        valor: corrigido,
        formato: padrao === MERCOSUL_POS ? 'mercosul' : 'antiga',
      };
    }
  }
  return null;
}

export function normalizarPlaca(raw: string): Placa | null {
  if (!raw) {
    return null;
  }
  const s = raw.toUpperCase();
  const completo = s.replace(/[^A-Z0-9]/g, '');
  if (completo.length === 7) {
    const resultado = classificar(completo);
    if (resultado) {
      return resultado;
    }
  }
  for (const palavra of s.split(/\s+/)) {
    const limpo = palavra.replace(/[^A-Z0-9]/g, '');
    const resultado = classificar(limpo);
    if (resultado) {
      return resultado;
    }
  }
  return null;
}
