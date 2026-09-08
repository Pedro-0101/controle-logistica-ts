import { Injectable } from '@nestjs/common';
import { CreateMovementDto } from './dto/create-movement.dto.js';
import { UpdateMovementDto } from './dto/update-movement.dto.js';

@Injectable()
export class MovementService {
  create(createMovementDto: CreateMovementDto) {
    return 'This action adds a new movement';
  }

  findAll() {
    return `This action returns all movement`;
  }

  findOne(id: number) {
    return `This action returns a #${id} movement`;
  }

  update(id: number, updateMovementDto: UpdateMovementDto) {
    return `This action updates a #${id} movement`;
  }

  remove(id: number) {
    return `This action removes a #${id} movement`;
  }
}
