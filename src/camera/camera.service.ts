import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCameraDto } from './dto/create-camera.dto.js';
import { UpdateCameraDto } from './dto/update-camera.dto.js';
import { Camera } from './entities/camera.entity.js';
import {
  type Actor,
  companyScopeFilter,
  requireCompanyId,
  resolveCompanyScope,
  withCompanyScopeWhere,
} from '../auth/company-scope.js';

@Injectable()
export class CameraService {
  constructor(
    @InjectRepository(Camera)
    private readonly cameraRepository: Repository<Camera>,
  ) {}

  create(createCameraDto: CreateCameraDto, actor: Actor) {
    const companyId = requireCompanyId(actor);
    const camera = this.cameraRepository.create({
      ...createCameraDto,
      companyId,
      createdById: actor.userId,
    });
    return this.cameraRepository.save(camera);
  }

  findAll(actor: Actor) {
    const scope = resolveCompanyScope(actor);
    return this.cameraRepository.find({
      where: companyScopeFilter<Camera>(scope),
    });
  }

  async findOne(id: string, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const camera = await this.cameraRepository.findOneBy(
      withCompanyScopeWhere<Camera>({ id }, scope),
    );
    if (!camera) {
      throw new NotFoundException(`Camera with ID ${id} not found`);
    }
    return camera;
  }

  async update(id: string, updateCameraDto: UpdateCameraDto, actor: Actor) {
    const camera = await this.findOne(id, actor);
    Object.assign(camera, updateCameraDto, { updatedById: actor.userId });
    return this.cameraRepository.save(camera);
  }

  async remove(id: string, actor: Actor) {
    const camera = await this.findOne(id, actor);
    return this.cameraRepository.remove(camera);
  }
}
