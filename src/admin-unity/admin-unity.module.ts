import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUnityService } from './admin-unity.service.js';
import { AdminUnityController } from './admin-unity.controller.js';
import { AdminUnity } from './entities/admin-unity.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([AdminUnity])],
  controllers: [AdminUnityController],
  providers: [AdminUnityService],
})
export class AdminUnityModule {}
