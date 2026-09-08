import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const loginSchema = z
  .object({
    email: z.email('Invalid email address').meta({
      description: 'Email do usuário',
      examples: ['joao@email.com'],
      format: 'email',
    }),
    password: z.string().min(1, 'Password is required').meta({
      description: 'Senha do usuário',
      examples: ['senha123'],
    }),
  })
  .meta({ id: 'LoginDto' });

export class LoginDto extends createZodDto(loginSchema) {}

export type LoginDtoType = z.infer<typeof loginSchema>;
