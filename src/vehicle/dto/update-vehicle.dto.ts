import { PartialType } from '@nestjs/swagger';
import { CreateVehicleDto } from './create-vehicle.dto.js';

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}
