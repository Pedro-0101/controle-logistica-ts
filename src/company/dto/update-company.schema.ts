import { createZodDto } from 'zod-nest';
import { objectWithoutDefaults } from '../../common/zod.util.js';
import { createCompanySchema } from './create-company.schema.js';

export const updateCompanySchema = objectWithoutDefaults(createCompanySchema)
  .partial()
  .meta({ id: 'UpdateCompanyDto' });

export class UpdateCompanyDto extends createZodDto(updateCompanySchema) {}

export type UpdateCompanyDtoType = ReturnType<typeof updateCompanySchema.parse>;
