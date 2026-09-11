import { z } from 'zod';
import { createZodDto } from 'zod-nest';
import { createMovementFromCameraSchema } from './create-movement-from-camera.schema.js';

export const createMovementFromObservationSchema = createMovementFromCameraSchema
  .omit({ cameraId: true }).extend({ observationId: z.string().uuid() })
  .meta({ id: 'CreateMovementFromObservationDto' });
export class CreateMovementFromObservationDto extends createZodDto(createMovementFromObservationSchema) {}
