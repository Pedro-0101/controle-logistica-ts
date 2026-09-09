import { createZodDto } from 'zod-nest';
import { createCameraSchema } from './create-camera.schema.js';

export const updateCameraSchema = createCameraSchema.partial().meta({ id: 'UpdateCameraDto' });

export class UpdateCameraDto extends createZodDto(updateCameraSchema) {}

export type UpdateCameraDtoType = ReturnType<typeof updateCameraSchema.parse>;
