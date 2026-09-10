import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required').meta({
    description: 'Nome completo do usuário',
    examples: ['João Silva'],
  }),
  email: z.email('Invalid email address').meta({
    description: 'Email do usuário (deve ser único)',
    examples: ['joao@email.com'],
    format: 'email',
  }),
  password: z.string().min(6, 'Password must be at least 6 characters').meta({
    description: 'Senha do usuário (mínimo 6 caracteres)',
    examples: ['senha123'],
  }),
  role: z.enum(['user', 'admin', 'supervisor']).default('user').meta({
    description: 'Função do usuário no sistema',
    examples: ['user'],
    default: 'user',
  }),
}).meta({ id: 'CreateUserDto' });

export class CreateUserDto extends createZodDto(createUserSchema) {}

export type CreateUserDtoType = z.infer<typeof createUserSchema>;
