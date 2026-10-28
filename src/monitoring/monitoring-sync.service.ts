import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Camera } from '../camera/entities/camera.entity.js';
import { Point } from '../point/entities/point.entity.js';
import { AnprService } from '../anpr/anpr.service.js';
import { MediaMTXService } from '../camera/mediamtx.service.js';
import { CompanyConfigService } from '../company-config/company-config.service.js';
import type { CompanyConfig } from '../company-config/entities/company-config.entity.js';
import { resolveAnprConfig } from '../common/anpr-config.js';
import { MonitoringContextService } from './monitoring-context.service.js';
import { NotificationEventsService } from '../notification/notification-events.service.js';
import {
  buildCameraErrorNotification,
  buildSystemErrorNotification,
  errorMessageOf,
} from '../notification/notification-event.factory.js';

/**
 * Sincroniza os monitores ANPR e os paths do MediaMTX com as câmeras válidas,
 * rodando periodicamente enquanto a aplicação está de pé.
 */
@Injectable()
export class MonitoringSyncService {
  private readonly logger = new Logger(MonitoringSyncService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopped = false;
  private readonly registered = new Set<string>();

  constructor(
    @InjectRepository(Camera) private readonly cameras: Repository<Camera>,
    @InjectRepository(Point) private readonly points: Repository<Point>,
    private readonly anpr: AnprService,
    private readonly mediamtx: MediaMTXService,
    private readonly companyConfigService: CompanyConfigService,
    private readonly config: ConfigService,
    private readonly context: MonitoringContextService,
    private readonly notifications: NotificationEventsService,
  ) {}

  bootstrap() {
    if (this.config.get<string>('MONITORING_ENABLED') === 'false') return;
    void this.syncMediaMTX();
    void this.reconcile();
    this.timer = setInterval(() => { void this.reconcile(); }, 5000);
    this.timer.unref();
  }

  reconcile(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.sync().catch((error: unknown) => {
      this.logger.warn('Não foi possível sincronizar o monitoramento; nova tentativa em 5 segundos');
      this.notifications.publish(
        buildSystemErrorNotification({
          source: 'monitoring.sync',
          message: errorMessageOf(error),
        }),
      );
    }).finally(() => { this.running = undefined; });
    return this.running;
  }

  async destroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  private async sync() {
    const cameras = await this.cameras.find();
    const desired = new Set<string>();
    for (const camera of cameras) {
      if (this.stopped) return;
      if (await this.context.validContext(camera)) {
        desired.add(camera.id);
        try {
          let companyConfig: CompanyConfig | null = null;
          try {
            companyConfig = await this.companyConfigService.findOne(camera.companyId, {
              userId: '', companyId: camera.companyId, role: 'admin',
            } as any);
          } catch { /* empresa sem config — usa defaults */ }
          const point = await this.points.findOneBy({ id: camera.pointId, companyId: camera.companyId });
          const resolved = resolveAnprConfig(companyConfig, point);
          const intervalMs = companyConfig?.cameraSnapshotIntervalMs ?? 1000;
          await this.anpr.upsertMonitor(camera, {
            intervalSeconds: Math.max(0.1, intervalMs / 1000),
            staleAfterSeconds: resolved.anprStaleAfterSeconds,
            confirmationReads: resolved.anprConfirmationReads,
            minConfidence: Number(resolved.anprConfidenceThreshold),
          });
          this.registered.add(camera.id);
        } catch (error: unknown) {
          this.logger.warn(`Monitor indisponível para câmera ${camera.id}: ${errorMessageOf(error)}`);
          this.notifications.publish(
            buildCameraErrorNotification({
              companyId: camera.companyId,
              cameraId: camera.id,
              cameraName: camera.name,
              pointId: camera.pointId,
              kind: 'sync_failed',
              error,
            }),
          );
        }
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
            this.notifications.publish(
              buildCameraErrorNotification({
                companyId: camera.companyId,
                cameraId: camera.id,
                cameraName: camera.name,
                pointId: camera.pointId,
                kind: 'stream_failed',
                error,
              }),
            );
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
      this.notifications.publish(
        buildSystemErrorNotification({
          source: 'monitoring.mediamtx',
          message: errorMessageOf(error),
        }),
      );
    }
  }
}
