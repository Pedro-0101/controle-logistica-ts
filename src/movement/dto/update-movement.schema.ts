import { createZodDto } from 'zod-nest';
import { objectWithoutDefaults } from '../../common/zod.util.js';
import { createMovementSchema } from './create-movement.schema.js';

export const updateMovementSchema = objectWithoutDefaults(createMovementSchema)
  .partial()
  .meta({ id: 'UpdateMovementDto' });

export class UpdateMovementDto extends createZodDto(updateMovementSchema) {}

export type UpdateMovementDtoType = ReturnType<typeof updateMovementSchema.parse>;
