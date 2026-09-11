import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCameraDto } from './dto/create-camera.dto.js';
import { UpdateCameraDto } from './dto/update-camera.dto.js';
import { Camera } from './entities/camera.entity.js';
import { AdminUnity } from '../admin-unity/entities/admin-unity.entity.js';
import { Point } from '../point/entities/point.entity.js';
import { MediaMTXService } from './mediamtx.service.js';
import {
  type Actor,
  companyScopeFilter,
  requireCompanyId,
  resolveCompanyScope,
  withCompanyScopeWhere,
} from '../auth/company-scope.js';

@Injectable()
export class CameraService {
  private readonly logger = new Logger(CameraService.name);

  constructor(
    @InjectRepository(Camera)
    private readonly cameraRepository: Repository<Camera>,
    @InjectRepository(AdminUnity)
    private readonly unityRepository: Repository<AdminUnity>,
    @InjectRepository(Point)
    private readonly pointRepository: Repository<Point>,
    private readonly mediamtx: MediaMTXService,
  ) {}

  async create(createCameraDto: CreateCameraDto, actor: Actor) {
    const companyId = requireCompanyId(actor);
    await this.validateContext(createCameraDto.adminUnityId, createCameraDto.pointId, companyId);
    const camera = this.cameraRepository.create({
      ...createCameraDto,
      companyId,
      createdById: actor.userId,
    });
    const saved = await this.cameraRepository.save(camera);

    // Synchronize with MediaMTX: add streaming path
    try {
      await this.mediamtx.addPath(saved);
    } catch (error) {
      this.logger.warn(`Falha ao sincronizar câmera ${saved.id} com MediaMTX: ${error}`);
    }

    return {
      ...saved,
      streamUrls: this.mediamtx.getStreamUrls(saved.id),
    };
  }

  findAll(actor: Actor) {
    const scope = resolveCompanyScope(actor);
    return this.cameraRepository.find({
      where: companyScopeFilter<Camera>(scope),
    }).then(cameras => cameras.map(camera => ({
      ...camera,
      streamUrls: this.mediamtx.getStreamUrls(camera.id),
    })));
  }

  async findOne(id: string, actor: Actor) {
    const camera = await this.findOneRaw(id, actor);
    return {
      ...camera,
      streamUrls: this.mediamtx.getStreamUrls(camera.id),
    };
  }

  async update(id: string, updateCameraDto: UpdateCameraDto, actor: Actor) {
    const camera = await this.findOneRaw(id, actor);
    if ((updateCameraDto.adminUnityId !== undefined && updateCameraDto.adminUnityId !== camera.adminUnityId) ||
        (updateCameraDto.pointId !== undefined && updateCameraDto.pointId !== camera.pointId)) {
      throw new BadRequestException('Unidade e ponto da câmera são fixos; cadastre outra câmera para outro ponto');
    }
    await this.validateContext(camera.adminUnityId, camera.pointId, camera.companyId);
    Object.assign(camera, updateCameraDto, { updatedById: actor.userId });
    const saved = await this.cameraRepository.save(camera);

    // Synchronize with MediaMTX: remove old path and add updated path
    try {
      await this.mediamtx.removePath(id);
      await this.mediamtx.addPath(saved);
    } catch (error) {
      this.logger.warn(`Falha ao sincronizar câmera ${saved.id} com MediaMTX: ${error}`);
    }

    return {
      ...saved,
      streamUrls: this.mediamtx.getStreamUrls(saved.id),
    };
  }

  async remove(id: string, actor: Actor) {
    const camera = await this.findOneRaw(id, actor);

    // Synchronize with MediaMTX: remove streaming path before deleting
    try {
      await this.mediamtx.removePath(id);
    } catch (error) {
      this.logger.warn(`Falha ao remover path ${id} do MediaMTX: ${error}`);
    }

    return this.cameraRepository.remove(camera);
  }

  async syncAllWithMediaMTX(): Promise<void> {
    const cameras = await this.cameraRepository.find();
    const existingPaths = await this.mediamtx.listPaths();

    // Add paths for cameras that don't have them
    for (const camera of cameras) {
      const pathName = `camera-${camera.id}`;
      if (!existingPaths.includes(pathName)) {
        try {
          await this.mediamtx.addPath(camera);
          this.logger.log(`Path ${pathName} adicionado ao MediaMTX na inicialização`);
        } catch (error) {
          this.logger.warn(`Falha ao adicionar path ${pathName} na inicialização: ${error}`);
        }
      }
    }

    // Remove orphan paths (paths that don't correspond to any camera)
    const cameraIds = new Set(cameras.map(c => `camera-${c.id}`));
    for (const pathName of existingPaths) {
      if (pathName.startsWith('camera-') && !cameraIds.has(pathName)) {
        const cameraId = pathName.replace('camera-', '');
        try {
          await this.mediamtx.removePath(cameraId);
          this.logger.log(`Path órfão ${pathName} removido do MediaMTX na inicialização`);
        } catch (error) {
          this.logger.warn(`Falha ao remover path órfão ${pathName}: ${error}`);
        }
      }
    }
  }

  private async findOneRaw(id: string, actor: Actor): Promise<Camera> {
    const scope = resolveCompanyScope(actor);
    const camera = await this.cameraRepository.findOneBy(
      withCompanyScopeWhere<Camera>({ id }, scope),
    );
    if (!camera) {
      throw new NotFoundException(`Camera with ID ${id} not found`);
    }
    return camera;
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
