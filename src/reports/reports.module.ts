import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service.js';
import { MovementTimeService } from './movement-time.service.js';
import { ReportsController } from './reports.controller.js';
import { Movement } from '../movement/entities/movement.entity.js';
import { CompanyConfig } from '../company-config/entities/company-config.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Movement, CompanyConfig])],
  controllers: [ReportsController],
  providers: [ReportsService, MovementTimeService],
  exports: [ReportsService, MovementTimeService],
})
export class ReportsModule {}
