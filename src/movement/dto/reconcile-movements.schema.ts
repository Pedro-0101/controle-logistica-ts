import { z } from 'zod';
import { createZodDto } from 'zod-nest';

/**
 * ## ReconcileMovementsDto
 *
 * Payload do endpoint `POST /movement/reconcile`.
 *
 * Reprocessa o pareamento de entrada/saída de um período e recalcula o status
 * dos movimentos confirmados (`open`/`closed`). Útil quando um movimento foi
 * descartado (ou criado) e o par entrada/saída precisa ser reavaliado.
 *
 * **Regras:**
 * - `dateFrom` deve ser anterior ou igual a `dateTo`
 * - O período máximo permitido é de 31 dias
 * - Movimentos `pending_review` e `discarded` não participam do pareamento
 * - Entradas que ficaram sem saída voltam para `open`
 * - Saídas sem entrada correspondente não têm o status alterado
 */
export const reconcileMovementsSchema = z
  .object({
    dateFrom: z.iso.datetime().meta({
      description: 'Data/hora inicial do período a recalcular (ISO 8601)',
      examples: ['2026-09-01T00:00:00.000Z'],
    }),
    dateTo: z.iso.datetime().meta({
      description: 'Data/hora final do período a recalcular (ISO 8601)',
      examples: ['2026-09-18T23:59:59.999Z'],
    }),
    companyId: z.string().uuid().optional().meta({
      description:
        'UUID da empresa alvo. Obrigatório para admin global (sem empresa); ignorado para usuários vinculados a uma empresa.',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
  })
  .meta({ id: 'ReconcileMovementsDto' });

export class ReconcileMovementsDto extends createZodDto(reconcileMovementsSchema) {}

export type ReconcileMovementsDtoType = z.infer<typeof reconcileMovementsSchema>;
