import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, MoreThanOrEqual, Repository } from 'typeorm';
import { CreateMovementDto } from './dto/create-movement.schema.js';
import { CreateMovementFromCameraDto } from './dto/create-movement-from-camera.schema.js';
import { UpdateMovementDto } from './dto/update-movement.schema.js';
import { Movement } from './entities/movement.entity.js';
import {
  type Actor,
  companyScopeFilter,
  requireCompanyId,
  resolveCompanyScope,
  withCompanyScopeWhere,
} from '../auth/company-scope.js';
import { MonitoringService } from '../monitoring/monitoring.service.js';
import { CameraObservation } from '../monitoring/observation.entity.js';
import { Vehicle } from '../vehicle/entities/vehicle.entity.js';
import { CreateMovementFromObservationDto } from './dto/create-movement-from-observation.schema.js';
import { VehicleService, normalizePlate } from '../vehicle/vehicle.service.js';
import { PointService } from '../point/point.service.js';
import { Point } from '../point/entities/point.entity.js';
import { StorageService } from '../storage/storage.service.js';
import type { FindMovementsDtoType } from './dto/find-movements.schema.js';
import type { ReconcileMovementsDtoType } from './dto/reconcile-movements.schema.js';

const MAX_RECONCILE_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

@Injectable()
export class MovementService {
  constructor(
    @InjectRepository(Movement)
    private readonly movementRepository: Repository<Movement>,
    private readonly monitoring: MonitoringService,
    private readonly dataSource: DataSource,
    private readonly vehicleService: VehicleService,
    private readonly pointService: PointService,
    private readonly storage: StorageService,
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

  async createFromCamera(
    createMovementFromCameraDto: CreateMovementFromCameraDto,
    actor: Actor,
  ) {
    requireCompanyId(actor);
    const state = await this.monitoring.current(createMovementFromCameraDto.cameraId, actor);
    if (!this.monitoring.fresh(state)) throw new ConflictException('Nenhuma placa confirmada recente; consulte novamente');
    return this.createFromObservation({ ...createMovementFromCameraDto, observationId: state.observationId! }, actor);
  }

  async createFromObservation(dto: CreateMovementFromObservationDto, actor: Actor) {
    const companyId = requireCompanyId(actor);
    return this.dataSource.transaction(async (manager) => {
      // Serialize confirmations of this observation, including across API processes.
      const observation = await manager.getRepository(CameraObservation).findOne({
        where: { id: dto.observationId, companyId }, lock: { mode: 'pessimistic_write' },
      });
      if (!observation) throw new NotFoundException('Observação não encontrada');
      const repository = manager.getRepository(Movement);
      const existing = await repository.findOneBy({ observationId: observation.id, companyId });
      if (existing) {
        const vehicle = existing.vehicleId
          ? await manager.getRepository(Vehicle).findOneByOrFail({ id: existing.vehicleId, companyId })
          : null;
        return { movement: existing, vehicle };
      }
      if (observation.expiresAt.getTime() <= Date.now()) throw new ConflictException('Observação expirada; consulte novamente');
      await this.monitoring.assertCurrent(observation, actor);
      const point = await this.pointService.findOne(observation.pointId, actor);
      if (!point.active) throw new BadRequestException('Ponto inativo');
      const type = this.resolveMovementType(point.type, dto.type);
      const vehicle = await this.vehicleService.findOrCreateByPlate(observation.plate, companyId, actor, manager);
      if (!vehicle.active) throw new BadRequestException('Veículo inativo');
      const movement = await repository.save(repository.create({
        observationId: observation.id,
        pointId: observation.pointId,
        vehicleId: vehicle.id,
        type,
        dateTime: dto.dateTime ? new Date(dto.dateTime) : new Date(),
        status: 'open',
        purpose: dto.purpose, driverName: dto.driverName, notes: dto.notes,
        companyId, createdById: actor.userId,
      }));
      await this.closeUnitVisit(manager, movement, point, actor.userId);
      return { movement, vehicle };
    });
  }

  /**
   * Fecha o ciclo de visita de uma unidade.
   *
   * Quando um movimento de saída confirmado é registrado, o movimento de entrada
   * em aberto mais recente do mesmo veículo, na mesma empresa e mesma unidade
   * administrativa, é finalizado (`closed`). O próprio movimento de saída também
   * passa para `closed`, indicando que a passagem pelo ponto foi concluída.
   */
  private async closeUnitVisit(
    manager: EntityManager,
    movement: Movement,
    point: Point,
    actorId: string,
  ): Promise<void> {
    if (movement.type !== 'exit' || movement.status !== 'open' || !movement.vehicleId) {
      return;
    }

    const repository = manager.getRepository(Movement);
    const openEntry = await repository
      .createQueryBuilder('m')
      .innerJoin('points', 'point', 'point.id = m.pointId')
      .where('m.vehicleId = :vehicleId', { vehicleId: movement.vehicleId })
      .andWhere('m.companyId = :companyId', { companyId: movement.companyId })
      .andWhere('m.type = :entryType', { entryType: 'entry' })
      .andWhere('m.status = :openStatus', { openStatus: 'open' })
      .andWhere('point.adminUnityId = :adminUnityId', { adminUnityId: point.adminUnityId })
      .andWhere('m.dateTime <= :dateTime', { dateTime: movement.dateTime })
      .orderBy('m.dateTime', 'DESC')
      .getOne();

    movement.status = 'closed';
    movement.updatedById = actorId;

    if (!openEntry) {
      await repository.save(movement);
      return;
    }

    openEntry.status = 'closed';
    openEntry.updatedById = actorId;
    await repository.save([openEntry, movement]);
  }

  private resolveMovementType(
    pointType: string,
    type?: 'entry' | 'exit',
  ): 'entry' | 'exit' {
    if (pointType === 'entry' || pointType === 'exit') {
      if (type && type !== pointType) throw new BadRequestException('Tipo incompatível com o sentido do ponto');
      return pointType;
    }
    if (type) {
      return type;
    }
    throw new BadRequestException(
      'O ponto vinculado à câmera aceita entrada e saída; informe o tipo (entry/exit) no payload',
    );
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
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

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
      meta: { page, limit, total, totalPages },
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
   * Descarta (marca como `discarded`) uma lista de movimentos pendentes.
   *
   * Diferente do recálculo, o descarte é sempre individual: apenas os IDs
   * informados são afetados, mesmo que existam outros pendentes com a mesma placa.
   */
  async discard(ids: string[], actor: Actor) {
    const companyId = requireCompanyId(actor);
    const uniqueIds = [...new Set(ids)];
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Movement);
      const movements = await repository.find({
        where: { id: In(uniqueIds), companyId },
        lock: { mode: 'pessimistic_write' },
      });

      const foundIds = new Set(movements.map((m) => m.id));
      const missing = uniqueIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new NotFoundException(`Movimento(s) não encontrado(s): ${missing.join(', ')}`);
      }

      const notPending = movements.filter((m) => m.status !== 'pending_review');
      if (notPending.length > 0) {
        throw new ConflictException(
          `Apenas movimentos pendentes de revisão podem ser descartados: ${notPending.map((m) => m.id).join(', ')}`,
        );
      }

      for (const movement of movements) {
        movement.status = 'discarded';
        movement.updatedById = actor.userId;
      }

      return repository.save(movements);
    });
  }

  async recalculate(id: string, dto: { plate?: string; vehicleId?: string }, actor: Actor) {
    const companyId = requireCompanyId(actor);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Movement);
      const movement = await repository.findOne({
        where: { id, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!movement) throw new NotFoundException('Movimento não encontrado');
      if (movement.status !== 'pending_review') {
        throw new ConflictException('Apenas movimentos pendentes de revisão podem ser recalculados');
      }

      let vehicle: Vehicle;
      if (dto.vehicleId) {
        vehicle = await this.vehicleService.findOne(dto.vehicleId, actor);
      } else if (dto.plate) {
        const found = await this.vehicleService.findByPlate(dto.plate, companyId);
        if (!found) {
          throw new NotFoundException(`Veículo com placa ${dto.plate} não encontrado na base de dados`);
        }
        vehicle = found;
      } else {
        throw new BadRequestException('Informe a placa ou o ID do veículo para recálculo');
      }

      if (!vehicle.active) throw new BadRequestException('Veículo informado está inativo');

      // Confirma todos os pendentes da empresa que compartilham a mesma placa:
      // a placa reconhecida pelo OCR no movimento alvo e a placa do veículo resolvido.
      const targetPlates = new Set<string>();
      if (movement.recognizedPlate) targetPlates.add(movement.recognizedPlate);
      if (vehicle.plate) targetPlates.add(normalizePlate(vehicle.plate));

      const pendingSamePlate = targetPlates.size > 0
        ? await repository.find({
            where: {
              companyId,
              status: 'pending_review',
              recognizedPlate: In([...targetPlates]),
            },
            lock: { mode: 'pessimistic_write' },
          })
        : [];

      const toConfirm = pendingSamePlate.some((m) => m.id === movement.id)
        ? pendingSamePlate
        : [...pendingSamePlate, movement];

      const now = new Date();
      for (const pending of toConfirm) {
        pending.vehicleId = vehicle.id;
        pending.status = 'open';
        pending.recognizedPlate = null;
        pending.recalculatedAt = now;
        pending.updatedById = actor.userId;
      }

      await repository.save(toConfirm);

      return toConfirm.find((m) => m.id === movement.id)!;
    });
  }

  /**
   * Recalcula em lote o pareamento de entradas e saídas de um período.
   *
   * Para cada veículo + unidade, os movimentos confirmados (`open`/`closed`) são
   * ordenados por data e pareados: uma saída fecha a entrada mais recente ainda
   * em aberto. Entradas que sobraram voltam para `open` e saídas sem entrada
   * correspondente permanecem com o status atual. Movimentos `pending_review` e
   * `discarded` não participam do pareamento.
   */
  async reconcile(dto: ReconcileMovementsDtoType, actor: Actor) {
    const scope = resolveCompanyScope(actor);
    const companyId = scope.mode === 'company' ? scope.companyId : dto.companyId;
    if (!companyId) {
      throw new ForbiddenException(
        'Informe companyId (admin global) ou esteja vinculado a uma empresa para recalcular',
      );
    }

    const dateFrom = new Date(dto.dateFrom);
    const dateTo = new Date(dto.dateTo);
    if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime()) || dateFrom > dateTo) {
      throw new BadRequestException('Período inválido: dateFrom deve ser anterior ou igual a dateTo');
    }
    if (dateTo.getTime() - dateFrom.getTime() > MAX_RECONCILE_WINDOW_MS) {
      throw new BadRequestException('Período máximo permitido para recálculo é de 31 dias');
    }

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Movement);
      const { entities, raw } = await repository
        .createQueryBuilder('m')
        .innerJoin(Point, 'point', 'point.id = m.pointId')
        .addSelect('point.adminUnityId', 'unitId')
        .where('m.companyId = :companyId', { companyId })
        .andWhere('m.dateTime >= :dateFrom', { dateFrom })
        .andWhere('m.dateTime <= :dateTo', { dateTo })
        .andWhere('m.vehicleId IS NOT NULL')
        .andWhere('m.status IN (:...statuses)', { statuses: ['open', 'closed'] })
        .orderBy('m.dateTime', 'ASC')
        .addOrderBy('m.createdAt', 'ASC')
        .getRawAndEntities();

      const groups = new Map<string, Movement[]>();
      entities.forEach((movement, index) => {
        const unitId = raw[index]?.unitId as string | undefined;
        if (!unitId || !movement.vehicleId) return;
        const key = `${movement.vehicleId}::${unitId}`;
        const group = groups.get(key);
        if (group) group.push(movement);
        else groups.set(key, [movement]);
      });

      const changes: Array<{ movement: Movement; previousStatus: string }> = [];
      let unmatchedExits = 0;

      for (const group of groups.values()) {
        const openEntries: Movement[] = [];
        for (const movement of group) {
          if (movement.type === 'entry') {
            openEntries.push(movement);
            continue;
          }
          if (movement.type !== 'exit') continue;

          const entry = openEntries.pop();
          if (!entry) {
            unmatchedExits += 1;
            continue;
          }
          this.stageStatusChange(entry, 'closed', actor.userId, changes);
          this.stageStatusChange(movement, 'closed', actor.userId, changes);
        }
        for (const entry of openEntries) {
          this.stageStatusChange(entry, 'open', actor.userId, changes);
        }
      }

      if (changes.length > 0) {
        await repository.save(changes.map((change) => change.movement));
      }

      return {
        range: { dateFrom: dto.dateFrom, dateTo: dto.dateTo },
        companyId,
        analyzed: entities.length,
        closed: changes.filter((change) => change.movement.status === 'closed').length,
        reopened: changes.filter((change) => change.movement.status === 'open').length,
        unchanged: entities.length - changes.length,
        unmatchedExits,
        movements: changes.map((change) => ({
          id: change.movement.id,
          vehicleId: change.movement.vehicleId,
          pointId: change.movement.pointId ?? null,
          type: change.movement.type as 'entry' | 'exit',
          dateTime: change.movement.dateTime.toISOString(),
          previousStatus: change.previousStatus as 'open' | 'closed',
          status: change.movement.status as 'open' | 'closed',
        })),
      };
    });
  }

  private stageStatusChange(
    movement: Movement,
    status: 'open' | 'closed',
    actorId: string,
    changes: Array<{ movement: Movement; previousStatus: string }>,
  ): void {
    if (movement.status === status) return;
    changes.push({ movement, previousStatus: movement.status });
    movement.status = status;
    movement.updatedById = actorId;
  }

  async createAutoRegistered(params: {
    observation: CameraObservation;
    vehicle: Vehicle | null;
    recognizedPlate: string;
    companyId: string;
    systemUserId: string;
    recognitionProvider?: string | null;
    recognitionConfidence?: number | null;
  }): Promise<Movement> {
    const {
      observation, vehicle, recognizedPlate, companyId, systemUserId,
      recognitionProvider, recognitionConfidence,
    } = params;

    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(Movement).findOneBy({ observationId: observation.id, companyId });
      if (existing) return existing;

      const point = await this.pointService.findOne(observation.pointId, { userId: systemUserId, companyId, role: 'admin' } as Actor);
      if (!point.active) throw new BadRequestException('Ponto inativo');

      const type = this.resolveMovementType(point.type, point.type === 'both' ? 'entry' as const : undefined);

      const movement = manager.getRepository(Movement).create({
        observationId: observation.id,
        pointId: observation.pointId,
        vehicleId: vehicle?.id ?? null,
        type,
        dateTime: observation.capturedAt,
        status: vehicle ? 'open' : 'pending_review',
        recognizedPlate,
        autoRegistered: true,
        recognitionProvider: recognitionProvider ?? null,
        recognitionConfidence: recognitionConfidence ?? null,
        companyId,
        createdById: systemUserId,
      });

      const saved = await manager.getRepository(Movement).save(movement);
      await this.closeUnitVisit(manager, saved, point, systemUserId);
      return saved;
    });
  }

  async hasRecentMovement(vehicleId: string, pointId: string, cooldownSeconds: number, companyId: string): Promise<boolean> {
    const cutoff = new Date(Date.now() - cooldownSeconds * 1000);
    const count = await this.movementRepository.count({
      where: {
        vehicleId,
        pointId,
        companyId,
        dateTime: MoreThanOrEqual(cutoff),
      },
    });
    return count > 0;
  }

  /** Cooldown por placa reconhecida, usado quando o veículo ainda não está cadastrado. */
  async hasRecentMovementByPlate(recognizedPlate: string, pointId: string, cooldownSeconds: number, companyId: string): Promise<boolean> {
    const cutoff = new Date(Date.now() - cooldownSeconds * 1000);
    const count = await this.movementRepository.count({
      where: {
        recognizedPlate,
        pointId,
        companyId,
        dateTime: MoreThanOrEqual(cutoff),
      },
    });
    return count > 0;
  }

  async findExistingByObservation(observationId: string, companyId: string): Promise<Movement | null> {
    return this.movementRepository.findOneBy({ observationId, companyId });
  }

  async findObservationPhotoPath(observationId: string): Promise<{ photoPath: string | null } | null> {
    const obs = await this.dataSource.getRepository(CameraObservation).findOneBy({ id: observationId });
    return obs ? { photoPath: obs.photoPath } : null;
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
    if (!movement.observationId) {
      throw new NotFoundException('Movimento não possui foto de evidência');
    }
    const observation = await this.dataSource
      .getRepository(CameraObservation)
      .findOneBy({ id: movement.observationId, companyId: movement.companyId });
    if (!observation?.photoPath) {
      throw new NotFoundException('Foto de evidência não disponível para este movimento');
    }
    try {
      const buffer = await this.storage.getEvidence(observation.photoPath);
      return { buffer, contentType: 'image/jpeg' };
    } catch {
      throw new NotFoundException('Foto de evidência não encontrada no armazenamento');
    }
  }

  private async validateReferences(vehicleId: string | null, pointId: string | undefined, type: string, actor: Actor) {
    if (!vehicleId) throw new BadRequestException('Veículo é obrigatório');
    const vehicle = await this.vehicleService.findOne(vehicleId, actor);
    if (!vehicle.active) throw new BadRequestException('Veículo inativo');
    if (pointId) {
      const point = await this.pointService.findOne(pointId, actor);
      if (point.companyId !== vehicle.companyId || !point.active) throw new BadRequestException('Ponto inválido para o veículo');
      this.resolveMovementType(point.type, type as 'entry' | 'exit');
    }
  }
}
