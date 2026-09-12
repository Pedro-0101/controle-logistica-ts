import { createZodDto } from 'zod-nest';
import { createCompanyConfigSchema } from './create-company-config.schema.js';

export const updateCompanyConfigSchema = createCompanyConfigSchema.partial().meta({ id: 'UpdateCompanyConfigDto' });

export class UpdateCompanyConfigDto extends createZodDto(updateCompanyConfigSchema) {}

export type UpdateCompanyConfigDtoType = ReturnType<typeof updateCompanyConfigSchema.parse>;
