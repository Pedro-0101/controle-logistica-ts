import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const createCompanyAdminSchema = z
  .object({
    name: z.string().min(1, 'Name is required').meta({
      description: 'Nome completo do usuário administrador da empresa',
      examples: ['João Silva'],
    }),
    email: z.email('Invalid email address').meta({
      description: 'Email do usuário administrador (deve ser único)',
      examples: ['joao@empresa.com'],
      format: 'email',
    }),
    password: z.string().min(6, 'Password must be at least 6 characters').meta({
      description: 'Senha do usuário administrador (mínimo 6 caracteres)',
      examples: ['senha123'],
    }),
  })
  .meta({ id: 'CreateCompanyAdminDto' });

export const createCompanySchema = z.object({
  name: z.string().min(1, 'Name is required').meta({
    description: 'Nome fantasia da empresa',
    examples: ['Empresa XYZ Ltda'],
  }),
  companyName: z.string().min(1, 'Company name is required').meta({
    description: 'Razão social da empresa',
    examples: ['XYZ Comércio e Serviços Ltda'],
  }),
  cnpj: z.string().min(14, 'CNPJ must be at least 14 characters').max(18, 'CNPJ must be at most 18 characters').meta({
    description: 'CNPJ da empresa (formato: XX.XXX.XXX/XXXX-XX)',
    examples: ['12.345.678/0001-99'],
  }),
  stateRegistration: z.string().min(1, 'State registration is required').meta({
    description: 'Inscrição estadual da empresa',
    examples: ['123.456.789.012'],
  }),
  address: z.string().min(1, 'Address is required').meta({
    description: 'Endereço completo da empresa',
    examples: ['Rua Example, 123 - Centro - São Paulo/SP - CEP: 01234-567'],
  }),
  email: z.email('Invalid email address').meta({
    description: 'Email de contato da empresa',
    examples: ['contato@empresa.com.br'],
    format: 'email',
  }),
  active: z.boolean().default(true).meta({
    description: 'Status ativo/inativo da empresa',
    examples: [true],
    default: 'true',
  }),
  admin: createCompanyAdminSchema.meta({
    description: 'Dados do usuário administrador criado junto com a empresa',
  }),
}).meta({ id: 'CreateCompanyDto' });

export class CreateCompanyDto extends createZodDto(createCompanySchema) {}

export type CreateCompanyDtoType = z.infer<typeof createCompanySchema>;
