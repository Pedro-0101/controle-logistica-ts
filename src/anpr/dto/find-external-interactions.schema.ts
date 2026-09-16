import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const findExternalInteractionsSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({
      description: 'Número da página (começa em 1)',
      examples: [1],
    }),
    limit: z.coerce.number().int().min(1).max(100).default(20).meta({
      description: 'Quantidade de registros por página (máx. 100)',
      examples: [20],
    }),
    provider: z.string().optional().meta({
      description: 'Filtrar por provider externo (ex.: google_vision)',
      examples: ['google_vision'],
    }),
    companyId: z.string().uuid().optional().meta({
      description: 'Filtrar por empresa (usado pelo admin global; ignorado/limitado ao escopo nas rotas de empresa)',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    mode: z.enum(['local', 'verified', 'external']).optional().meta({
      description: 'Filtrar pelo modo de reconhecimento vigente na chamada',
      examples: ['verified'],
    }),
    outcome: z
      .enum(['success', 'no_plate', 'low_confidence', 'timeout', 'error', 'rate_limited'])
      .optional()
      .meta({
        description: 'Filtrar pelo resultado da chamada',
        examples: ['success'],
      }),
    finalSource: z
      .enum(['external', 'local', 'local_fallback', 'none'])
      .optional()
      .meta({
        description: 'Filtrar pela origem da placa final usada no movimento',
        examples: ['external'],
      }),
    cameraId: z.string().uuid().optional().meta({
      description: 'Filtrar por ID da câmera',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    observationId: z.string().uuid().optional().meta({
      description: 'Filtrar por ID da observação ANPR',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    dateFrom: z.iso.datetime().optional().meta({
      description: 'Data/hora inicial da chamada (ISO 8601)',
      examples: ['2026-08-01T00:00:00.000Z'],
    }),
    dateTo: z.iso.datetime().optional().meta({
      description: 'Data/hora final da chamada (ISO 8601)',
      examples: ['2026-08-31T23:59:59.999Z'],
    }),
  })
  .meta({ id: 'FindExternalInteractionsDto' });

export class FindExternalInteractionsDto extends createZodDto(findExternalInteractionsSchema) {}

export type FindExternalInteractionsDtoType = z.infer<typeof findExternalInteractionsSchema>;
