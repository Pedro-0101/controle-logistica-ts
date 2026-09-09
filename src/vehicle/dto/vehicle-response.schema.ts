import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const vehicleResponseSchema = z
  .object({
    id: z.string().meta({
      description: 'UUID único do veículo',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    plate: z.string().meta({
      description: 'Placa do veículo (deve ser única)',
      examples: ['ABC1D23'],
    }),
    code: z.string().meta({
      description: 'Código identificador do veículo (deve ser único)',
      examples: ['VEH-001'],
    }),
    type: z.enum(['own', 'thirdParty', 'visitor']).meta({
      description: 'Tipo do veículo no sistema',
      examples: ['own'],
    }),
    companyId: z.string().meta({
      description: 'ID da empresa vinculada ao veículo',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    active: z.boolean().meta({
      description: 'Indica se o veículo está ativo',
      examples: [true],
    }),
    createdById: z.string().meta({
      description: 'ID do usuário que criou o registro',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    updatedById: z.string().nullish().meta({
      description: 'ID do último usuário que atualizou o registro',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    createdAt: z.iso.datetime().meta({
      description: 'Data e hora da criação do registro',
      examples: ['2026-08-29T12:00:00.000Z'],
    }),
    updatedAt: z.iso.datetime().meta({
      description: 'Data e hora da última atualização do registro',
      examples: ['2026-08-29T12:00:00.000Z'],
    }),
  })
  .meta({ id: 'VehicleResponseDto' });

export class VehicleResponseDto extends createZodDto(vehicleResponseSchema) {}

export type VehicleResponseDtoType = z.infer<typeof vehicleResponseSchema>;
