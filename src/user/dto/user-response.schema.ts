import { z } from 'zod';
import { createZodDto } from 'zod-nest';
import { pointResponseSchema } from '../../point/dto/point-response.schema.js';

export const userResponseSchema = z
  .object({
    points: z.array(pointResponseSchema).optional(),
    id: z.string().meta({
      description: 'UUID único do usuário',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    name: z.string().meta({
      description: 'Nome completo do usuário',
      examples: ['João Silva'],
    }),
    email: z.email().meta({
      description: 'Email do usuário (deve ser único)',
      examples: ['joao@email.com'],
      format: 'email',
    }),
    role: z.enum(['user', 'admin', 'supervisor']).meta({
      description: 'Função do usuário no sistema',
      examples: ['user'],
    }),
    companyId: z.string().nullish().meta({
      description: 'ID da empresa vinculada ao usuário (opcional para administradores/suporte)',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    points: z.array(z.object({
      id: z.string(),
      name: z.string(),
      code: z.string(),
    })).optional().meta({
      description: 'Pontos vinculados ao usuário',
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
  .meta({ id: 'UserResponseDto' });

export class UserResponseDto extends createZodDto(userResponseSchema) {}

export type UserResponseDtoType = z.infer<typeof userResponseSchema>;
