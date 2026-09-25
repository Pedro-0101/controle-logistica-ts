import { BadRequestException } from '@nestjs/common';

/**
 * Normalização de placas brasileiras.
 *
 * Dois contratos convivem aqui:
 * - `normalizePlate`: entrada do usuário — canônica e estrita (lança 400 quando
 *   o formato é inválido).
 * - `normalizarPlaca` (em `anpr/plate.ts`): texto bruto do OCR — tolerante,
 *   tenta corrigir confusões de caracteres e devolve `null` quando não
 *   identifica uma placa.
 *
 * As regexes e o tipo `Placa` são compartilhados para evitar divergência entre
 * as duas rotas.
 */
export type PlacaFormato = 'mercosul' | 'antiga';

export interface Placa {
  valor: string;
  formato: PlacaFormato;
}

/** Mercosul: LLLNLNN (ex.: ABC1D23). */
export const MERCOSUL_RE = /^[A-Z]{3}\d[A-Z]\d{2}$/;
/** Antiga: LLLNNNN (ex.: ABC1234). */
export const PLACA_ANTIGA_RE = /^[A-Z]{3}\d{4}$/;

/** Canonicalize spelling only. Never guess OCR substitutions for user input. */
export function normalizePlate(value: string): string {
  const plate = value.trim().toUpperCase();
  if (!/^[A-Z]{3}-?\d{4}$/.test(plate) && !MERCOSUL_RE.test(plate)) {
    throw new BadRequestException('Placa inválida: informe ABC1234 ou ABC1D23');
  }
  return plate.replace('-', '');
}
