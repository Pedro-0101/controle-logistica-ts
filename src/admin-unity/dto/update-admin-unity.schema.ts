import { createZodDto } from 'zod-nest';
import { createAdminUnitySchema } from './create-admin-unity.schema.js';

export const updateAdminUnitySchema = createAdminUnitySchema.partial().meta({ id: 'UpdateAdminUnityDto' });

export class UpdateAdminUnityDto extends createZodDto(updateAdminUnitySchema) {}

export type UpdateAdminUnityDtoType = ReturnType<typeof updateAdminUnitySchema.parse>;
