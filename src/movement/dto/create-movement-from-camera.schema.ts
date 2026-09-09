import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const createMovementFromCameraSchema = z
  .object({
    cameraId: z.string().min(1, 'Camera ID is required').meta({
      description: 'ID da câmera a ser usada no reconhecimento da placa',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    pointId: z.string().optional().meta({
      description: 'ID do ponto vinculado ao movimento',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    type: z.enum(['entry', 'exit']).meta({
      description: 'Tipo do movimento (entrada ou saída)',
      examples: ['entry'],
    }),
    companyId: z.string().min(1, 'Company ID is required').meta({
      description: 'ID da empresa vinculada ao movimento',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    dateTime: z.iso.datetime().optional().meta({
      description: 'Data e hora em que o movimento ocorreu',
      examples: ['2026-08-29T12:00:00.000Z'],
    }),
    purpose: z.string().optional().meta({
      description: 'Motivo do movimento',
      examples: ['Entrega de mercadoria'],
    }),
    driverName: z.string().optional().meta({
      description: 'Nome do motorista/condutor do veículo',
      examples: ['João Silva'],
    }),
    notes: z.string().optional().meta({
      description: 'Observações sobre o movimento',
      examples: ['Cliente aguardando no portão 2'],
    }),
  })
  .meta({ id: 'CreateMovementFromCameraDto' });

export class CreateMovementFromCameraDto extends createZodDto(
  createMovementFromCameraSchema,
) {}

export type CreateMovementFromCameraDtoType = z.infer<
  typeof createMovementFromCameraSchema
>;
