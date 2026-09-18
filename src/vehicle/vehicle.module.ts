import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleService } from './vehicle.service.js';
import { VehicleController } from './vehicle.controller.js';
import { Vehicle } from './entities/vehicle.entity.js';
import { VehicleCodeSequence } from './entities/vehicle-code-sequence.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Vehicle, VehicleCodeSequence])],
  controllers: [VehicleController],
  providers: [VehicleService],
  exports: [VehicleService],
})
export class VehicleModule {}
