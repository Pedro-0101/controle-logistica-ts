import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const createAdminUnitySchema = z.object({
  name: z.string().min(1, 'Name is required').meta({
    description: 'Nome da unidade administrativa',
    examples: ['Unidade Centro'],
  }),
  code: z.string().min(1, 'Code is required').meta({
    description: 'Código identificador da unidade',
    examples: ['UA-001'],
  }),
  address: z.string().min(1, 'Address is required').meta({
    description: 'Endereço da unidade administrativa',
    examples: ['Rua Principal, 123 - Centro, São Paulo - SP'],
  }),
  phone: z.string().optional().meta({
    description: 'Telefone de contato da unidade',
    examples: ['(11) 99999-0000'],
  }),
  email: z.email('Invalid email address').optional().meta({
    description: 'Email de contato da unidade',
    examples: ['unidade.centro@email.com'],
    format: 'email',
  }),
  active: z.boolean().default(true).meta({
    description: 'Indica se a unidade está ativa',
    examples: [true],
    default: 'true',
  }),
}).meta({ id: 'CreateAdminUnityDto' });

export class CreateAdminUnityDto extends createZodDto(createAdminUnitySchema) {}

export type CreateAdminUnityDtoType = z.infer<typeof createAdminUnitySchema>;
