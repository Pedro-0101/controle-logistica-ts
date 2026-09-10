import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const cameraResponseSchema = z
  .object({
    id: z.string().meta({
      description: 'UUID único da câmera',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    adminUnityId: z.string().meta({
      description: 'ID da unidade administrativa vinculada à câmera',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    pointId: z.string().meta({
      description: 'ID do ponto (entrada/saída) vinculado à câmera',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    name: z.string().meta({
      description: 'Nome da câmera',
      examples: ['Câmera Portaria 1'],
    }),
    ip: z.string().meta({
      description: 'Endereço IP da câmera',
      examples: ['192.168.11.241'],
    }),
    port: z.number().int().meta({
      description: 'Porta HTTP da câmera',
      examples: [80],
    }),
    username: z.string().meta({
      description: 'Usuário da câmera',
      examples: ['admin'],
    }),
    authType: z.enum(['digest', 'basic']).meta({
      description: 'Tipo de autenticação da câmera',
      examples: ['digest'],
    }),
    snapshotUrl: z.string().nullish().meta({
      description: 'URL completa do snapshot (opcional)',
      examples: ['http://192.168.11.241/ISAPI/Streaming/channels/101/picture'],
    }),
    description: z.string().nullish().meta({
      description: 'Descrição opcional da câmera',
      examples: ['Entrada principal'],
    }),
    companyId: z.string().meta({
      description: 'ID da empresa vinculada à câmera',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
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
  .meta({ id: 'CameraResponseDto' });

export class CameraResponseDto extends createZodDto(cameraResponseSchema) {}

export type CameraResponseDtoType = z.infer<typeof cameraResponseSchema>;
