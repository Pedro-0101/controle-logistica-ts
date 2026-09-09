import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const movementResponseSchema = z
  .object({
    id: z.string().meta({
      description: 'UUID único do movimento',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    pointId: z.string().nullish().meta({
      description: 'ID do ponto vinculado ao movimento',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    vehicleId: z.string().meta({
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
    status: z.enum(['open', 'closed']).meta({
      description: 'Status do movimento',
      examples: ['open'],
    }),
    companyId: z.string().meta({
      description: 'ID da empresa vinculada ao movimento',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    purpose: z.string().nullish().meta({
      description: 'Motivo do movimento',
      examples: ['Entrega de mercadoria'],
    }),
    driverName: z.string().nullish().meta({
      description: 'Nome do motorista/condutor do veículo',
      examples: ['João Silva'],
    }),
    notes: z.string().nullish().meta({
      description: 'Observações sobre o movimento',
      examples: ['Cliente aguardando no portão 2'],
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
  .meta({ id: 'MovementResponseDto' });

export class MovementResponseDto extends createZodDto(movementResponseSchema) {}

export type MovementResponseDtoType = z.infer<typeof movementResponseSchema>;
