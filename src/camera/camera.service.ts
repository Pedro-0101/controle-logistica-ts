import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCameraDto } from './dto/create-camera.dto.js';
import { UpdateCameraDto } from './dto/update-camera.dto.js';
import { Camera } from './entities/camera.entity.js';
import { AdminUnity } from '../admin-unity/entities/admin-unity.entity.js';
import { Point } from '../point/entities/point.entity.js';
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
    @InjectRepository(AdminUnity)
    private readonly unityRepository: Repository<AdminUnity>,
    @InjectRepository(Point)
    private readonly pointRepository: Repository<Point>,
  ) {}

  async create(createCameraDto: CreateCameraDto, actor: Actor) {
    const companyId = requireCompanyId(actor);
    await this.validateContext(createCameraDto.adminUnityId, createCameraDto.pointId, companyId);
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
    if ((updateCameraDto.adminUnityId !== undefined && updateCameraDto.adminUnityId !== camera.adminUnityId) ||
        (updateCameraDto.pointId !== undefined && updateCameraDto.pointId !== camera.pointId)) {
      throw new BadRequestException('Unidade e ponto da câmera são fixos; cadastre outra câmera para outro ponto');
    }
    await this.validateContext(camera.adminUnityId, camera.pointId, camera.companyId);
    Object.assign(camera, updateCameraDto, { updatedById: actor.userId });
    return this.cameraRepository.save(camera);
  }

  async remove(id: string, actor: Actor) {
    const camera = await this.findOne(id, actor);
    return this.cameraRepository.remove(camera);
  }

  private async validateContext(adminUnityId: string, pointId: string, companyId: string) {
    const unity = await this.unityRepository.findOneBy({ id: adminUnityId, companyId });
    if (!unity) throw new BadRequestException('Unidade não encontrada na empresa');
    const point = await this.pointRepository.findOneBy({ id: pointId, companyId });
    if (!point || point.adminUnityId !== adminUnityId) {
      throw new BadRequestException('Ponto não encontrado na unidade e empresa informadas');
    }
  }
}
