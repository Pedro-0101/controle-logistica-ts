import { Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MonitoringService } from '../monitoring/monitoring.service.js';
import { AnprService } from '../anpr/anpr.service.js';
import { ExternalInteractionService } from '../anpr/external-interaction.service.js';
import { PlateRecognitionProviderFactory } from '../anpr/providers/plate-recognition.factory.js';
import { ExternalProviderError } from '../anpr/providers/plate-recognition.types.js';
import type {
  ExternalOutcome,
  FinalSource,
} from '../anpr/entities/external-interaction.entity.js';
import { VehicleService } from '../vehicle/vehicle.service.js';
import { MovementService } from '../movement/movement.service.js';
import { CompanyConfigService } from '../company-config/company-config.service.js';
import { PointService } from '../point/point.service.js';
import { Camera } from '../camera/entities/camera.entity.js';
import { CameraObservation } from '../monitoring/observation.entity.js';
import type { CurrentObservation } from '../monitoring/observation.schema.js';

interface ResolvedAnprConfig {
  anprAutoRegister: boolean;
  anprSaveUnrecognizedPhotos: boolean;
  anprAutoRegisterCooldownSeconds: number;
  anprConfidenceThreshold: number;
  anprMatchTimeoutSeconds: number;
  anprConfirmationReads: number;
  anprStaleAfterSeconds: number;
  anprRecognitionMode: string;
  anprExternalProvider: string;
  anprExternalMinConfidence: number;
  anprExternalTimeoutMs: number;
  anprExternalFallbackToLocal: boolean;
}

interface RecognitionDecision {
  plate: string;
  provider: string;
  confidence: number;
  finalSource: FinalSource;
  image?: Buffer;
  interactionId?: string | null;
}

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
    private readonly providers: PlateRecognitionProviderFactory,
    private readonly interactions: ExternalInteractionService,
    private readonly vehicleService: VehicleService,
    private readonly movementService: MovementService,
    private readonly companyConfigService: CompanyConfigService,
    private readonly pointService: PointService,
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
    if (confirmed.length > 0) {
      this.logger.debug(`[auto-reg] ${confirmed.length} observacao(oes) confirmada(s) para processar`);
    }
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
    this.logger.log(
      `[auto-reg] Processando observacao: placa=${state.placa} camera=${camera.id} ` +
      `observationId=${state.observationId} confianca=${state.confianca}`,
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

    const resolved = this.resolveAnprConfig(companyConfig, point);

    this.logger.debug(
      `[auto-reg] Config resolved para camera ${camera.id}: ` +
      `autoRegister=${resolved.anprAutoRegister} ` +
      `confidenceThreshold=${resolved.anprConfidenceThreshold} ` +
      `cooldown=${resolved.anprAutoRegisterCooldownSeconds}s ` +
      `confirmationReads=${resolved.anprConfirmationReads} ` +
      `recognitionMode=${resolved.anprRecognitionMode} ` +
      `externalProvider=${resolved.anprExternalProvider} ` +
      `inheritCompanyConfig=${point.inheritCompanyConfig}`,
    );

    if (!resolved.anprAutoRegister) {
      this.logger.debug(`[auto-reg] Auto-registro desabilitado para camera ${camera.id}`);
      return;
    }

    const observation = await this.monitoring.ensureObservationPersisted(camera, state);

    const existingMovement = await this.movementService.findExistingByObservation(observation.id, companyId);
    if (existingMovement) {
      this.logger.debug(`[auto-reg] Movimento ja existe para observacao ${observation.id}`);
      return;
    }

    if (resolved.anprAutoRegisterCooldownSeconds > 0) {
      const vehicle = await this.vehicleService.findByPlate(state.placa!, companyId);
      if (vehicle) {
        const hasRecent = await this.movementService.hasRecentMovement(
          vehicle.id, camera.pointId, resolved.anprAutoRegisterCooldownSeconds, companyId,
        );
        if (hasRecent) {
          this.logger.debug(`[auto-reg] Cooldown ativo para veiculo ${vehicle.id} placa=${state.placa} no ponto ${camera.pointId}`);
          return;
        }
      }
    }

    const recognition = await this.resolveRecognition(camera, observation, state, resolved);

    if (!recognition) {
      this.logger.warn(
        `[auto-reg] API externa não retornou placa válida e fallback local desabilitado; ` +
        `movimento não criado (camera=${camera.id} observation=${observation.id})`,
      );
      return;
    }

    const finalPlate = recognition.plate;
    const vehicle = await this.vehicleService.findByPlate(finalPlate, companyId);

    // A API externa pode corrigir a placa local; refaz o cooldown com a placa final
    // para não duplicar movimento de um veículo que já passou pelo ponto.
    if (
      finalPlate !== state.placa &&
      vehicle &&
      resolved.anprAutoRegisterCooldownSeconds > 0 &&
      await this.movementService.hasRecentMovement(
        vehicle.id, camera.pointId, resolved.anprAutoRegisterCooldownSeconds, companyId,
      )
    ) {
      this.logger.debug(
        `[auto-reg] Cooldown ativo (placa final=${finalPlate}) para veiculo ${vehicle.id} no ponto ${camera.pointId}`,
      );
      return;
    }

    if (!vehicle && resolved.anprSaveUnrecognizedPhotos) {
      await this.saveEvidencePhoto(camera, observation, companyId, recognition.image);
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

  /**
   * Resolve a placa final considerando o modo de reconhecimento.
   *
   * - `local`: usa apenas o OCR local (sem chamada externa).
   * - `verified`: chama a API externa; a placa externa vence quando aceita, senão usa a local.
   * - `external`: a API externa é autoritativa; sem placa válida, usa a local apenas se
   *   `anprExternalFallbackToLocal` estiver habilitado — caso contrário retorna `null`.
   */
  private async resolveRecognition(
    camera: Camera,
    observation: CameraObservation,
    state: CurrentObservation,
    resolved: ResolvedAnprConfig,
  ): Promise<RecognitionDecision | null> {
    const localPlate = state.placa!;
    const localConfidence = state.confianca ?? 0;
    const localDecision = (
      finalSource: FinalSource,
      image?: Buffer,
      interactionId?: string | null,
    ): RecognitionDecision => ({
      plate: localPlate,
      provider: 'local',
      confidence: localConfidence,
      finalSource,
      image,
      interactionId,
    });

    if (resolved.anprRecognitionMode === 'local') {
      return localDecision('local');
    }

    const providerName = resolved.anprExternalProvider;
    const fallbackAllowed =
      resolved.anprRecognitionMode === 'verified' || resolved.anprExternalFallbackToLocal;

    // Evita rechamar (e rebilhar) a API externa após retry/restart.
    if (observation.externalCheckedAt) {
      if (observation.externalPlate) {
        return {
          plate: observation.externalPlate,
          provider: observation.externalProvider ?? providerName,
          confidence: observation.externalConfidence ?? 0,
          finalSource: 'external',
        };
      }
      return fallbackAllowed ? localDecision('local_fallback') : null;
    }

    let image: Buffer | undefined;
    try {
      image = await this.anpr.observationImage(camera.id, observation.id);
    } catch (error) {
      this.logger.warn(`[auto-reg] Falha ao buscar imagem para API externa: ${String(error)}`);
      await this.markExternalChecked(observation, null, null, providerName);
      return fallbackAllowed ? localDecision('local_fallback') : null;
    }

    const provider = this.providers.get(providerName);
    if (!provider) {
      this.logger.warn(`[auto-reg] Provider externo desconhecido: ${providerName}`);
      await this.markExternalChecked(observation, null, null, providerName);
      return fallbackAllowed ? localDecision('local_fallback', image) : null;
    }

    const startedAt = new Date();
    let result = null;
    let outcome: ExternalOutcome = 'error';
    let errorMessage: string | null = null;
    let httpStatus: number | null = null;
    let requestBytes: number | null = null;
    let responseBytes: number | null = null;
    let billableUnits = 0;

    try {
      result = await provider.recognize(image, { timeoutMs: resolved.anprExternalTimeoutMs });
      httpStatus = result?.httpStatus ?? null;
      requestBytes = result?.requestBytes ?? null;
      responseBytes = result?.responseBytes ?? null;
      billableUnits = result?.billableUnits ?? 0;
      if (!result) {
        outcome = 'no_plate';
      } else if (result.confidence < resolved.anprExternalMinConfidence) {
        outcome = 'low_confidence';
      } else {
        outcome = 'success';
      }
    } catch (error) {
      const providerError = error instanceof ExternalProviderError ? error : null;
      outcome =
        providerError?.kind === 'timeout'
          ? 'timeout'
          : providerError?.kind === 'rate_limited'
            ? 'rate_limited'
            : 'error';
      errorMessage = error instanceof Error ? error.message : String(error);
      httpStatus = providerError?.httpStatus ?? null;
      requestBytes = providerError?.requestBytes ?? null;
      responseBytes = providerError?.responseBytes ?? null;
      this.logger.warn(`[auto-reg] API externa falhou (${providerName}): ${errorMessage}`);
    }

    const finishedAt = new Date();
    const accepted = outcome === 'success' && result !== null;
    const finalSource: FinalSource = accepted
      ? 'external'
      : fallbackAllowed
        ? 'local_fallback'
        : 'none';
    const finalPlate = accepted ? result!.plate : finalSource === 'local_fallback' ? localPlate : null;

    const interactionId = await this.interactions.record({
      companyId: camera.companyId,
      cameraId: camera.id,
      pointId: camera.pointId,
      observationId: observation.id,
      provider: providerName,
      mode: resolved.anprRecognitionMode,
      outcome,
      localPlate,
      externalPlate: result?.plate ?? null,
      finalPlate,
      finalSource,
      httpStatus,
      errorMessage,
      startedAt,
      finishedAt,
      latencyMs: finishedAt.getTime() - startedAt.getTime(),
      requestBytes,
      responseBytes,
      billableUnits,
    });

    await this.markExternalChecked(
      observation,
      accepted ? result!.plate : null,
      accepted ? result!.confidence : null,
      providerName,
    );

    if (accepted) {
      return {
        plate: result!.plate,
        provider: providerName,
        confidence: result!.confidence,
        finalSource: 'external',
        image,
        interactionId,
      };
    }

    if (!fallbackAllowed) return null;
    return localDecision('local_fallback', image, interactionId);
  }

  private async markExternalChecked(
    observation: CameraObservation,
    externalPlate: string | null,
    externalConfidence: number | null,
    provider: string,
  ): Promise<void> {
    try {
      observation.externalPlate = externalPlate;
      observation.externalConfidence = externalConfidence;
      observation.externalProvider = provider;
      observation.externalCheckedAt = new Date();
      await this.observations.save(observation);
    } catch (error) {
      this.logger.warn(`[auto-reg] Falha ao persistir resultado externo: ${String(error)}`);
    }
  }

  private resolveAnprConfig(companyConfig: any, point: any): ResolvedAnprConfig {
    const resolve = (field: string) =>
      point[field] ?? companyConfig[field];
    const company = (field: string) => companyConfig[field];
    const source = point.inheritCompanyConfig ? company : resolve;
    return {
      anprAutoRegister: source('anprAutoRegister'),
      anprSaveUnrecognizedPhotos: source('anprSaveUnrecognizedPhotos'),
      anprAutoRegisterCooldownSeconds: source('anprAutoRegisterCooldownSeconds'),
      anprConfidenceThreshold: source('anprConfidenceThreshold'),
      anprMatchTimeoutSeconds: source('anprMatchTimeoutSeconds'),
      anprConfirmationReads: source('anprConfirmationReads'),
      anprStaleAfterSeconds: source('anprStaleAfterSeconds'),
      anprRecognitionMode: source('anprRecognitionMode') ?? 'local',
      anprExternalProvider: source('anprExternalProvider') ?? 'google_vision',
      anprExternalMinConfidence: Number(source('anprExternalMinConfidence') ?? 0.7),
      anprExternalTimeoutMs: Number(source('anprExternalTimeoutMs') ?? 8000),
      anprExternalFallbackToLocal: source('anprExternalFallbackToLocal') ?? true,
    };
  }

  private async saveEvidencePhoto(
    camera: Camera,
    observation: CameraObservation,
    companyId: string,
    imageBuffer?: Buffer,
  ) {
    try {
      const buffer = imageBuffer ?? await this.anpr.observationImage(camera.id, observation.id);
      const date = new Date().toISOString().slice(0, 10);
      const dir = path.join('storage', 'evidence', companyId, date);
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, `${observation.id}.jpg`);
      fs.writeFileSync(filePath, buffer);
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
