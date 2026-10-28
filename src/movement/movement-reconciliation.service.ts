import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Movement } from './entities/movement.entity.js';
import { type Actor, requireCompanyId, resolveCompanyScope } from '../auth/company-scope.js';
import { Vehicle } from '../vehicle/entities/vehicle.entity.js';
import { VehicleService } from '../vehicle/vehicle.service.js';
import { normalizePlate } from '../common/plate.js';
import { Point } from '../point/entities/point.entity.js';
import type { ReconcileMovementsDtoType } from './dto/reconcile-movements.schema.js';
import { MovementEvidenceService } from './movement-evidence.service.js';
import { CameraObservation } from '../monitoring/observation.entity.js';
import { NotificationEventsService } from '../notification/notification-events.service.js';
import { buildMovementNotification } from '../notification/notification-event.factory.js';

const MAX_RECONCILE_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

/**
 * Janela em que leituras da mesma placa são consideradas a mesma passagem.
 * Leituras repetidas dentro desse intervalo não geram novas ocorrências.
 */
const SAME_PASSAGE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Operações de revisão de movimentos: descarte, recálculo individual (após
 * correção de placa) e reconciliação em lote do pareamento entrada/saída.
 */
@Injectable()
export class MovementReconciliationService {
  constructor(
    @InjectRepository(Movement)
    private readonly movementRepository: Repository<Movement>,
    private readonly dataSource: DataSource,
    private readonly vehicleService: VehicleService,
    private readonly evidenceService: MovementEvidenceService,
    private readonly notifications: NotificationEventsService,
  ) {}

  /**
   * Descarta (marca como `discarded`) uma lista de movimentos pendentes.
   *
   * Diferente do recálculo, o descarte é sempre individual: apenas os IDs
   * informados são afetados, mesmo que existam outros pendentes com a mesma placa.
   */
  async discard(ids: string[], actor: Actor) {
    const companyId = requireCompanyId(actor);
    const uniqueIds = [...new Set(ids)];
    const discarded = await this.dataSource.transaction(async (manager) => {
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

    // A foto só é necessária enquanto a leitura aguardava revisão.
    await this.evidenceService.removeEvidenceForObservations(
      discarded.map((movement) => movement.observationId),
    );
    for (const movement of discarded) {
      await this.notifyMovement(movement, 'discarded');
    }
    return discarded;
  }

  async recalculate(id: string, dto: { plate?: string; vehicleId?: string }, actor: Actor) {
    const companyId = requireCompanyId(actor);
    const confirmed = await this.dataSource.transaction(async (manager) => {
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

      // Pendentes da empresa que compartilham a placa reconhecida pelo OCR no
      // movimento alvo e/ou a placa do veículo resolvido.
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

      // Apenas a ocorrência revisada é confirmada. Leituras da mesma placa
      // dentro da janela de 5 minutos são a mesma passagem e viram descarte,
      // evitando registrar ocorrências duplicadas. Leituras mais distantes são
      // ocorrências distintas e continuam pendentes para revisão.
      const duplicates = pendingSamePlate.filter(
        (pending) => pending.id !== movement.id && this.isSamePassage(pending, movement),
      );

      const now = new Date();
      movement.vehicleId = vehicle.id;
      movement.status = 'open';
      movement.recognizedPlate = null;
      movement.recalculatedAt = now;
      movement.updatedById = actor.userId;

      for (const duplicate of duplicates) {
        duplicate.status = 'discarded';
        duplicate.recalculatedAt = now;
        duplicate.updatedById = actor.userId;
      }

      await repository.save([movement, ...duplicates]);

      return {
        movement,
        observationIds: [movement, ...duplicates].map((m) => m.observationId),
      };
    });

    // Ocorrências confirmadas não precisam mais da foto de evidência.
    await this.evidenceService.removeEvidenceForObservations(confirmed.observationIds);
    await this.notifyMovement(confirmed.movement, 'recalculated');
    return confirmed.movement;
  }

  private async notifyMovement(
    movement: Movement,
    action: 'discarded' | 'recalculated',
  ): Promise<void> {
    const point = movement.pointId
      ? await this.dataSource.getRepository(Point).findOneBy({
          id: movement.pointId,
          companyId: movement.companyId,
        })
      : null;
    const vehicle = movement.vehicleId
      ? await this.dataSource.getRepository(Vehicle).findOneBy({
          id: movement.vehicleId,
          companyId: movement.companyId,
        })
      : null;
    const observation = movement.observationId
      ? await this.dataSource.getRepository(CameraObservation).findOneBy({
          id: movement.observationId,
        })
      : null;

    this.notifications.publish(
      buildMovementNotification({
        companyId: movement.companyId,
        movementId: movement.id,
        pointId: movement.pointId ?? null,
        pointName: point?.name ?? null,
        cameraId: observation?.cameraId ?? null,
        movementType: movement.type as 'entry' | 'exit',
        status: movement.status as 'open' | 'closed' | 'pending_review' | 'discarded',
        autoRegistered: movement.autoRegistered,
        plate: vehicle?.plate ?? movement.recognizedPlate ?? null,
        action,
        occurredAt: movement.dateTime,
      }),
    );
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

  private isSamePassage(a: Movement, b: Movement): boolean {
    if (!a.dateTime || !b.dateTime) return false;
    if (a.pointId !== b.pointId) return false;
    return Math.abs(a.dateTime.getTime() - b.dateTime.getTime()) < SAME_PASSAGE_WINDOW_MS;
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
}
