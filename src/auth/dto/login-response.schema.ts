import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const loginResponseSchema = z
  .object({
    access_token: z.string().meta({
      description: 'Token JWT de acesso (use como Bearer token)',
      examples: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'],
    }),
  })
  .meta({ id: 'LoginResponseDto' });

export class LoginResponseDto extends createZodDto(loginResponseSchema) {}
