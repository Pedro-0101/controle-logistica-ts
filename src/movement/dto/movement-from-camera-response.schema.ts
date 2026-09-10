import { z } from 'zod';
import { createZodDto } from 'zod-nest';
import { movementResponseSchema } from './movement-response.schema.js';
import { vehicleResponseSchema } from '../../vehicle/dto/vehicle-response.schema.js';

export const movementFromCameraResponseSchema = z
  .object({
    movement: movementResponseSchema.meta({
      description: 'Movimento registrado (entrada ou saída)',
    }),
    vehicle: vehicleResponseSchema.meta({
      description: 'Veículo identificado a partir da placa reconhecida',
    }),
  })
  .meta({ id: 'MovementFromCameraResponseDto' });

export class MovementFromCameraResponseDto extends createZodDto(
  movementFromCameraResponseSchema,
) {}

export type MovementFromCameraResponseDtoType = z.infer<
  typeof movementFromCameraResponseSchema
>;
