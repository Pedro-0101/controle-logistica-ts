import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const loginResponseSchema = z
  .object({
    access_token: z.string().meta({
      description: 'Token JWT de acesso (use como Bearer token)',
      examples: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'],
    }),
    user: z
      .object({
        id: z.string().meta({
          description: 'ID do usuário (UUID)',
          examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
        }),
        name: z.string().meta({
          description: 'Nome completo do usuário',
          examples: ['João Silva'],
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
      })
      .meta({ description: 'Dados básicos do usuário autenticado' }),
  })
  .meta({ id: 'LoginResponseDto' });

export class LoginResponseDto extends createZodDto(loginResponseSchema) {}
