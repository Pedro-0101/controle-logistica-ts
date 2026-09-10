import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const createPointSchema = z
  .object({
    name: z.string().min(1, 'Name is required').meta({
      description: 'Nome do ponto (ex.: Portão 1)',
      examples: ['Portão 1'],
    }),
    code: z.string().min(1, 'Code is required').meta({
      description: 'Código identificador do ponto',
      examples: ['P-001'],
    }),
    type: z.enum(['entry', 'exit', 'both']).default('both').meta({
      description: 'Tipo do ponto (entrada, saída ou ambos)',
      examples: ['entry'],
      default: 'both',
    }),
    adminUnityId: z.string().min(1, 'Admin unity ID is required').meta({
      description: 'ID da unidade administrativa vinculada ao ponto',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    active: z.boolean().default(true).meta({
      description: 'Indica se o ponto está ativo',
      examples: [true],
      default: 'true',
    }),
  })
  .meta({ id: 'CreatePointDto' });

export class CreatePointDto extends createZodDto(createPointSchema) {}

export type CreatePointDtoType = z.infer<typeof createPointSchema>;
