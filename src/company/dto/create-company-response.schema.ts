import { z } from 'zod';
import { createZodDto } from 'zod-nest';
import { createCompanySchema } from './create-company.schema.js';
import { companyConfigResponseSchema } from '../../company-config/dto/company-config-response.schema.js';

export const companyAdminResponseSchema = z
  .object({
    id: z.string().meta({
      description: 'UUID do usuário administrador',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    name: z.string().meta({
      description: 'Nome completo do usuário administrador',
      examples: ['João Silva'],
    }),
    email: z.email().meta({
      description: 'Email do usuário administrador',
      examples: ['joao@empresa.com'],
      format: 'email',
    }),
    role: z.string().meta({
      description: 'Função do usuário no sistema',
      examples: ['admin'],
    }),
    companyId: z.string().meta({
      description: 'ID da empresa vinculada ao usuário',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    createdAt: z.string().meta({
      description: 'Data e hora da criação do registro',
      examples: ['2026-08-29T12:00:00.000Z'],
    }),
    updatedAt: z.string().meta({
      description: 'Data e hora da última atualização do registro',
      examples: ['2026-08-29T12:00:00.000Z'],
    }),
  })
  .meta({ id: 'CompanyAdminResponseDto' });

export const createCompanyResponseSchema = z
  .object({
    company: createCompanySchema.omit({ admin: true }),
    admin: companyAdminResponseSchema,
    config: companyConfigResponseSchema,
  })
  .meta({ id: 'CreateCompanyResponseDto' });

export class CreateCompanyResponseDto extends createZodDto(createCompanyResponseSchema) {}

export type CreateCompanyResponseDtoType = z.infer<typeof createCompanyResponseSchema>;
