import { createZodDto } from 'zod-nest';
import { objectWithoutDefaults } from '../../common/zod.util.js';
import { createCompanyConfigSchema } from './create-company-config.schema.js';

export const updateCompanyConfigSchema = objectWithoutDefaults(createCompanyConfigSchema)
  .partial()
  .meta({ id: 'UpdateCompanyConfigDto' });

export class UpdateCompanyConfigDto extends createZodDto(updateCompanyConfigSchema) {}

export type UpdateCompanyConfigDtoType = ReturnType<typeof updateCompanyConfigSchema.parse>;
