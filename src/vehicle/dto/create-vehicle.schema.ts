import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const createVehicleSchema = z.object({
  plate: z.string().min(1, 'Plate is required').meta({
    description: 'Placa do veículo (deve ser única)',
    examples: ['ABC1D23'],
  }),
  code: z.string().min(1, 'Code is required').optional().meta({
    description:
      'Código identificador do veículo (deve ser único). Obrigatório para veículos próprios (own); ' +
      'para terceiros (thirdParty) e visitantes (visitor) é calculado automaticamente pelo backend.',
    examples: ['VEH-001'],
  }),
  type: z.enum(['own', 'thirdParty', 'visitor']).default('own').meta({
    description: 'Tipo do veículo no sistema',
    examples: ['own'],
    default: 'own',
  }),
  active: z.boolean().default(true).meta({
    description: 'Indica se o veículo está ativo',
    examples: [true],
    default: 'true',
  }),
}).superRefine((value, ctx) => {
  if (value.type === 'own' && !value.code?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['code'],
      message: 'Code is required for own vehicles',
    });
  }
}).meta({ id: 'CreateVehicleDto' });

export class CreateVehicleDto extends createZodDto(createVehicleSchema) {}

export type CreateVehicleDtoType = z.infer<typeof createVehicleSchema>;
