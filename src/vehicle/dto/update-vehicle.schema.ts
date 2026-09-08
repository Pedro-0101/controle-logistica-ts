import { createZodDto } from 'zod-nest';
import { createVehicleSchema } from './create-vehicle.schema.js';

export const updateVehicleSchema = createVehicleSchema.partial().meta({ id: 'UpdateVehicleDto' });

export class UpdateVehicleDto extends createZodDto(updateVehicleSchema) {}

export type UpdateVehicleDtoType = ReturnType<typeof updateVehicleSchema.parse>;
