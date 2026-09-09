import { Module } from '@nestjs/common';
import { AnprController } from './anpr.controller.js';
import { AnprService } from './anpr.service.js';
import { CameraModule } from '../camera/camera.module.js';

@Module({
  imports: [CameraModule],
  controllers: [AnprController],
  providers: [AnprService],
  exports: [AnprService],
})
export class AnprModule {}
