import { createZodDto } from 'zod-nest';
import { createCompanySchema } from './create-company.schema.js';

export const updateCompanySchema = createCompanySchema.partial().meta({ id: 'UpdateCompanyDto' });

export class UpdateCompanyDto extends createZodDto(updateCompanySchema) {}

export type UpdateCompanyDtoType = ReturnType<typeof updateCompanySchema.parse>;
