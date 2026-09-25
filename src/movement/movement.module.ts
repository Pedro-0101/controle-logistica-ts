import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovementService } from './movement.service.js';
import { MovementAutoService } from './movement-auto.service.js';
import { MovementReconciliationService } from './movement-reconciliation.service.js';
import { MovementEvidenceService } from './movement-evidence.service.js';
import { MovementController } from './movement.controller.js';
import { Movement } from './entities/movement.entity.js';
import { CameraModule } from '../camera/camera.module.js';
import { AnprModule } from '../anpr/anpr.module.js';
import { VehicleModule } from '../vehicle/vehicle.module.js';
import { PointModule } from '../point/point.module.js';
import { MonitoringModule } from '../monitoring/monitoring.module.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Movement]),
    CameraModule,
    AnprModule,
    VehicleModule,
    PointModule,
    MonitoringModule,
    StorageModule,
  ],
  controllers: [MovementController],
  providers: [MovementService, MovementAutoService, MovementReconciliationService, MovementEvidenceService],
  exports: [TypeOrmModule, MovementService],
})
export class MovementModule {}
