import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointService } from './point.service.js';
import { PointController } from './point.controller.js';
import { Point } from './entities/point.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Point])],
  controllers: [PointController],
  providers: [PointService],
})
export class PointModule {}
