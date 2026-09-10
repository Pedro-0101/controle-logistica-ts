import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateMovementDto } from './dto/create-movement.schema.js';
import { CreateMovementFromCameraDto } from './dto/create-movement-from-camera.schema.js';
import { UpdateMovementDto } from './dto/update-movement.schema.js';
import { Movement } from './entities/movement.entity.js';
import {
  type Actor,
  companyScopeFilter,
  forceCompanyId,
  resolveCompanyScope,
  withCompanyScopeWhere,
} from '../auth/company-scope.js';
import { CameraService } from '../camera/camera.service.js';
import { AnprService } from '../anpr/anpr.service.js';
import { VehicleService } from '../vehicle/vehicle.service.js';
import { PointService } from '../point/point.service.js';

@Injectable()
export class MovementService {
  constructor(
    @InjectRepository(Movement)
    private readonly movementRepository: Repository<Movement>,
    private readonly cameraService: CameraService,
    private readonly anprService: AnprService,
    private readonly vehicleService: VehicleService,
    private readonly pointService: PointService,
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

  async createFromCamera(
    createMovementFromCameraDto: CreateMovementFromCameraDto,
    actor: Actor,
  ) {
    const camera = await this.cameraService.findOne(
      createMovementFromCameraDto.cameraId,
      actor,
    );
    const point = await this.pointService.findOne(camera.pointId, actor);

    const type = this.resolveMovementType(point.type, createMovementFromCameraDto.type);

    const reconhecida = await this.anprService.reconhecerCamera(camera);

    const scope = resolveCompanyScope(actor);
    const companyId =
      scope.mode === 'company' ? scope.companyId : createMovementFromCameraDto.companyId;
    if (!companyId) {
      throw new BadRequestException(
        'Company ID é obrigatório para usuários sem empresa vinculada',
      );
    }

    const vehicle = await this.vehicleService.findOrCreateByPlate(
      reconhecida.placa,
      companyId,
      actor,
    );

    const movement = await this.create(
      {
        pointId: camera.pointId,
        vehicleId: vehicle.id,
        type,
        dateTime: createMovementFromCameraDto.dateTime ?? new Date().toISOString(),
        status: 'open',
        companyId,
        purpose: createMovementFromCameraDto.purpose,
        driverName: createMovementFromCameraDto.driverName,
        notes: createMovementFromCameraDto.notes,
      } as CreateMovementDto,
      actor,
    );

    return { movement, vehicle };
  }

  private resolveMovementType(
    pointType: string,
    type?: 'entry' | 'exit',
  ): 'entry' | 'exit' {
    if (pointType === 'entry' || pointType === 'exit') {
      return pointType;
    }
    if (type) {
      return type;
    }
    throw new BadRequestException(
      'O ponto vinculado à câmera aceita entrada e saída; informe o tipo (entry/exit) no payload',
    );
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
