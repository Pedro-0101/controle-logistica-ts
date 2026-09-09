import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePointDto } from './dto/create-point.dto.js';
import { UpdatePointDto } from './dto/update-point.dto.js';
import { Point } from './entities/point.entity.js';
import {
  type Actor,
  companyScopeFilter,
  forceCompanyId,
  resolveCompanyScope,
  withCompanyScopeWhere,
} from '../auth/company-scope.js';

@Injectable()
export class PointService {
  constructor(
    @InjectRepository(Point)
    private readonly pointRepository: Repository<Point>,
  ) {}

  create(createPointDto: CreatePointDto, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const data = forceCompanyId(createPointDto, scope);
    const point = this.pointRepository.create({
      ...data,
      createdById: actor.userId,
    });
    return this.pointRepository.save(point);
  }

  findAll(actor: Actor) {
    const scope = resolveCompanyScope(actor);
    return this.pointRepository.find({
      where: companyScopeFilter<Point>(scope),
    });
  }

  async findOne(id: string, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const point = await this.pointRepository.findOneBy(
      withCompanyScopeWhere<Point>({ id }, scope),
    );
    if (!point) {
      throw new NotFoundException(`Point with ID ${id} not found`);
    }
    return point;
  }

  async update(id: string, updatePointDto: UpdatePointDto, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const point = await this.findOne(id, actor);
    const data = forceCompanyId({ ...updatePointDto }, scope);
    Object.assign(point, data, { updatedById: actor.userId });
    return this.pointRepository.save(point);
  }

  async remove(id: string, actor: Actor) {
    const point = await this.findOne(id, actor);
    return this.pointRepository.remove(point);
  }
}
