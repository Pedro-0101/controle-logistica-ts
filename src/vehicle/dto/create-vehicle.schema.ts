import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const createVehicleSchema = z.object({
  plate: z.string().min(1, 'Plate is required').meta({
    description: 'Placa do veículo (deve ser única)',
    examples: ['ABC1D23'],
  }),
  code: z.string().min(1, 'Code is required').meta({
    description: 'Código identificador do veículo (deve ser único)',
    examples: ['VEH-001'],
  }),
  type: z.enum(['own', 'thirdParty', 'visitor']).default('own').meta({
    description: 'Tipo do veículo no sistema',
    examples: ['own'],
    default: 'own',
  }),
  companyId: z.string().min(1, 'Company ID is required').meta({
    description: 'ID da empresa vinculada ao veículo',
    examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
  }),
  active: z.boolean().default(true).meta({
    description: 'Indica se o veículo está ativo',
    examples: [true],
    default: 'true',
  }),
}).meta({ id: 'CreateVehicleDto' });

export class CreateVehicleDto extends createZodDto(createVehicleSchema) {}

export type CreateVehicleDtoType = z.infer<typeof createVehicleSchema>;
