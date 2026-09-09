import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const companyResponseSchema = z
  .object({
    id: z.string().meta({
      description: 'UUID único da empresa',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    name: z.string().meta({
      description: 'Nome fantasia da empresa',
      examples: ['Empresa XYZ Ltda'],
    }),
    companyName: z.string().meta({
      description: 'Razão social da empresa',
      examples: ['XYZ Comércio e Serviços Ltda'],
    }),
    cnpj: z.string().meta({
      description: 'CNPJ da empresa (formato: XX.XXX.XXX/XXXX-XX)',
      examples: ['12.345.678/0001-99'],
    }),
    stateRegistration: z.string().meta({
      description: 'Inscrição estadual da empresa',
      examples: ['123.456.789.012'],
    }),
    address: z.string().meta({
      description: 'Endereço completo da empresa',
      examples: ['Rua Example, 123 - Centro - São Paulo/SP - CEP: 01234-567'],
    }),
    email: z.email().meta({
      description: 'Email de contato da empresa',
      examples: ['contato@empresa.com.br'],
      format: 'email',
    }),
    active: z.boolean().meta({
      description: 'Status ativo/inativo da empresa',
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
  .meta({ id: 'CompanyResponseDto' });

export class CompanyResponseDto extends createZodDto(companyResponseSchema) {}

export type CompanyResponseDtoType = z.infer<typeof companyResponseSchema>;
