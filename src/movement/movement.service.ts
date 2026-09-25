import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateMovementDto } from './dto/create-movement.schema.js';
import { CreateMovementFromCameraDto } from './dto/create-movement-from-camera.schema.js';
import { CreateMovementFromObservationDto } from './dto/create-movement-from-observation.schema.js';
import { UpdateMovementDto } from './dto/update-movement.schema.js';
import { Movement } from './entities/movement.entity.js';
import {
  type Actor,
  companyScopeFilter,
  requireCompanyId,
  resolveCompanyScope,
  withCompanyScopeWhere,
} from '../auth/company-scope.js';
import { Vehicle } from '../vehicle/entities/vehicle.entity.js';
import { VehicleService } from '../vehicle/vehicle.service.js';
import { PointService } from '../point/point.service.js';
import { CameraObservation } from '../monitoring/observation.entity.js';
import type { FindMovementsDtoType } from './dto/find-movements.schema.js';
import type { ReconcileMovementsDtoType } from './dto/reconcile-movements.schema.js';
import { paginationMeta, paginationSkip } from '../common/pagination.js';
import { resolveMovementType } from './movement-type.js';
import { MovementAutoService } from './movement-auto.service.js';
import { MovementReconciliationService } from './movement-reconciliation.service.js';
import { MovementEvidenceService } from './movement-evidence.service.js';

/**
 * Fachada de movimentos: CRUD/consultas e delegação para os serviços
 * especializados de auto-registro, revisão/reconciliação e evidência.
 */
@Injectable()
export class MovementService {
  constructor(
    @InjectRepository(Movement)
    private readonly movementRepository: Repository<Movement>,
    private readonly vehicleService: VehicleService,
    private readonly pointService: PointService,
    private readonly autoService: MovementAutoService,
    private readonly reconciliationService: MovementReconciliationService,
    private readonly evidenceService: MovementEvidenceService,
  ) {}

  async create(createMovementDto: CreateMovementDto, actor: Actor) {
    const companyId = requireCompanyId(actor);
    await this.validateReferences(createMovementDto.vehicleId, createMovementDto.pointId, createMovementDto.type, actor);
    const movement = this.movementRepository.create({
      ...createMovementDto,
      companyId,
      createdById: actor.userId,
    });
    return this.movementRepository.save(movement);
  }

  createFromCamera(createMovementFromCameraDto: CreateMovementFromCameraDto, actor: Actor) {
    return this.autoService.createFromCamera(createMovementFromCameraDto, actor);
  }

  createFromObservation(dto: CreateMovementFromObservationDto, actor: Actor) {
    return this.autoService.createFromObservation(dto, actor);
  }

  async findAll(actor: Actor, filters: FindMovementsDtoType) {
    const scope = resolveCompanyScope(actor);
    const { page, limit, type, status, pointId, vehicleId, plate, driverName, purpose, autoRegistered, dateFrom, dateTo, search, orderBy, order } = filters;

    const qb = this.movementRepository
      .createQueryBuilder('m')
      .leftJoin('points', 'point', 'point.id = m.pointId')
      .addSelect([
        'point.id AS point_id',
        'point.name AS point_name',
        'point.code AS point_code',
        'point.type AS point_type',
      ])
      .leftJoin('vehicles', 'vehicle', 'vehicle.id = m.vehicleId')
      .addSelect([
        'vehicle.id AS vehicle_id',
        'vehicle.plate AS vehicle_plate',
        'vehicle.code AS vehicle_code',
        'vehicle.type AS vehicle_type',
        'vehicle.active AS vehicle_active',
      ])
      .leftJoin('camera_observations', 'obs', 'obs.id = m.observationId')
      .leftJoin('cameras', 'cam', 'cam.id = obs.cameraId')
      .addSelect([
        'cam.id AS cam_id',
        'cam.name AS cam_name',
        'cam.ip AS cam_ip',
      ]);

    if (scope.mode === 'company') {
      qb.andWhere('m.companyId = :companyId', { companyId: scope.companyId });
    }

    if (type) {
      qb.andWhere('m.type = :type', { type });
    }
    if (status) {
      qb.andWhere('m.status = :status', { status });
    }
    if (pointId) {
      qb.andWhere('m.pointId = :pointId', { pointId });
    }
    if (vehicleId) {
      qb.andWhere('m.vehicleId = :vehicleId', { vehicleId });
    }
    if (plate) {
      qb.andWhere('vehicle.plate ILIKE :plate', { plate: `%${plate}%` });
    }
    if (driverName) {
      qb.andWhere('m.driverName ILIKE :driverName', { driverName: `%${driverName}%` });
    }
    if (purpose) {
      qb.andWhere('m.purpose ILIKE :purpose', { purpose: `%${purpose}%` });
    }
    if (autoRegistered !== undefined) {
      qb.andWhere('m.autoRegistered = :autoRegistered', { autoRegistered });
    }
    if (dateFrom) {
      qb.andWhere('m.dateTime >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      qb.andWhere('m.dateTime <= :dateTo', { dateTo });
    }
    if (search) {
      qb.andWhere(
        '(vehicle.plate ILIKE :search OR m.driverName ILIKE :search OR m.purpose ILIKE :search OR m.notes ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const allowedOrderColumns: Record<string, string> = {
      dateTime: 'm.dateTime',
      createdAt: 'm.createdAt',
      status: 'm.status',
      type: 'm.type',
    };
    const orderColumn = allowedOrderColumns[orderBy] ?? 'm.dateTime';
    qb.orderBy(orderColumn, order === 'ASC' ? 'ASC' : 'DESC');

    const total = await qb.getCount();
    qb.skip(paginationSkip(page, limit)).take(limit);

    const rawResults = await qb.getRawAndEntities();

    const data = rawResults.entities.map((movement, idx) => {
      const raw = rawResults.raw[idx];
      return {
        ...movement,
        point: raw?.point_id
          ? { id: raw.point_id, name: raw.point_name, code: raw.point_code, type: raw.point_type }
          : null,
        vehicle: raw?.vehicle_id
          ? { id: raw.vehicle_id, plate: raw.vehicle_plate, code: raw.vehicle_code, type: raw.vehicle_type, active: raw.vehicle_active }
          : null,
        camera: raw?.cam_id
          ? { id: raw.cam_id, name: raw.cam_name, ip: raw.cam_ip }
          : null,
      };
    });

    return {
      data,
      meta: paginationMeta(page, limit, total),
    };
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
    const movement = await this.findOne(id, actor);
    if (movement.observationId && (
      (updateMovementDto.vehicleId !== undefined && updateMovementDto.vehicleId !== movement.vehicleId) ||
      (updateMovementDto.pointId !== undefined && updateMovementDto.pointId !== movement.pointId) ||
      (updateMovementDto.type !== undefined && updateMovementDto.type !== movement.type)
    )) throw new ConflictException('O contexto de um movimento confirmado é imutável');
    await this.validateReferences(updateMovementDto.vehicleId ?? movement.vehicleId,
      updateMovementDto.pointId ?? movement.pointId, updateMovementDto.type ?? movement.type, actor);
    Object.assign(movement, updateMovementDto, { updatedById: actor.userId });
    return this.movementRepository.save(movement);
  }

  async remove(id: string, actor: Actor) {
    const movement = await this.findOne(id, actor);
    if (movement.observationId) throw new ConflictException('Movimento confirmado deve ser preservado para auditoria');
    return this.movementRepository.remove(movement);
  }

  async findPendingReview(actor: Actor) {
    const scope = resolveCompanyScope(actor);
    return this.movementRepository.find({
      where: {
        ...companyScopeFilter<Movement>(scope),
        status: 'pending_review',
      },
      order: { dateTime: 'DESC' },
    });
  }

  /**
   * Movimentos pendentes de revisão já enriquecidos com a chave da foto de
   * evidência, prontos para exibição no painel do operador.
   */
  async findPendingReviewDetailed(actor: Actor) {
    const movements = await this.findPendingReview(actor);
    return Promise.all(
      movements.map(async (m) => {
        let photoPath: string | null = null;
        if (m.observationId) {
          const obs = await this.evidenceService.findObservationPhotoPath(m.observationId);
          photoPath = obs?.photoPath ?? null;
        }
        return {
          id: m.id,
          observationId: m.observationId,
          pointId: m.pointId,
          vehicleId: m.vehicleId,
          recognizedPlate: m.recognizedPlate,
          type: m.type,
          dateTime: m.dateTime.toISOString(),
          status: m.status,
          companyId: m.companyId,
          autoRegistered: m.autoRegistered,
          photoPath,
          createdAt: m.createdAt.toISOString(),
        };
      }),
    );
  }

  discard(ids: string[], actor: Actor) {
    return this.reconciliationService.discard(ids, actor);
  }

  recalculate(id: string, dto: { plate?: string; vehicleId?: string }, actor: Actor) {
    return this.reconciliationService.recalculate(id, dto, actor);
  }

  reconcile(dto: ReconcileMovementsDtoType, actor: Actor) {
    return this.reconciliationService.reconcile(dto, actor);
  }

  createAutoRegistered(params: {
    observation: CameraObservation;
    vehicle: Vehicle | null;
    recognizedPlate: string;
    companyId: string;
    systemUserId: string;
    recognitionProvider?: string | null;
    recognitionConfidence?: number | null;
  }): Promise<Movement> {
    return this.autoService.createAutoRegistered(params);
  }

  hasRecentMovement(vehicleId: string, pointId: string, cooldownSeconds: number, companyId: string): Promise<boolean> {
    return this.autoService.hasRecentMovement(vehicleId, pointId, cooldownSeconds, companyId);
  }

  hasRecentMovementByPlate(recognizedPlate: string, pointId: string, cooldownSeconds: number, companyId: string): Promise<boolean> {
    return this.autoService.hasRecentMovementByPlate(recognizedPlate, pointId, cooldownSeconds, companyId);
  }

  findExistingByObservation(observationId: string, companyId: string): Promise<Movement | null> {
    return this.autoService.findExistingByObservation(observationId, companyId);
  }

  findObservationPhotoPath(observationId: string) {
    return this.evidenceService.findObservationPhotoPath(observationId);
  }

  /**
   * Recupera a foto de evidência de um movimento a partir do seu ID.
   *
   * A resolução passa por movimento → observação → chave no storage
   * (MinIO ou disco local). Lança 404 quando o movimento não pertence ao
   * escopo do usuário, não possui observação vinculada, não tem foto salva
   * ou o objeto não existe mais no armazenamento.
   */
  async getEvidence(id: string, actor: Actor): Promise<{ buffer: Buffer; contentType: string }> {
    const movement = await this.findOne(id, actor);
    return this.evidenceService.loadEvidence(movement);
  }

  private async validateReferences(vehicleId: string | null, pointId: string | undefined, type: string, actor: Actor) {
    if (!vehicleId) throw new BadRequestException('Veículo é obrigatório');
    const vehicle = await this.vehicleService.findOne(vehicleId, actor);
    if (!vehicle.active) throw new BadRequestException('Veículo inativo');
    if (pointId) {
      const point = await this.pointService.findOne(pointId, actor);
      if (point.companyId !== vehicle.companyId || !point.active) throw new BadRequestException('Ponto inválido para o veículo');
      resolveMovementType(point.type, type as 'entry' | 'exit');
    }
  }
}
