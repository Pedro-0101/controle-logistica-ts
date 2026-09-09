import { createZodDto } from 'zod-nest';
import { createPointSchema } from './create-point.schema.js';

export const updatePointSchema = createPointSchema.partial().meta({ id: 'UpdatePointDto' });

export class UpdatePointDto extends createZodDto(updatePointSchema) {}

export type UpdatePointDtoType = ReturnType<typeof updatePointSchema.parse>;
