import { createZodDto } from 'zod-nest';
import { objectWithoutDefaults } from '../../common/zod.util.js';
import { createUserSchema } from './create-user.schema.js';

export const updateUserSchema = objectWithoutDefaults(createUserSchema)
  .partial()
  .meta({ id: 'UpdateUserDto' });

export class UpdateUserDto extends createZodDto(updateUserSchema) {}

export type UpdateUserDtoType = ReturnType<typeof updateUserSchema.parse>;
