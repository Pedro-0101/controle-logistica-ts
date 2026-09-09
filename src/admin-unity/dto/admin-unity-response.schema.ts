import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const adminUnityResponseSchema = z
  .object({
    id: z.string().meta({
      description: 'UUID único da unidade administrativa',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    name: z.string().meta({
      description: 'Nome da unidade administrativa',
      examples: ['Unidade Centro'],
    }),
    code: z.string().meta({
      description: 'Código identificador da unidade',
      examples: ['UA-001'],
    }),
    address: z.string().meta({
      description: 'Endereço da unidade administrativa',
      examples: ['Rua Principal, 123 - Centro, São Paulo - SP'],
    }),
    phone: z.string().nullish().meta({
      description: 'Telefone de contato da unidade',
      examples: ['(11) 99999-0000'],
    }),
    email: z.string().nullish().meta({
      description: 'Email de contato da unidade',
      examples: ['unidade.centro@email.com'],
    }),
    companyId: z.string().meta({
      description: 'ID da empresa vinculada à unidade',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    active: z.boolean().meta({
      description: 'Indica se a unidade está ativa',
      examples: [true],
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
  .meta({ id: 'AdminUnityResponseDto' });

export class AdminUnityResponseDto extends createZodDto(adminUnityResponseSchema) {}

export type AdminUnityResponseDtoType = z.infer<typeof adminUnityResponseSchema>;
