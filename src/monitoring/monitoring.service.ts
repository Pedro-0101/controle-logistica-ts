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
    const cameras = await this.cameras.find();
    const results: Array<{ camera: Camera; observation: CurrentObservation }> = [];
    for (const camera of cameras) {
      try {
        const state = await this.anpr.currentObservation(camera.id);
        if (state.status === 'confirmed' && state.observationId && state.placa && this.fresh(state)) {
          results.push({ camera, observation: state });
        }
      } catch {
        // skip cameras that are offline or returning errors
      }
    }
    return results;
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
