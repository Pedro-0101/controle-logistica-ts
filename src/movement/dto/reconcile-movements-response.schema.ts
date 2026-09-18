import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const reconcileMovementsChangeSchema = z.object({
  id: z.string().meta({ description: 'UUID do movimento alterado' }),
  vehicleId: z.string().nullable().meta({ description: 'UUID do veículo' }),
  pointId: z.string().nullable().meta({ description: 'UUID do ponto' }),
  type: z.enum(['entry', 'exit']).meta({ description: 'Tipo do movimento' }),
  dateTime: z.iso.datetime().meta({ description: 'Data/hora do movimento (ISO 8601)' }),
  previousStatus: z.enum(['open', 'closed']).meta({ description: 'Status anterior' }),
  status: z.enum(['open', 'closed']).meta({ description: 'Novo status' }),
});

/**
 * ## ReconcileMovementsResponseDto
 *
 * Resumo do reprocessamento em lote de movimentos.
 */
export const reconcileMovementsResponseSchema = z
  .object({
    range: z.object({
      dateFrom: z.string(),
      dateTo: z.string(),
    }),
    companyId: z.string().meta({ description: 'UUID da empresa processada' }),
    analyzed: z.number().meta({ description: 'Total de movimentos confirmados analisados' }),
    closed: z.number().meta({ description: 'Movimentos que passaram para closed' }),
    reopened: z.number().meta({ description: 'Movimentos que voltaram para open' }),
    unchanged: z.number().meta({ description: 'Movimentos que permaneceram com o mesmo status' }),
    unmatchedExits: z.number().meta({ description: 'Saídas sem entrada correspondente (não alteradas)' }),
    movements: z.array(reconcileMovementsChangeSchema).meta({
      description: 'Detalhes apenas dos movimentos alterados',
    }),
  })
  .meta({ id: 'ReconcileMovementsResponseDto' });

export class ReconcileMovementsResponseDto extends createZodDto(
  reconcileMovementsResponseSchema,
) {}
