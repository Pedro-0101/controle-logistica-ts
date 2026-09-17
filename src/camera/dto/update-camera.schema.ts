import { createZodDto } from 'zod-nest';
import { objectWithoutDefaults } from '../../common/zod.util.js';
import { createCameraSchema } from './create-camera.schema.js';

export const updateCameraSchema = objectWithoutDefaults(createCameraSchema)
  .partial()
  .meta({ id: 'UpdateCameraDto' });

export class UpdateCameraDto extends createZodDto(updateCameraSchema) {}

export type UpdateCameraDtoType = ReturnType<typeof updateCameraSchema.parse>;
