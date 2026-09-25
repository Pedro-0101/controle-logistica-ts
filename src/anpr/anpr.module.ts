import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnprController } from './anpr.controller.js';
import { AnprService } from './anpr.service.js';
import { ExternalInteractionController } from './external-interaction.controller.js';
import { ExternalInteractionService } from './external-interaction.service.js';
import { ExternalInteractionUsageService } from './external-interaction-usage.service.js';
import { ExternalInteraction } from './entities/external-interaction.entity.js';
import { GoogleVisionProvider } from './providers/google-vision.provider.js';
import { PlateRecognitionProviderFactory } from './providers/plate-recognition.factory.js';
import { CameraModule } from '../camera/camera.module.js';

@Module({
  imports: [CameraModule, TypeOrmModule.forFeature([ExternalInteraction])],
  controllers: [AnprController, ExternalInteractionController],
  providers: [
    AnprService,
    ExternalInteractionService,
    ExternalInteractionUsageService,
    GoogleVisionProvider,
    PlateRecognitionProviderFactory,
  ],
  exports: [AnprService, ExternalInteractionService, PlateRecognitionProviderFactory],
})
export class AnprModule {}
