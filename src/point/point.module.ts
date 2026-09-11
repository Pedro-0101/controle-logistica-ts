import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointService } from './point.service.js';
import { PointController } from './point.controller.js';
import { Point } from './entities/point.entity.js';
import { AdminUnity } from '../admin-unity/entities/admin-unity.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Point, AdminUnity])],
  controllers: [PointController],
  providers: [PointService],
  exports: [PointService],
})
export class PointModule {}
