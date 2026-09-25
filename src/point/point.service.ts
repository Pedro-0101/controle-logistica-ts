import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePointDto } from './dto/create-point.schema.js';
import { UpdatePointDto } from './dto/update-point.schema.js';
import { Point } from './entities/point.entity.js';
import { AdminUnity } from '../admin-unity/entities/admin-unity.entity.js';
import {
  type Actor,
  companyScopeFilter,
  requireCompanyId,
  resolveCompanyScope,
  withCompanyScopeWhere,
} from '../auth/company-scope.js';

@Injectable()
export class PointService {
  constructor(
    @InjectRepository(Point)
    private readonly pointRepository: Repository<Point>,
    @InjectRepository(AdminUnity)
    private readonly unityRepository: Repository<AdminUnity>,
  ) {}

  async create(createPointDto: CreatePointDto, actor: Actor) {
    const companyId = requireCompanyId(actor);
    await this.validateUnity(createPointDto.adminUnityId, companyId);
    const point = this.pointRepository.create({
      ...createPointDto,
      companyId,
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
    const point = await this.findOne(id, actor);
    if (updatePointDto.adminUnityId !== undefined && updatePointDto.adminUnityId !== point.adminUnityId) {
      throw new BadRequestException('Unidade administrativa é fixa; cadastre outro ponto para alterar o contexto');
    }
    await this.validateUnity(point.adminUnityId, point.companyId);
    Object.assign(point, updatePointDto, { updatedById: actor.userId });
    return this.pointRepository.save(point);
  }

  async remove(id: string, actor: Actor) {
    const point = await this.findOne(id, actor);
    return this.pointRepository.remove(point);
  }

  private async validateUnity(id: string, companyId: string) {
    if (!await this.unityRepository.findOneBy({ id, companyId })) {
      throw new BadRequestException('Unidade não encontrada na empresa');
    }
  }
}
