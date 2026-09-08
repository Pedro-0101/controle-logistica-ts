import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovementService } from './movement.service.js';
import { MovementController } from './movement.controller.js';
import { Movement } from './entities/movement.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Movement])],
  controllers: [MovementController],
  providers: [MovementService],
  exports: [TypeOrmModule],
})
export class MovementModule {}
