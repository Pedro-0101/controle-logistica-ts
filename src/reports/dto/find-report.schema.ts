import { z } from 'zod';
import { createZodDto } from 'zod-nest';

const rangeFields = {
  dateFrom: z.iso.datetime().optional().meta({
    description: 'Data/hora inicial do relatório (ISO 8601). Padrão: 7 dias antes de dateTo.',
    examples: ['2026-09-01T00:00:00.000Z'],
  }),
  dateTo: z.iso.datetime().optional().meta({
    description: 'Data/hora final do relatório (ISO 8601). Padrão: agora.',
    examples: ['2026-09-08T00:00:00.000Z'],
  }),
  vehicleId: z.string().uuid().optional().meta({
    description: 'Filtrar por veículo (frota própria).',
    examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
  }),
  adminUnityId: z.string().uuid().optional().meta({
    description: 'Filtrar por unidade administrativa.',
    examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
  }),
  pointId: z.string().uuid().optional().meta({
    description: 'Filtrar por ponto (portão).',
    examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
  }),
};

export const findReportSchema = z.object({ ...rangeFields }).meta({ id: 'FindReportDto' });
export class FindReportDto extends createZodDto(findReportSchema) {}
export type FindReportDtoType = z.infer<typeof findReportSchema>;

export const findVehicleTimelineSchema = z
  .object({ ...rangeFields })
  .meta({ id: 'FindVehicleTimelineDto' });
export class FindVehicleTimelineDto extends createZodDto(findVehicleTimelineSchema) {}

export const findMovementBookSchema = z
  .object({
    ...rangeFields,
    format: z.enum(['json', 'csv']).default('json').meta({
      description: 'Formato de saída. csv gera o arquivo para download.',
      examples: ['json'],
    }),
  })
  .meta({ id: 'FindMovementBookDto' });
export class FindMovementBookDto extends createZodDto(findMovementBookSchema) {}
export type FindMovementBookDtoType = z.infer<typeof findMovementBookSchema>;
