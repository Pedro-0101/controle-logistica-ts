import { createZodDto } from 'zod-nest';
import { createUserSchema } from './create-user.schema.js';

export const updateUserSchema = createUserSchema.partial().meta({ id: 'UpdateUserDto' });

export class UpdateUserDto extends createZodDto(updateUserSchema) {}

export type UpdateUserDtoType = ReturnType<typeof updateUserSchema.parse>;
