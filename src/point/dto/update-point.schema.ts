import { createZodDto } from 'zod-nest';
import { objectWithoutDefaults } from '../../common/zod.util.js';
import { createPointSchema } from './create-point.schema.js';

export const updatePointSchema = objectWithoutDefaults(createPointSchema)
  .partial()
  .meta({ id: 'UpdatePointDto' });

export class UpdatePointDto extends createZodDto(updatePointSchema) {}

export type UpdatePointDtoType = ReturnType<typeof updatePointSchema.parse>;
