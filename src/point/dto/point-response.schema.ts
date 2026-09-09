import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const pointResponseSchema = z
  .object({
    id: z.string().meta({
      description: 'UUID único do ponto',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    name: z.string().meta({
      description: 'Nome do ponto (ex.: Portão 1)',
      examples: ['Portão 1'],
    }),
    code: z.string().meta({
      description: 'Código identificador do ponto',
      examples: ['P-001'],
    }),
    type: z.enum(['entry', 'exit', 'both']).meta({
      description: 'Tipo do ponto (entrada, saída ou ambos)',
      examples: ['entry'],
    }),
    adminUnityId: z.string().meta({
      description: 'ID da unidade administrativa vinculada ao ponto',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    companyId: z.string().meta({
      description: 'ID da empresa vinculada ao ponto',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    active: z.boolean().meta({
      description: 'Indica se o ponto está ativo',
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
  .meta({ id: 'PointResponseDto' });

export class PointResponseDto extends createZodDto(pointResponseSchema) {}

export type PointResponseDtoType = z.infer<typeof pointResponseSchema>;
