import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateMovementDto } from './dto/create-movement.schema.js';
import { UpdateMovementDto } from './dto/update-movement.schema.js';
import { Movement } from './entities/movement.entity.js';

@Injectable()
export class MovementService {
  constructor(
    @InjectRepository(Movement)
    private readonly movementRepository: Repository<Movement>,
  ) {}

  create(createMovementDto: CreateMovementDto) {
    const movement = this.movementRepository.create(createMovementDto);
    return this.movementRepository.save(movement);
  }

  findAll() {
    return this.movementRepository.find();
  }

  async findOne(id: string) {
    const movement = await this.movementRepository.findOneBy({ id });
    if (!movement) {
      throw new NotFoundException(`Movement with ID ${id} not found`);
    }
    return movement;
  }

  async update(id: string, updateMovementDto: UpdateMovementDto) {
    const movement = await this.findOne(id);
    Object.assign(movement, updateMovementDto);
    return this.movementRepository.save(movement);
  }

  async remove(id: string) {
    const movement = await this.findOne(id);
    return this.movementRepository.remove(movement);
  }
}
