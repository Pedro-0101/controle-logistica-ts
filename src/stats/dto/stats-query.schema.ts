import { z } from 'zod';
import { createZodDto } from 'zod-nest';

/**
 * Filtros opcionais de `GET /stats`.
 *
 * `companyId` restringe monitores, observações e métricas por câmera; o
 * intervalo de datas restringe as observações confirmadas. Métricas globais
 * do Python e do registro automático não são afetadas por esses filtros.
 */
export const statsQuerySchema = z
  .object({
    companyId: z.string().uuid().optional().meta({
      description: 'Filtrar monitores, observações e métricas por empresa',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    dateFrom: z.iso.datetime().optional().meta({
      description: 'Data/hora inicial das observações confirmadas (ISO 8601)',
      examples: ['2026-08-01T00:00:00.000Z'],
    }),
    dateTo: z.iso.datetime().optional().meta({
      description: 'Data/hora final das observações confirmadas (ISO 8601)',
      examples: ['2026-08-31T23:59:59.999Z'],
    }),
  })
  .meta({ id: 'StatsQueryDto' });

export class StatsQueryDto extends createZodDto(statsQuerySchema) {}

export type StatsQueryDtoType = z.infer<typeof statsQuerySchema>;
