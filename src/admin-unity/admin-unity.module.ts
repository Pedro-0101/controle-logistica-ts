import { Module } from '@nestjs/common';
import { AdminUnityService } from './admin-unity.service.js';
import { AdminUnityController } from './admin-unity.controller.js';

@Module({
  controllers: [AdminUnityController],
  providers: [AdminUnityService],
})
export class AdminUnityModule {}
