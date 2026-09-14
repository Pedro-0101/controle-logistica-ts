import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const findMovementsSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({
      description: 'Número da página (começa em 1)',
      examples: [1],
    }),
    limit: z.coerce.number().int().min(1).max(100).default(20).meta({
      description: 'Quantidade de registros por página (máx. 100)',
      examples: [20],
    }),
    type: z.enum(['entry', 'exit']).optional().meta({
      description: 'Filtrar por tipo de movimento',
      examples: ['entry'],
    }),
    status: z.enum(['open', 'closed', 'pending_review']).optional().meta({
      description: 'Filtrar por status do movimento',
      examples: ['open'],
    }),
    pointId: z.string().uuid().optional().meta({
      description: 'Filtrar por ID do ponto',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    vehicleId: z.string().uuid().optional().meta({
      description: 'Filtrar por ID do veículo',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    plate: z.string().optional().meta({
      description: 'Filtrar pela placa do veículo (busca parcial, case-insensitive)',
      examples: ['ABC1D23'],
    }),
    driverName: z.string().optional().meta({
      description: 'Filtrar pelo nome do motorista (busca parcial, case-insensitive)',
      examples: ['João Silva'],
    }),
    purpose: z.string().optional().meta({
      description: 'Filtrar pelo motivo do movimento (busca parcial, case-insensitive)',
      examples: ['Entrega'],
    }),
    autoRegistered: z.coerce.boolean().optional().meta({
      description: 'Filtrar por movimentos auto-registrados (true) ou manuais (false)',
      examples: [true],
    }),
    dateFrom: z.iso.datetime().optional().meta({
      description: 'Data/hora inicial para filtro (ISO 8601)',
      examples: ['2026-08-01T00:00:00.000Z'],
    }),
    dateTo: z.iso.datetime().optional().meta({
      description: 'Data/hora final para filtro (ISO 8601)',
      examples: ['2026-08-31T23:59:59.999Z'],
    }),
    search: z.string().optional().meta({
      description: 'Busca livre: pesquisa por placa, nome do motorista, motivo ou notas',
      examples: ['ABC'],
    }),
    orderBy: z.enum(['dateTime', 'createdAt', 'status', 'type']).default('dateTime').meta({
      description: 'Campo para ordenação',
      examples: ['dateTime'],
    }),
    order: z.enum(['ASC', 'DESC']).default('DESC').meta({
      description: 'Direção da ordenação',
      examples: ['DESC'],
    }),
  })
  .meta({ id: 'FindMovementsDto' });

export class FindMovementsDto extends createZodDto(findMovementsSchema) {}

export type FindMovementsDtoType = z.infer<typeof findMovementsSchema>;
