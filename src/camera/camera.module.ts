import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CameraController } from './camera.controller.js';
import { CameraService } from './camera.service.js';
import { Camera } from './entities/camera.entity.js';
import { AdminUnity } from '../admin-unity/entities/admin-unity.entity.js';
import { Point } from '../point/entities/point.entity.js';
import { MediaMTXService } from './mediamtx.service.js';
import { SnapshotService } from './snapshot.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Camera, AdminUnity, Point])],
  controllers: [CameraController],
  providers: [CameraService, MediaMTXService, SnapshotService],
  exports: [TypeOrmModule, CameraService, MediaMTXService, SnapshotService],
})
export class CameraModule {}
