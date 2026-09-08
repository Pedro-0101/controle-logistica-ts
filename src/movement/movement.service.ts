import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateMovementDto } from './dto/create-movement.schema.js';
import { UpdateMovementDto } from './dto/update-movement.schema.js';
import { Movement } from './entities/movement.entity.js';
import {
  type Actor,
  companyScopeFilter,
  forceCompanyId,
  resolveCompanyScope,
  withCompanyScopeWhere,
} from '../auth/company-scope.js';

@Injectable()
export class MovementService {
  constructor(
    @InjectRepository(Movement)
    private readonly movementRepository: Repository<Movement>,
  ) {}

  create(createMovementDto: CreateMovementDto, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const data = forceCompanyId(createMovementDto, scope);
    const movement = this.movementRepository.create({
      ...data,
      createdById: actor.userId,
    });
    return this.movementRepository.save(movement);
  }

  findAll(actor: Actor) {
    const scope = resolveCompanyScope(actor);
    return this.movementRepository.find({
      where: companyScopeFilter<Movement>(scope),
    });
  }

  async findOne(id: string, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const movement = await this.movementRepository.findOneBy(
      withCompanyScopeWhere<Movement>({ id }, scope),
    );
    if (!movement) {
      throw new NotFoundException(`Movement with ID ${id} not found`);
    }
    return movement;
  }

  async update(id: string, updateMovementDto: UpdateMovementDto, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const movement = await this.findOne(id, actor);
    const data = forceCompanyId({ ...updateMovementDto }, scope);
    Object.assign(movement, data, { updatedById: actor.userId });
    return this.movementRepository.save(movement);
  }

  async remove(id: string, actor: Actor) {
    const movement = await this.findOne(id, actor);
    return this.movementRepository.remove(movement);
  }
}
