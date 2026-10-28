import { Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { setTimeout as delay } from 'node:timers/promises';
import { AnprService } from '../anpr/anpr.service.js';
import { MonitoringService } from '../monitoring/monitoring.service.js';
import { ExternalInteractionService } from '../anpr/external-interaction.service.js';
import { VehicleService } from '../vehicle/vehicle.service.js';
import { MovementService } from '../movement/movement.service.js';
import { CompanyConfigService } from '../company-config/company-config.service.js';
import { PointService } from '../point/point.service.js';
import { Camera } from '../camera/entities/camera.entity.js';
import { CameraObservation } from '../monitoring/observation.entity.js';
import type { CurrentObservation } from '../monitoring/observation.schema.js';
import { type ResolvedAnprConfig, resolveAnprConfig } from '../common/anpr-config.js';
import { RecognitionResolverService, type RecognitionDecision } from './recognition-resolver.service.js';
import { AutoRegistrationEvidenceService } from './auto-registration-evidence.service.js';

@Injectable()
export class AutoRegistrationService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AutoRegistrationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopped = false;
  private readonly processed = new Set<string>();
  private readonly stop = new AbortController();
  private eventLoop?: Promise<void>;
  private cursor?: string;
  private readonly pending = new Map<string, number>();
  private readonly jobs = new Map<string, Promise<void>>();
  private readonly cameraPoints = new Map<string, string>();
  private readonly busyPoints = new Set<string>();
  private readonly concurrency = 4;
  private readonly maxPending = 128;
  private readonly startedAt = new Date().toISOString();
  private readonly counts = { events: 0, reconnects: 0, resets: 0, overflow: 0, processed: 0, waitingConfirmation: 0, ignored: 0, errors: 0, registered: 0 };
  private readonly timings = { queueWaitMs: [] as number[], processingMs: [] as number[], captureToRegistrationMs: [] as number[] };

  constructor(
    private readonly monitoring: MonitoringService,
    private readonly interactions: ExternalInteractionService,
    private readonly vehicleService: VehicleService,
    private readonly movementService: MovementService,
    private readonly companyConfigService: CompanyConfigService,
    private readonly pointService: PointService,
    private readonly recognitionResolver: RecognitionResolverService,
    private readonly evidenceService: AutoRegistrationEvidenceService,
    @InjectRepository(CameraObservation) private readonly observations: Repository<CameraObservation>,
    private readonly config: ConfigService,
    private readonly anpr: AnprService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get<string>('MONITORING_ENABLED') === 'false') return;
    if (this.eventLoop || this.stopped) return;
    this.eventLoop = this.consumeEvents();
    // Repair only: normal registration is triggered immediately by Python events.
    this.timer = setInterval(() => { void this.reconcile(); }, 30_000);
    this.timer.unref();
  }

  reconcile(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.repair().catch((err) => {
      this.logger.warn(`Auto-registration error: ${err?.message ?? err}`);
    }).finally(() => { this.running = undefined; });
    return this.running;
  }

  async onModuleDestroy() {
    this.stopped = true;
    this.stop.abort();
    this.pending.clear();
    if (this.timer) clearInterval(this.timer);
    await this.eventLoop;
    await this.running;
    await Promise.all(this.jobs.values());
  }

  private async consumeEvents() {
    let failures = 0;
    while (!this.stopped) {
      try {
        const batch = await this.anpr.monitorEvents(this.cursor, this.stop.signal);
        if (this.stopped) break;
        this.cursor = batch.cursor;
        if (batch.reset) {
          this.counts.resets++;
          // Independent of slow registration/provider calls; replay remains live.
          void this.reconcile();
        }
        failures = 0;
        for (const event of batch.events) {
          this.counts.events++;
          this.enqueue(event.cameraId);
        }
      } catch {
        if (this.stopped) break;
        this.counts.reconnects++;
        failures++;
        this.logger.warn('Fluxo de eventos ANPR indisponível; reconectando com o último cursor');
        try { await delay(Math.min(30_000, 1000 * 2 ** Math.min(failures - 1, 5)), undefined, { signal: this.stop.signal }); }
        catch { break; }
      }
    }
  }

  private enqueue(cameraId: string) {
    if (this.stopped) return;
    if (!this.pending.has(cameraId)) {
      if (this.pending.size >= this.maxPending) {
        this.counts.overflow++;
        this.cursor = undefined; // The next poll requests a full resync.
        return;
      }
      this.pending.set(cameraId, performance.now());
    }
    this.pump();
  }

  private pump() {
    if (this.stopped) return;
    for (const [cameraId, queuedAt] of this.pending) {
      if (this.jobs.size >= this.concurrency) break;
      if (this.jobs.has(cameraId)) continue;
      const point = this.cameraPoints.get(cameraId);
      if (point && this.busyPoints.has(point)) continue;
      this.pending.delete(cameraId);
      const job = this.processCamera(cameraId, queuedAt).catch((error) => {
        this.counts.errors++;
        this.logger.warn(`Failed to auto-register for camera ${cameraId}: ${String(error)}`);
      }).finally(() => {
        this.jobs.delete(cameraId);
        if (!this.pending.has(cameraId)) this.cameraPoints.delete(cameraId);
        this.pump();
      });
      this.jobs.set(cameraId, job);
    }
  }

  private async processCamera(cameraId: string, queuedAt: number) {
    const active = await this.monitoring.getActiveObservation(cameraId);
    if (this.stopped || !active) { this.counts.ignored++; return; }
    const { camera, observation } = active;
    const pointKey = `${camera.companyId}:${camera.pointId}`;
    this.cameraPoints.set(cameraId, pointKey);
    if (this.busyPoints.has(pointKey)) {
      // Preserve cooldown ordering between two cameras at the same point, without
      // occupying a worker while another camera awaits its external provider.
      this.pending.set(cameraId, queuedAt);
      return;
    }
    if (this.processed.has(observation.observationId!)) { this.counts.ignored++; return; }
    this.busyPoints.add(pointKey);
    const started = performance.now();
    this.sample('queueWaitMs', started - queuedAt);
    try {
      // State was refreshed after queueing. An accepted observation remains valid
      // for an in-flight external check, even if its live image later expires.
      const handled = await this.processObservation(camera, observation);
      if (handled) {
        this.processed.add(observation.observationId!);
        this.counts.processed++;
      } else this.counts.waitingConfirmation++;
    } finally {
      this.sample('processingMs', performance.now() - started);
      this.busyPoints.delete(pointKey);
    }
    if (this.processed.size > 1000) {
      const arr = [...this.processed];
      this.processed.clear();
      for (const id of arr.slice(-500)) this.processed.add(id);
    }
  }

  private async repair() {
    const active = await this.monitoring.getActiveObservations();
    for (const { camera } of active) this.enqueue(camera.id);
    while (!this.stopped && this.jobs.size) await Promise.all(this.jobs.values());
  }

  private sample(metric: keyof typeof this.timings, value: number) {
    if (!Number.isFinite(value) || value < 0) return;
    const samples = this.timings[metric];
    samples.push(value);
    if (samples.length > 1000) samples.shift();
  }

  getStats() {
    const summarize = (samples: number[]) => {
      const sorted = [...samples].sort((a, b) => a - b);
      const count = sorted.length;
      return { count, avg: count ? samples.reduce((sum, n) => sum + n, 0) / count : null,
        p50: count ? sorted[Math.floor((count - 1) * 0.5)] : null,
        p95: count ? sorted[Math.ceil(count * 0.95) - 1] : null,
        max: count ? sorted[count - 1] : null };
    };
    return {
      source: 'nest_auto_registration', startedAt: this.startedAt, durationUnit: 'ms',
      sampleWindow: 'last_1000_per_metric', countersScope: 'since_process_start',
      registeredMeaning: 'successful_registration_completions_including_idempotent_returns',
      captureToRegistrationClock: 'wall_clock_across_services_requires_synchronized_clocks',
      counts: { ...this.counts }, queue: { pending: this.pending.size, active: this.jobs.size, concurrency: this.concurrency, maxPending: this.maxPending },
      durations: { queueWait: summarize(this.timings.queueWaitMs), processing: summarize(this.timings.processingMs), captureToRegistration: summarize(this.timings.captureToRegistrationMs) },
    };
  }

  /**
   * Processa uma observação. Retorna `true` quando ela não deve ser revisitada
   * (movimento criado, descarte deliberado ou já tratada) e `false` quando é uma
   * candidata aguardando confirmação — nesse caso o `processed` não é marcado.
   */
  private async processObservation(camera: Camera, state: CurrentObservation): Promise<boolean> {
    const companyId = camera.companyId;
    this.logger.log(
      `[auto-reg] Processando observacao: placa=${state.placa} camera=${camera.id} ` +
      `observationId=${state.observationId} status=${state.status} confianca=${state.confianca}`,
    );

    let companyConfig;
    try {
      companyConfig = await this.companyConfigService.findOne(companyId, {
        userId: '', companyId, role: 'admin',
      } as any);
    } catch (err) {
      if (err instanceof NotFoundException) {
        this.logger.log(`Config not found for company ${companyId}, creating with defaults`);
        const systemUserId = await this.getSystemUserId(companyId);
        companyConfig = await this.companyConfigService.createWithDefaults(companyId, systemUserId);
      } else {
        throw err;
      }
    }

    const point = await this.pointService.findOne(camera.pointId, {
      userId: '', companyId, role: 'admin',
    } as any);

    const resolved = resolveAnprConfig(companyConfig, point);

    this.logger.debug(
      `[auto-reg] Config resolved para camera ${camera.id}: ` +
      `autoRegister=${resolved.anprAutoRegister} ` +
      `confidenceThreshold=${resolved.anprConfidenceThreshold} ` +
      `cooldown=${resolved.anprAutoRegisterCooldownSeconds}s ` +
      `confirmationReads=${resolved.anprConfirmationReads} ` +
      `recognitionMode=${resolved.anprRecognitionMode} ` +
      `externalTrigger=${resolved.anprExternalTrigger} ` +
      `trustRegistered=${resolved.anprTrustRegisteredVehicle} ` +
      `registerOnFirstRead=${resolved.anprRegisterOnFirstRead} ` +
      `externalProvider=${resolved.anprExternalProvider} ` +
      `inheritCompanyConfig=${point.inheritCompanyConfig}`,
    );

    if (!resolved.anprAutoRegister) {
      this.logger.debug(`[auto-reg] Auto-registro desabilitado para camera ${camera.id}`);
      return true;
    }

    const observation = await this.monitoring.ensureObservationPersisted(camera, state);

    const existingMovement = await this.movementService.findExistingByObservation(observation.id, companyId);
    if (existingMovement) {
      this.logger.debug(`[auto-reg] Movimento ja existe para observacao ${observation.id}`);
      return true;
    }

    const registeredVehicle = await this.vehicleService.findByPlate(state.placa!, companyId);

    if (resolved.anprAutoRegisterCooldownSeconds > 0) {
      const hasRecent = registeredVehicle
        ? await this.movementService.hasRecentMovement(
            registeredVehicle.id, camera.pointId, resolved.anprAutoRegisterCooldownSeconds, companyId,
          )
        : await this.movementService.hasRecentMovementByPlate(
            state.placa!, camera.pointId, resolved.anprAutoRegisterCooldownSeconds, companyId,
          );
      if (hasRecent) {
        this.logger.debug(
          `[auto-reg] Cooldown ativo para placa=${state.placa} no ponto ${camera.pointId}`,
        );
        return true;
      }
    }

    const isConfirmed = state.status === 'confirmed';
    const registered = !!registeredVehicle?.active;
    const trustRegistered =
      resolved.anprTrustRegisteredVehicle || resolved.anprRegisterOnFirstRead;

    // Atalho #4: placa cadastrada + 1ª leitura confiável → registra sem N leituras
    // e sem API externa.
    if (
      resolved.anprRegisterOnFirstRead &&
      registered &&
      (state.confianca ?? 0) >= resolved.anprFirstReadMinConfidence
    ) {
      this.logger.log(
        `[auto-reg] Atalho placa cadastrada na primeira leitura: placa=${state.placa} ` +
        `confianca=${state.confianca} veiculo=${registeredVehicle!.id} camera=${camera.id}`,
      );
      await this.commitRecognition(camera, observation, state, companyId, resolved, {
        plate: state.placa!,
        provider: 'registered',
        confidence: state.confianca ?? 0,
        finalSource: 'local',
      });
      return true;
    }

    // Atalho #3: placa cadastrada confiável → ignora API externa (aguarda N leituras).
    if (trustRegistered && registered) {
      if (!isConfirmed) {
        this.logger.debug(
          `[auto-reg] Placa cadastrada ${state.placa}; aguardando confirmacao sem API externa ` +
          `(camera=${camera.id} observation=${observation.id})`,
        );
        return false;
      }
      this.logger.log(
        `[auto-reg] Placa cadastrada confirmada sem API externa: placa=${state.placa} ` +
        `veiculo=${registeredVehicle!.id} camera=${camera.id}`,
      );
      await this.commitRecognition(camera, observation, state, companyId, resolved, {
        plate: state.placa!,
        provider: 'registered',
        confidence: state.confianca ?? 0,
        finalSource: 'local',
      });
      return true;
    }

    // Atalho #1/#2: API externa já na primeira leitura. Sem placa externa
    // confiável, nenhum movimento é criado (sem fallback local).
    if (
      resolved.anprExternalTrigger === 'after_single_read' &&
      resolved.anprRecognitionMode !== 'local'
    ) {
      const decision = await this.recognitionResolver.evaluateExternal(camera, observation, state, resolved, false);
      if (!decision) {
        this.logger.warn(
          `[auto-reg] API externa sem placa valida na primeira leitura; movimento nao criado ` +
          `(camera=${camera.id} observation=${observation.id})`,
        );
        return true;
      }
      await this.commitRecognition(camera, observation, state, companyId, resolved, {
        ...decision,
        provider: 'external_fast',
      });
      return true;
    }

    // Candidata sem atalho aplicável: aguarda as N leituras para confirmar.
    if (!isConfirmed) {
      this.logger.debug(
        `[auto-reg] Observacao candidata ${observation.id} (placa=${state.placa}) aguardando confirmacao`,
      );
      return false;
    }

    const recognition = await this.recognitionResolver.resolveRecognition(camera, observation, state, resolved);

    if (!recognition) {
      this.logger.warn(
        `[auto-reg] API externa não retornou placa válida e fallback local desabilitado; ` +
        `movimento não criado (camera=${camera.id} observation=${observation.id})`,
      );
      return true;
    }

    await this.commitRecognition(camera, observation, state, companyId, resolved, recognition);
    return true;
  }

  /**
   * Persiste a placa final, aplica cooldown com a placa final, salva evidência
   * (quando aplicável) e cria o movimento. Compartilhado por todos os fluxos.
   */
  private async commitRecognition(
    camera: Camera,
    observation: CameraObservation,
    state: CurrentObservation,
    companyId: string,
    resolved: ResolvedAnprConfig,
    recognition: RecognitionDecision,
  ): Promise<void> {
    const finalPlate = recognition.plate;
    const vehicle = await this.vehicleService.findByPlate(finalPlate, companyId);

    // A API externa pode corrigir a placa local; refaz o cooldown com a placa
    // final para não duplicar movimento de um veículo que já passou pelo ponto.
    // Vale para veículos cadastrados (por id) e não cadastrados (por placa).
    if (resolved.anprAutoRegisterCooldownSeconds > 0) {
      const hasRecent = vehicle
        ? await this.movementService.hasRecentMovement(
            vehicle.id, camera.pointId, resolved.anprAutoRegisterCooldownSeconds, companyId,
          )
        : await this.movementService.hasRecentMovementByPlate(
            finalPlate, camera.pointId, resolved.anprAutoRegisterCooldownSeconds, companyId,
          );
      if (hasRecent) {
        this.logger.debug(
          `[auto-reg] Cooldown ativo (placa final=${finalPlate}) no ponto ${camera.pointId}`,
        );
        return;
      }
    }

    if (!vehicle && resolved.anprSaveUnrecognizedPhotos) {
      await this.evidenceService.saveEvidencePhoto(camera, observation, companyId, recognition.image);
    }

    const systemUserId = await this.getSystemUserId(companyId);

    const movement = await this.movementService.createAutoRegistered({
      observation,
      vehicle,
      recognizedPlate: finalPlate,
      companyId,
      systemUserId,
      recognitionProvider: recognition.provider,
      recognitionConfidence: recognition.confidence,
    });
    this.counts.registered++;
    this.sample('captureToRegistrationMs', Date.now() - Date.parse(state.capturedAt!));

    if (recognition.interactionId) {
      await this.interactions.attachMovement(
        recognition.interactionId, movement.id, finalPlate, recognition.finalSource,
      );
    }

    this.logger.log(
      `[auto-reg] *** REGISTRO AUTOMATICO: placa=${finalPlate} ` +
      `(local=${state.placa} provider=${recognition.provider} fonte=${recognition.finalSource}) ` +
      `camera=${camera.id} ponto=${camera.pointId} ` +
      `veiculo=${vehicle ? `encontrado (id=${vehicle.id})` : 'NAO ENCONTRADO'} ` +
      `→ status=${vehicle ? 'open' : 'pending_review'} ` +
      `confianca=${recognition.confidence} observationId=${state.observationId}`,
    );
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
