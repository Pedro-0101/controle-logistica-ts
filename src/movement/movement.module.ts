import { Module } from '@nestjs/common';
import { MovementService } from './movement.service.js';
import { MovementController } from './movement.controller.js';

@Module({
  controllers: [MovementController],
  providers: [MovementService],
})
export class MovementModule {}
