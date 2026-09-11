import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CameraController } from './camera.controller.js';
import { CameraService } from './camera.service.js';
import { Camera } from './entities/camera.entity.js';
import { AdminUnity } from '../admin-unity/entities/admin-unity.entity.js';
import { Point } from '../point/entities/point.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Camera, AdminUnity, Point])],
  controllers: [CameraController],
  providers: [CameraService],
  exports: [TypeOrmModule, CameraService],
})
export class CameraModule {}
