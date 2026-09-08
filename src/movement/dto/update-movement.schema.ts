import { createZodDto } from 'zod-nest';
import { createMovementSchema } from './create-movement.schema.js';

export const updateMovementSchema = createMovementSchema.partial().meta({ id: 'UpdateMovementDto' });

export class UpdateMovementDto extends createZodDto(updateMovementSchema) {}

export type UpdateMovementDtoType = ReturnType<typeof updateMovementSchema.parse>;
