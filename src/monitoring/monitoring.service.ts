import { BadRequestException, ConflictException, Injectable, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Camera } from '../camera/entities/camera.entity.js';
import { AnprService } from '../anpr/anpr.service.js';
import { MediaMTXService } from '../camera/mediamtx.service.js';
import { SnapshotService } from '../camera/snapshot.service.js';
import { type Actor, resolveCompanyScope, withCompanyScopeWhere } from '../auth/company-scope.js';
import { CameraObservation } from './observation.entity.js';
import type { CurrentObservation } from './observation.schema.js';
import { MonitoringContextService } from './monitoring-context.service.js';
import { MonitoringSyncService } from './monitoring-sync.service.js';
import { NotificationEventsService } from '../notification/notification-events.service.js';
import { buildCameraErrorNotification } from '../notification/notification-event.factory.js';

@Injectable()
export class MonitoringService implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(
    @InjectRepository(Camera) private readonly cameras: Repository<Camera>,
    @InjectRepository(CameraObservation) private readonly observations: Repository<CameraObservation>,
    private readonly anpr: AnprService,
    private readonly mediamtx: MediaMTXService,
    private readonly snapshotService: SnapshotService,
    private readonly context: MonitoringContextService,
    private readonly syncService: MonitoringSyncService,
    private readonly notifications: NotificationEventsService,
  ) {}

  onApplicationBootstrap() {
    this.syncService.bootstrap();
  }

  reconcile(): Promise<void> {
    return this.syncService.reconcile();
  }

  async onModuleDestroy() {
    await this.syncService.destroy();
  }

  async cameraInScope(id: string, actor: Actor): Promise<Camera> {
    const camera = await this.cameras.findOneBy(withCompanyScopeWhere<Camera>({ id }, resolveCompanyScope(actor)));
    if (!camera) throw new NotFoundException('Câmera não encontrada');
    if (!await this.context.validContext(camera)) throw new BadRequestException('Ponto ou unidade inválido/inativo para a câmera');
    return camera;
  }

  async current(cameraId: string, actor: Actor): Promise<CurrentObservation> {
    const camera = await this.cameraInScope(cameraId, actor);
    const state = await this.anpr.currentObservation(cameraId);
    if (state.status === 'offline') this.notifyOffline(camera);
    if (state.status !== 'confirmed') return state;
    if (!this.fresh(state)) return { ...state, status: 'stale', placa: null, observationId: null };
    let saved = await this.observations.findOneBy({ id: state.observationId! });
    if (!saved) {
      if (!this.fresh(state)) throw new ConflictException('Observação expirou; consulte novamente');
      await this.observations.createQueryBuilder().insert().values({
        id: state.observationId!, cameraId, pointId: camera.pointId, companyId: camera.companyId,
        plate: state.placa!, confidence: state.confianca!,
        capturedAt: new Date(state.capturedAt!), lastSeenAt: new Date(state.lastSeenAt!),
        expiresAt: new Date(state.expiresAt!),
      }).orIgnore().execute();
      saved = await this.observations.findOneByOrFail({ id: state.observationId! });
    }
    if (saved.cameraId !== cameraId || saved.companyId !== camera.companyId || saved.plate !== state.placa || saved.pointId !== camera.pointId) {
      throw new ConflictException('Identidade da observação inconsistente');
    }
    // Late HTTP responses must never roll back freshness saved by a newer observation read.
    await this.observations.createQueryBuilder().update().set({
      lastSeenAt: new Date(state.lastSeenAt!), expiresAt: new Date(state.expiresAt!),
    }).where('id = :id AND "lastSeenAt" < :lastSeenAt', {
      id: saved.id, lastSeenAt: new Date(state.lastSeenAt!),
    }).execute();
    return state;
  }

  private notifyOffline(camera: Camera): void {
    this.notifications.publish(
      buildCameraErrorNotification({
        companyId: camera.companyId,
        cameraId: camera.id,
        cameraName: camera.name,
        pointId: camera.pointId,
        kind: 'offline',
      }),
    );
  }

  fresh(state: CurrentObservation): boolean {
    return state.status === 'confirmed' && this.usable(state);
  }

  /** Observação utilizável: confirmada ou ainda candidata, com dados e datas válidos. */
  private usable(state: CurrentObservation): boolean {
    const now = Date.now();
    return (state.status === 'confirmed' || state.status === 'candidate') &&
      !!state.observationId && !!state.placa &&
      !!state.expiresAt && !!state.lastSeenAt && !!state.capturedAt &&
      Date.parse(state.expiresAt) > now && Date.parse(state.lastSeenAt) <= now + 1000 &&
      Date.parse(state.capturedAt) <= Date.parse(state.lastSeenAt);
  }

  async assertCurrent(observation: CameraObservation, actor: Actor) {
    const camera = await this.cameraInScope(observation.cameraId, actor);
    const state = await this.anpr.currentObservation(camera.id);
    if (!this.fresh(state) || state.observationId !== observation.id || state.placa !== observation.plate || camera.pointId !== observation.pointId) {
      throw new ConflictException('Observação indisponível, expirada ou substituída; consulte novamente');
    }
  }



  async snapshot(cameraId: string, actor: Actor): Promise<Buffer> {
    const camera = await this.cameraInScope(cameraId, actor);
    return this.snapshotService.capture(camera);
  }

  async getConfirmedObservations(): Promise<Array<{ camera: Camera; observation: CurrentObservation }>> {
    return (await this.getConfirmedObservationsReport()).observations;
  }

  /** Lista as câmeras (opcionalmente de uma empresa) para as métricas. */
  async listCameras(companyId?: string): Promise<Camera[]> {
    return companyId ? this.cameras.find({ where: { companyId } }) : this.cameras.find();
  }

  async getConfirmedObservationsReport(options: {
    cameras?: Camera[];
    dateFrom?: Date;
    dateTo?: Date;
  } = {}) {
    const cameras = options.cameras ?? await this.listCameras();

    if (options.dateFrom || options.dateTo) {
      return this.getHistoricalObservationsReport(cameras, options.dateFrom, options.dateTo);
    }

    const results: Array<{ camera: Camera; observation: CurrentObservation }> = [];
    let unavailableCameras = 0;
    for (const camera of cameras) {
      try {
        const state = await this.anpr.currentObservation(camera.id);
        if (state.status === 'confirmed' && state.observationId && state.placa && this.fresh(state)) {
          results.push({ camera, observation: state });
        }
      } catch {
        unavailableCameras++;
      }
    }
    return { observations: results, checkedCameras: cameras.length, unavailableCameras };
  }

  /**
   * Consulta o histórico persistido quando o filtro de datas é informado.
   * O estado atual do ANPR só representa as leituras recentes, então períodos
   * passados precisam vir de `camera_observations`.
   */
  private async getHistoricalObservationsReport(
    cameras: Camera[],
    dateFrom?: Date,
    dateTo?: Date,
  ) {
    if (cameras.length === 0) {
      return { observations: [], checkedCameras: 0, unavailableCameras: 0 };
    }

    const query = this.observations
      .createQueryBuilder('observation')
      .where('observation.cameraId IN (:...cameraIds)', {
        cameraIds: cameras.map((camera) => camera.id),
      })
      .orderBy('observation.capturedAt', 'DESC')
      .limit(1000);

    if (dateFrom) {
      query.andWhere('observation.capturedAt >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      query.andWhere('observation.capturedAt <= :dateTo', { dateTo });
    }

    const rows = await query.getMany();
    const camerasById = new Map(cameras.map((camera) => [camera.id, camera]));
    const results: Array<{ camera: Camera; observation: CurrentObservation }> = [];
    for (const row of rows) {
      const camera = camerasById.get(row.cameraId);
      if (camera) {
        results.push({ camera, observation: this.toCurrentObservation(row) });
      }
    }

    return { observations: results, checkedCameras: cameras.length, unavailableCameras: 0 };
  }

  private toCurrentObservation(row: CameraObservation): CurrentObservation {
    return {
      cameraId: row.cameraId,
      status: 'confirmed',
      observationId: row.id,
      placa: row.plate,
      confianca: row.confidence,
      capturedAt: row.capturedAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      consecutiveReads: 1,
      box: null,
    };
  }

  /**
   * Observações confirmadas e candidatas (primeira leitura ainda não confirmada).
   * Usado pelo auto-registro para atalhos de placa cadastrada e validação externa
   * na primeira leitura.
   */
  async getActiveObservations(): Promise<Array<{ camera: Camera; observation: CurrentObservation }>> {
    const cameras = await this.cameras.find();
    const results: Array<{ camera: Camera; observation: CurrentObservation }> = [];
    for (const camera of cameras) {
      try {
        if (!await this.context.validContext(camera)) continue;
        const state = await this.anpr.currentObservation(camera.id);
        if (this.usable(state)) {
          results.push({ camera, observation: state });
        }
      } catch {
        // skip cameras that are offline or returning errors
      }
    }
    return results;
  }

  /** Events carry only IDs: always resolve company/point and freshness on the server. */
  async getActiveObservation(cameraId: string): Promise<{ camera: Camera; observation: CurrentObservation } | null> {
    const camera = await this.cameras.findOneBy({ id: cameraId });
    if (!camera || !await this.context.validContext(camera)) return null;
    const observation = await this.anpr.currentObservation(cameraId);
    return this.usable(observation) ? { camera, observation } : null;
  }

  async ensureObservationPersisted(camera: Camera, state: CurrentObservation): Promise<CameraObservation> {
    if (!state.observationId || !state.placa) {
      throw new BadRequestException('Observação incompleta');
    }
    let saved = await this.observations.findOneBy({ id: state.observationId });
    if (!saved) {
      await this.observations.createQueryBuilder().insert().values({
        id: state.observationId, cameraId: camera.id, pointId: camera.pointId, companyId: camera.companyId,
        plate: state.placa, confidence: state.confianca!,
        capturedAt: new Date(state.capturedAt!), lastSeenAt: new Date(state.lastSeenAt!),
        expiresAt: new Date(state.expiresAt!),
      }).orIgnore().execute();
      saved = await this.observations.findOneByOrFail({ id: state.observationId });
    }
    return saved;
  }

  async stream(cameraId: string, actor: Actor) {
    const camera = await this.cameraInScope(cameraId, actor);
    const exists = await this.mediamtx.pathExists(camera.id);
    if (!exists) {
      await this.mediamtx.addPath(camera);
    }
    return {
      cameraId: camera.id,
      ...this.mediamtx.getStreamUrls(camera.id),
    };
  }
}
