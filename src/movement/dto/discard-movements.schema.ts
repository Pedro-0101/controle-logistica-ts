import { z } from 'zod';
import { createZodDto } from 'zod-nest';

/**
 * ## DiscardMovementsDto
 *
 * Schema de entrada para o endpoint `POST /movement/discard`.
 *
 * **Contexto:** o operador pode marcar movimentos `pending_review` como
 * `discarded` quando a leitura é incorreta (falso positivo do OCR) ou o registro
 * não representa uma movimentação real.
 *
 * **Regras:**
 * - Informe de 1 a 500 IDs de movimentos (seleção múltipla no front)
 * - Apenas movimentos com status `pending_review` podem ser descartados
 * - O descarte é sempre individual: só os IDs informados são afetados, mesmo
 *   que existam outros pendentes com a mesma placa
 */
export const discardMovementsSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(500).meta({
      description: 'Lista de UUIDs dos movimentos pendentes a descartar (seleção múltipla).',
      examples: [['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b']],
    }),
  })
  .meta({
    id: 'DiscardMovementsDto',
    description:
      'Payload para descarte em lote de movimentos pendentes de revisão.\n\n' +
      'Marque como `discarded` os movimentos selecionados no front (ex.: leitura ' +
      'incorreta do OCR). Diferente do recálculo, o descarte afeta **somente** os ' +
      'IDs informados — outros pendentes com a mesma placa não são alterados.',
  });

export class DiscardMovementsDto extends createZodDto(discardMovementsSchema) {}
