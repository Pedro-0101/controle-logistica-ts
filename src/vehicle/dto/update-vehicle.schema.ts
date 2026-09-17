import { createZodDto } from 'zod-nest';
import { objectWithoutDefaults } from '../../common/zod.util.js';
import { createVehicleSchema } from './create-vehicle.schema.js';

export const updateVehicleSchema = objectWithoutDefaults(createVehicleSchema)
  .partial()
  .meta({ id: 'UpdateVehicleDto' });

export class UpdateVehicleDto extends createZodDto(updateVehicleSchema) {}

export type UpdateVehicleDtoType = ReturnType<typeof updateVehicleSchema.parse>;
