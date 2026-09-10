import { z } from 'zod';
import { createZodDto } from 'zod-nest';
import { companySummarySchema } from '../../company/dto/company-summary.schema.js';

export const meResponseSchema = z
  .object({
    userId: z.string().meta({
      description: 'ID do usuário (UUID)',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    email: z.email().meta({
      description: 'Email do usuário',
      examples: ['joao@email.com'],
      format: 'email',
    }),
    role: z.string().meta({
      description: 'Função do usuário no sistema',
      examples: ['admin'],
    }),
    companyId: z
      .string()
      .meta({
        description: 'ID da empresa vinculada ao usuário (ou null)',
        examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
      })
      .nullish(),
    company: companySummarySchema
      .nullish()
      .meta({ description: 'Dados da empresa vinculada ao usuário (ou null)' }),
  })
  .meta({ id: 'MeResponseDto' });

export class MeResponseDto extends createZodDto(meResponseSchema) {}
