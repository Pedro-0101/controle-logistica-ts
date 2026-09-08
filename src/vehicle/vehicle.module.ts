import { Module } from '@nestjs/common';
import { VehicleService } from './vehicle.service.js';
import { VehicleController } from './vehicle.controller.js';

@Module({
  controllers: [VehicleController],
  providers: [VehicleService],
})
export class VehicleModule {}
