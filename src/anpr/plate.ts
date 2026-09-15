/**
 * Normalização de placas brasileiras (Mercosul e formato antigo).
 *
 * O OCR (PaddleOCR) lê a placa da imagem e retorna um texto "sujo": pode vir
 * com espaços, pontuação ou caracteres trocados (o OCR confunde frequentemente
 * dígitos com letras, ex.: "0" x "O", "1" x "I", "5" x "S").
 *
 * Este módulo pega esse texto bruto e devolve uma placa válida e padronizada,
 * no formato:
 *   - Mercosul: `ABC1D23` (3 letras, 1 dígito, 1 letra, 2 dígitos)
 *   - Antigo:   `ABC1234` (3 letras, 4 dígitos)
 *
 * Se não for possível identificar uma placa válida, retorna `null`.
 */
export type PlacaFormato = 'mercosul' | 'antiga';

export interface Placa {
  valor: string;
  formato: PlacaFormato;
}

/** Padrões dos dois formatos de placa vigentes no Brasil. */
const MERCOSUL_RE = /^[A-Z]{3}\d[A-Z]\d{2}$/;
const ANTIGA_RE = /^[A-Z]{3}\d{4}$/;

/**
 * Mapeia dígitos que o OCR costuma ler como letras para a letra correta.
 * Usado quando a posição na placa exige uma LETRA.
 */
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

/**
 * Mapeia letras que o OCR costuma ler como dígitos para o dígito correto.
 * Usado quando a posição na placa exige um DÍGITO.
 */
const LETRA_PARA_DIGITO: Record<string, string> = {
  O: '0',
  Q: '0',
  D: '0',
  I: '1',
  L: '1',
  J: '1',
  Z: '2',
  E: '3',
  A: '4',
  S: '5',
  G: '6',
  T: '7',
  B: '8',
};

/**
 * Posição esperada de cada caractere: `L` = letra, `N` = número.
 * Mercosul = LLL N L NN ; Antiga = LLL NNNN.
 */
const MERCOSUL_POS = 'LLLNLNN';
const ANTIGA_POS = 'LLLNNNN';

/**
 * Tenta "consertar" um texto de 7 caracteres seguindo o padrão de posições
 * informado. Em cada posição, aceita o caractere correto ou converte o
 * caractere errado (dígito↔letra) usando as tabelas acima. Retorna `null` se
 * não for possível ajustar; senão, retorna o valor ajustado e quantas
 * correções foram necessárias (permite escolher o formato mais provável).
 */
function ajustar(texto: string, padrao: string): { valor: string; correcoes: number } | null {
  const saida: string[] = [];
  let correcoes = 0;
  for (let i = 0; i < padrao.length; i++) {
    const ch = texto[i];
    const tipo = padrao[i];
    if (tipo === 'L') {
      if (/[A-Z]/.test(ch)) {
        saida.push(ch);
      } else if (ch in DIGITO_PARA_LETRA) {
        saida.push(DIGITO_PARA_LETRA[ch]);
        correcoes++;
      } else {
        return null;
      }
    } else {
      if (/\d/.test(ch)) {
        saida.push(ch);
      } else if (ch in LETRA_PARA_DIGITO) {
        saida.push(LETRA_PARA_DIGITO[ch]);
        correcoes++;
      } else {
        return null;
      }
    }
  }

  const resultado = saida.join('');
  if (padrao === MERCOSUL_POS && MERCOSUL_RE.test(resultado)) {
    return { valor: resultado, correcoes };
  }
  if (padrao === ANTIGA_POS && ANTIGA_RE.test(resultado)) {
    return { valor: resultado, correcoes };
  }
  return null;
}

/**
 * Classifica um texto já limpo (somente A-Z e 0-9) como placa Mercosul ou
 * antiga. Tenta primeiro o "match" exato; se falhar, tenta corrigir as
 * posições trocadas pelo OCR. Só tenta corrigir quando há pelo menos 2 dígitos
 * (evita tratar palavras comuns como placa). Quando ambos os formatos são
 * possíveis, escolhe o que exige menos correções — cada correção é uma chance
 * adicional de erro.
 */
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
  let melhor: Placa | null = null;
  let melhorCorrecoes = Infinity;
  for (const padrao of [MERCOSUL_POS, ANTIGA_POS]) {
    const ajuste = ajustar(texto, padrao);
    if (ajuste && ajuste.correcoes < melhorCorrecoes) {
      melhor = {
        valor: ajuste.valor,
        formato: padrao === MERCOSUL_POS ? 'mercosul' : 'antiga',
      };
      melhorCorrecoes = ajuste.correcoes;
    }
  }
  return melhor;
}

/**
 * Ponto de entrada da normalização. Recebe o texto bruto do OCR e:
 *   1. Remove tudo que não for letra/número (espaços, hífens, etc.);
 *   2. Tenta classificar o texto completo;
 *   3. Se falhar, tenta classificar cada "palavra" isolada (o OCR às vezes
 *      separa a placa em pedaços ou inclui outros textos ao redor).
 */
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
