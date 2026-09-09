import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CameraController } from './camera.controller.js';
import { CameraService } from './camera.service.js';
import { Camera } from './entities/camera.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Camera])],
  controllers: [CameraController],
  providers: [CameraService],
  exports: [TypeOrmModule, CameraService],
})
export class CameraModule {}
