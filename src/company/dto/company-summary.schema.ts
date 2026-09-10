import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const companySummarySchema = z
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
  })
  .meta({ id: 'CompanySummaryDto' });

export class CompanySummaryDto extends createZodDto(companySummarySchema) {}

export type CompanySummaryDtoType = z.infer<typeof companySummarySchema>;
