import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const createMovementSchema = z.object({
  pointId: z.string().optional().meta({
    description: 'ID do ponto vinculado ao movimento',
    examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
  }),
  vehicleId: z.string().min(1, 'Vehicle ID is required').meta({
    description: 'ID do veículo vinculado ao movimento',
    examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
  }),
  type: z.enum(['entry', 'exit']).meta({
    description: 'Tipo do movimento (entrada ou saída)',
    examples: ['entry'],
  }),
  dateTime: z.iso.datetime().meta({
    description: 'Data e hora em que o movimento ocorreu',
    examples: ['2026-08-29T12:00:00.000Z'],
  }),
  status: z.enum(['open', 'closed']).default('open').meta({
    description: 'Status do movimento',
    examples: ['open'],
    default: 'open',
  }),
  companyId: z.string().min(1, 'Company ID is required').meta({
    description: 'ID da empresa vinculada ao movimento',
    examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
  }),
  purpose: z.string().optional().meta({
    description: 'Motivo do movimento',
    examples: ['Entrega de mercadoria'],
  }),
  driverName: z.string().optional().meta({
    description: 'Nome do motorista/condutor do veículo',
    examples: ['João Silva'],
  }),
  notes: z.string().optional().meta({
    description: 'Observações sobre o movimento',
    examples: ['Cliente aguardando no portão 2'],
  }),
}).meta({ id: 'CreateMovementDto' });

export class CreateMovementDto extends createZodDto(createMovementSchema) {}

export type CreateMovementDtoType = z.infer<typeof createMovementSchema>;
