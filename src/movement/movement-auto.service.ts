import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, MoreThanOrEqual, Repository } from 'typeorm';
import { CreateMovementFromCameraDto } from './dto/create-movement-from-camera.schema.js';
import { CreateMovementFromObservationDto } from './dto/create-movement-from-observation.schema.js';
import { Movement } from './entities/movement.entity.js';
import { type Actor, requireCompanyId } from '../auth/company-scope.js';
import { MonitoringService } from '../monitoring/monitoring.service.js';
import { CameraObservation } from '../monitoring/observation.entity.js';
import { Vehicle } from '../vehicle/entities/vehicle.entity.js';
import { VehicleService } from '../vehicle/vehicle.service.js';
import { PointService } from '../point/point.service.js';
import { Point } from '../point/entities/point.entity.js';
import { resolveMovementType } from './movement-type.js';

/**
 * Fluxos de criação automática/por câmera e as consultas de apoio (cooldown,
 * existência por observação e fechamento de ciclo de visita).
 *
 * Separado do CRUD para manter a lógica de auto-registro em um único lugar.
 */
@Injectable()
export class MovementAutoService {
  constructor(
    @InjectRepository(Movement)
    private readonly movementRepository: Repository<Movement>,
    private readonly monitoring: MonitoringService,
    private readonly dataSource: DataSource,
    private readonly vehicleService: VehicleService,
    private readonly pointService: PointService,
  ) {}

  async createFromCamera(createMovementFromCameraDto: CreateMovementFromCameraDto, actor: Actor) {
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
      const type = resolveMovementType(point.type, dto.type);
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

      const type = resolveMovementType(point.type, point.type === 'both' ? 'entry' as const : undefined);

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
}
