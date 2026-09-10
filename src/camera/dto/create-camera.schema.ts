import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const createCameraSchema = z
  .object({
    adminUnityId: z.string().min(1, 'Admin unity ID is required').meta({
      description: 'ID da unidade administrativa vinculada à câmera',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    pointId: z.string().min(1, 'Point ID is required').meta({
      description: 'ID do ponto (entrada/saída) vinculado à câmera',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    name: z.string().min(1, 'Name is required').meta({
      description: 'Nome da câmera',
      examples: ['Câmera Portaria 1'],
    }),
    ip: z.string().min(1, 'IP is required').meta({
      description: 'Endereço IP da câmera',
      examples: ['192.168.11.241'],
    }),
    port: z.number().int().default(80).meta({
      description: 'Porta HTTP da câmera',
      examples: [80],
      default: 80,
    }),
    username: z.string().default('').meta({
      description: 'Usuário da câmera',
      examples: ['admin'],
    }),
    password: z.string().default('').meta({
      description: 'Senha da câmera',
      examples: ['senha123'],
    }),
    authType: z.enum(['digest', 'basic']).default('digest').meta({
      description: 'Tipo de autenticação da câmera',
      examples: ['digest'],
      default: 'digest',
    }),
    snapshotUrl: z.string().optional().meta({
      description: 'URL completa do snapshot (opcional)',
      examples: ['http://192.168.11.241/ISAPI/Streaming/channels/101/picture'],
    }),
    description: z.string().optional().meta({
      description: 'Descrição opcional da câmera',
      examples: ['Entrada principal'],
    }),
  })
  .meta({ id: 'CreateCameraDto' });

export class CreateCameraDto extends createZodDto(createCameraSchema) {}

export type CreateCameraDtoType = z.infer<typeof createCameraSchema>;
