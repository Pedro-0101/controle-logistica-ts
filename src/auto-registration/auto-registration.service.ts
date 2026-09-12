import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MonitoringService } from '../monitoring/monitoring.service.js';
import { AnprService } from '../anpr/anpr.service.js';
import { VehicleService } from '../vehicle/vehicle.service.js';
import { MovementService } from '../movement/movement.service.js';
import { CompanyConfigService } from '../company-config/company-config.service.js';
import { Camera } from '../camera/entities/camera.entity.js';
import { CameraObservation } from '../monitoring/observation.entity.js';
import type { CurrentObservation } from '../monitoring/observation.schema.js';

@Injectable()
export class AutoRegistrationService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AutoRegistrationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopped = false;
  private readonly processed = new Set<string>();

  constructor(
    private readonly monitoring: MonitoringService,
    private readonly anpr: AnprService,
    private readonly vehicleService: VehicleService,
    private readonly movementService: MovementService,
    private readonly companyConfigService: CompanyConfigService,
    @InjectRepository(CameraObservation) private readonly observations: Repository<CameraObservation>,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get<string>('MONITORING_ENABLED') === 'false') return;
    void this.reconcile();
    this.timer = setInterval(() => { void this.reconcile(); }, 3000);
    this.timer.unref();
  }

  reconcile(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.process().catch((err) => {
      this.logger.warn(`Auto-registration error: ${err?.message ?? err}`);
    }).finally(() => { this.running = undefined; });
    return this.running;
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  private async process() {
    const confirmed = await this.monitoring.getConfirmedObservations();
    for (const { camera, observation } of confirmed) {
      if (this.stopped) return;
      if (this.processed.has(observation.observationId!)) continue;
      try {
        await this.processObservation(camera, observation);
        this.processed.add(observation.observationId!);
      } catch (err) {
        this.logger.warn(`Failed to auto-register for camera ${camera.id}: ${String(err)}`);
      }
    }
    // Evitar memory leak: manter apenas os últimos 1000 IDs processados
    if (this.processed.size > 1000) {
      const arr = [...this.processed];
      this.processed.clear();
      for (const id of arr.slice(-500)) this.processed.add(id);
    }
  }

  private async processObservation(camera: Camera, state: CurrentObservation) {
    const companyId = camera.companyId;
    const config = await this.companyConfigService.findOne(companyId, {
      userId: '', companyId, role: 'admin',
    } as any);

    if (!config.anprAutoRegister) return;

    const observation = await this.monitoring.ensureObservationPersisted(camera, state);

    const existingMovement = await this.movementService.findExistingByObservation(observation.id, companyId);
    if (existingMovement) return;

    if (config.anprAutoRegisterCooldownSeconds > 0) {
      const vehicle = await this.vehicleService.findByPlate(state.placa!, companyId);
      if (vehicle) {
        const hasRecent = await this.movementService.hasRecentMovement(
          vehicle.id, camera.pointId, config.anprAutoRegisterCooldownSeconds, companyId,
        );
        if (hasRecent) {
          this.logger.debug(`Cooldown active for vehicle ${vehicle.id} at point ${camera.pointId}`);
          return;
        }
      }
    }

    const vehicle = await this.vehicleService.findByPlate(state.placa!, companyId);

    if (!vehicle && config.anprSaveUnrecognizedPhotos) {
      await this.saveEvidencePhoto(camera, observation, companyId);
    }

    const systemUserId = await this.getSystemUserId(companyId);

    await this.movementService.createAutoRegistered({
      observation,
      vehicle,
      recognizedPlate: state.placa!,
      companyId,
      systemUserId,
    });

    this.logger.log(
      `Auto-registered movement: plate=${state.placa!} camera=${camera.id} ` +
      `vehicle=${vehicle ? 'found' : 'NOT FOUND'} → ${vehicle ? 'open' : 'pending_review'}`,
    );
  }

  private async saveEvidencePhoto(camera: Camera, observation: CameraObservation, companyId: string) {
    try {
      const imageBuffer = await this.anpr.observationImage(camera.id, observation.id);
      const date = new Date().toISOString().slice(0, 10);
      const dir = path.join('storage', 'evidence', companyId, date);
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, `${observation.id}.jpg`);
      fs.writeFileSync(filePath, imageBuffer);
      observation.photoPath = filePath;
      await this.observations.save(observation);
      this.logger.debug(`Evidence photo saved: ${filePath}`);
    } catch (err) {
      this.logger.warn(`Failed to save evidence photo: ${String(err)}`);
    }
  }

  private async getSystemUserId(companyId: string): Promise<string> {
    const ds = this.observations.manager.connection;
    const result = await ds.query(
      `SELECT id FROM users WHERE "companyId" = $1 AND role = 'admin' ORDER BY "createdAt" ASC LIMIT 1`,
      [companyId],
    );
    if (result.length > 0) return result[0].id;
    const fallback = await ds.query(
      `SELECT id FROM users WHERE "companyId" IS NULL ORDER BY "createdAt" ASC LIMIT 1`,
    );
    return fallback.length > 0 ? fallback[0].id : '00000000-0000-0000-0000-000000000000';
  }
}
