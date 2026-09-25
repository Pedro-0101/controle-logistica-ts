import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutoRegistrationService } from './auto-registration.service.js';
import { RecognitionResolverService } from './recognition-resolver.service.js';
import { AutoRegistrationEvidenceService } from './auto-registration-evidence.service.js';
import { AutoRegistrationController } from './auto-registration.controller.js';
import { CameraObservation } from '../monitoring/observation.entity.js';
import { MonitoringModule } from '../monitoring/monitoring.module.js';
import { AnprModule } from '../anpr/anpr.module.js';
import { VehicleModule } from '../vehicle/vehicle.module.js';
import { PointModule } from '../point/point.module.js';
import { CompanyConfigModule } from '../company-config/company-config.module.js';
import { MovementModule } from '../movement/movement.module.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CameraObservation]),
    MonitoringModule,
    AnprModule,
    VehicleModule,
    PointModule,
    CompanyConfigModule,
    MovementModule,
    StorageModule,
  ],
  controllers: [AutoRegistrationController],
  providers: [AutoRegistrationService, RecognitionResolverService, AutoRegistrationEvidenceService],
  exports: [AutoRegistrationService],
})
export class AutoRegistrationModule {}
