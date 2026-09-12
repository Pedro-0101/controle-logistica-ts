import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Camera } from '../camera/entities/camera.entity.js';
import { Point } from '../point/entities/point.entity.js';
import { AdminUnity } from '../admin-unity/entities/admin-unity.entity.js';
import { AnprService } from '../anpr/anpr.service.js';
import { MediaMTXService } from '../camera/mediamtx.service.js';
import { SnapshotService } from '../camera/snapshot.service.js';
import { type Actor, resolveCompanyScope, withCompanyScopeWhere } from '../auth/company-scope.js';
import { CameraObservation } from './observation.entity.js';
import type { CurrentObservation } from './observation.schema.js';

@Injectable()
export class MonitoringService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MonitoringService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopped = false;
  private readonly registered = new Set<string>();

  constructor(
    @InjectRepository(Camera) private readonly cameras: Repository<Camera>,
    @InjectRepository(Point) private readonly points: Repository<Point>,
    @InjectRepository(AdminUnity) private readonly units: Repository<AdminUnity>,
    @InjectRepository(CameraObservation) private readonly observations: Repository<CameraObservation>,
    private readonly anpr: AnprService,
    private readonly mediamtx: MediaMTXService,
    private readonly snapshotService: SnapshotService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get<string>('MONITORING_ENABLED') === 'false') return;
    void this.syncMediaMTX();
    void this.reconcile();
    this.timer = setInterval(() => { void this.reconcile(); }, 5000);
    this.timer.unref();
  }

  reconcile(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.sync().catch(() => {
      this.logger.warn('Não foi possível sincronizar o monitoramento; nova tentativa em 5 segundos');
    }).finally(() => { this.running = undefined; });
    return this.running;
  }

  private async sync() {
    const cameras = await this.cameras.find();
    const desired = new Set<string>();
    for (const camera of cameras) {
      if (this.stopped) return;
      if (await this.validContext(camera)) {
        desired.add(camera.id);
        try {
          await this.anpr.upsertMonitor(camera);
          this.registered.add(camera.id);
        } catch { this.logger.warn(`Monitor indisponível para câmera ${camera.id}`); }
      }
    }
    // Single Nest owner per Python instance; also removes leftovers after a Nest restart.
    const remote = await this.anpr.listMonitors();
    for (const id of new Set([...remote, ...this.registered])) {
      if (this.stopped) return;
      if (!desired.has(id)) {
        await this.anpr.deleteMonitor(id);
        this.registered.delete(id);
      }
    }
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  private async syncMediaMTX() {
    try {
      const cameras = await this.cameras.find();
      const existingPaths = await this.mediamtx.listPaths();

      // Add paths for cameras that don't have them
      for (const camera of cameras) {
        if (this.stopped) return;
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
        if (this.stopped) return;
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
    } catch (error) {
      this.logger.warn(`Falha ao sincronizar câmeras com MediaMTX: ${error}`);
    }
  }

  private async validContext(camera: Camera): Promise<boolean> {
    const [point, unit] = await Promise.all([
      this.points.findOneBy({ id: camera.pointId, companyId: camera.companyId, active: true }),
      this.units.findOneBy({ id: camera.adminUnityId, companyId: camera.companyId, active: true }),
    ]);
    return !!point && !!unit && point.adminUnityId === unit.id;
  }

  async cameraInScope(id: string, actor: Actor): Promise<Camera> {
    const camera = await this.cameras.findOneBy(withCompanyScopeWhere<Camera>({ id }, resolveCompanyScope(actor)));
    if (!camera) throw new NotFoundException('Câmera não encontrada');
    if (!await this.validContext(camera)) throw new BadRequestException('Ponto ou unidade inválido/inativo para a câmera');
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
    const now = Date.now();
    return state.status === 'confirmed' && !!state.observationId && !!state.placa &&
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
