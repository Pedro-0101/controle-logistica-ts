import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Camera } from '../camera/entities/camera.entity.js';
import { Point } from '../point/entities/point.entity.js';
import { AdminUnity } from '../admin-unity/entities/admin-unity.entity.js';
import { AnprModule } from '../anpr/anpr.module.js';
import { CameraObservation } from './observation.entity.js';
import { MonitoringController } from './monitoring.controller.js';
import { MonitoringService } from './monitoring.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Camera, Point, AdminUnity, CameraObservation]), AnprModule],
  controllers: [MonitoringController], providers: [MonitoringService],
  exports: [MonitoringService, TypeOrmModule],
})
export class MonitoringModule {}
