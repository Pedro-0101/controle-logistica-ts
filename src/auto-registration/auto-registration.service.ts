import { Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { StorageService } from '../storage/storage.service.js';
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
  anprExternalTrigger: string;
  anprTrustRegisteredVehicle: boolean;
  anprRegisterOnFirstRead: boolean;
  anprFirstReadMinConfidence: number;
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
    private readonly storage: StorageService,
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
    const active = await this.monitoring.getActiveObservations();
    if (active.length > 0) {
      this.logger.debug(`[auto-reg] ${active.length} observacao(oes) ativa(s) para processar`);
    }
    for (const { camera, observation } of active) {
      if (this.stopped) return;
      if (this.processed.has(observation.observationId!)) continue;
      try {
        // `false` = candidata aguardando confirmação; não marcar como processada
        // para poder registrar quando o Python confirmar as N leituras.
        const handled = await this.processObservation(camera, observation);
        if (handled) this.processed.add(observation.observationId!);
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

    const resolved = this.resolveAnprConfig(companyConfig, point);

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
      const decision = await this.evaluateExternal(camera, observation, state, resolved, false);
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

    const recognition = await this.resolveRecognition(camera, observation, state, resolved);

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
    if (resolved.anprRecognitionMode === 'local') {
      return this.localDecision(state, 'local');
    }

    const fallbackAllowed =
      resolved.anprRecognitionMode === 'verified' || resolved.anprExternalFallbackToLocal;
    return this.evaluateExternal(camera, observation, state, resolved, fallbackAllowed);
  }

  private localDecision(
    state: CurrentObservation,
    finalSource: FinalSource,
    image?: Buffer,
    interactionId?: string | null,
  ): RecognitionDecision {
    return {
      plate: state.placa!,
      provider: 'local',
      confidence: state.confianca ?? 0,
      finalSource,
      image,
      interactionId,
    };
  }

  /**
   * Consulta a API externa (uma vez por observação) e devolve a decisão final.
   * Quando `fallbackAllowed` é `false`, uma resposta não aceita retorna `null`
   * (nenhum movimento deve ser criado).
   */
  private async evaluateExternal(
    camera: Camera,
    observation: CameraObservation,
    state: CurrentObservation,
    resolved: ResolvedAnprConfig,
    fallbackAllowed: boolean,
  ): Promise<RecognitionDecision | null> {
    const localPlate = state.placa!;
    const providerName = resolved.anprExternalProvider;

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
      return fallbackAllowed ? this.localDecision(state, 'local_fallback') : null;
    }

    let image: Buffer | undefined;
    try {
      image = await this.anpr.observationImage(camera.id, observation.id);
    } catch (error) {
      this.logger.warn(`[auto-reg] Falha ao buscar imagem para API externa: ${String(error)}`);
      await this.markExternalChecked(observation, null, null, providerName);
      return fallbackAllowed ? this.localDecision(state, 'local_fallback') : null;
    }

    const provider = this.providers.get(providerName);
    if (!provider) {
      this.logger.warn(`[auto-reg] Provider externo desconhecido: ${providerName}`);
      await this.markExternalChecked(observation, null, null, providerName);
      return fallbackAllowed ? this.localDecision(state, 'local_fallback', image) : null;
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
      mode: resolved.anprExternalTrigger === 'after_single_read'
        ? `${resolved.anprRecognitionMode}:single_read`
        : resolved.anprRecognitionMode,
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
    return this.localDecision(state, 'local_fallback', image, interactionId);
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
      anprExternalTrigger: source('anprExternalTrigger') ?? 'after_confirmation',
      anprTrustRegisteredVehicle: source('anprTrustRegisteredVehicle') ?? false,
      anprRegisterOnFirstRead: source('anprRegisterOnFirstRead') ?? false,
      anprFirstReadMinConfidence: Number(source('anprFirstReadMinConfidence') ?? 0.85),
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
      const key = `evidence/${companyId}/${date}/${observation.id}.jpg`;
      await this.storage.putEvidence(key, buffer, 'image/jpeg');
      observation.photoPath = key;
      await this.observations.save(observation);
      this.logger.debug(`Evidence photo saved: ${key}`);
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
