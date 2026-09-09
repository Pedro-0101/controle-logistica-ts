import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovementService } from './movement.service.js';
import { MovementController } from './movement.controller.js';
import { Movement } from './entities/movement.entity.js';
import { CameraModule } from '../camera/camera.module.js';
import { AnprModule } from '../anpr/anpr.module.js';
import { VehicleModule } from '../vehicle/vehicle.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Movement]),
    CameraModule,
    AnprModule,
    VehicleModule,
  ],
  controllers: [MovementController],
  providers: [MovementService],
  exports: [TypeOrmModule],
})
export class MovementModule {}
