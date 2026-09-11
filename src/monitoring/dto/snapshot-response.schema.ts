import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const snapshotResponseSchema = z
  .object({
    cameraId: z.string().uuid().meta({
      description: 'UUID da câmera que gerou o snapshot',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    timestamp: z.iso.datetime({ offset: true }).meta({
      description: 'Data/hora da captura do snapshot (ISO 8601 com offset)',
      examples: ['2026-08-29T12:00:00.000Z'],
    }),
  })
  .meta({
    id: 'SnapshotInfoDto',
    description:
      'Informações sobre o snapshot capturado.\n\n' +
      'O endpoint GET /camera/:id/snapshot retorna diretamente a imagem JPEG como StreamableFile. ' +
      'Este DTO é usado internamente para documentação do schema.',
  });

export class SnapshotDto extends createZodDto(snapshotResponseSchema) {}
