import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnprService } from '../anpr/anpr.service.js';
import { ExternalInteractionService } from '../anpr/external-interaction.service.js';
import { PlateRecognitionProviderFactory } from '../anpr/providers/plate-recognition.factory.js';
import { ExternalProviderError } from '../anpr/providers/plate-recognition.types.js';
import type { ExternalOutcome, FinalSource } from '../anpr/entities/external-interaction.entity.js';
import { Camera } from '../camera/entities/camera.entity.js';
import { CameraObservation } from '../monitoring/observation.entity.js';
import type { CurrentObservation } from '../monitoring/observation.schema.js';
import type { ResolvedAnprConfig } from '../common/anpr-config.js';

export interface RecognitionDecision {
  plate: string;
  provider: string;
  confidence: number;
  finalSource: FinalSource;
  image?: Buffer;
  interactionId?: string | null;
}

/**
 * Resolve a placa final de uma observação, incluindo a consulta à API externa
 * de reconhecimento (quando habilitada) e o registro da interação/custo.
 */
@Injectable()
export class RecognitionResolverService {
  private readonly logger = new Logger(RecognitionResolverService.name);

  constructor(
    private readonly anpr: AnprService,
    private readonly providers: PlateRecognitionProviderFactory,
    private readonly interactions: ExternalInteractionService,
    @InjectRepository(CameraObservation) private readonly observations: Repository<CameraObservation>,
  ) {}

  /**
   * Resolve a placa final considerando o modo de reconhecimento.
   *
   * - `local`: usa apenas o OCR local (sem chamada externa).
   * - `verified`: chama a API externa; a placa externa vence quando aceita, senão usa a local.
   * - `external`: a API externa é autoritativa; sem placa válida, usa a local apenas se
   *   `anprExternalFallbackToLocal` estiver habilitado — caso contrário retorna `null`.
   */
  async resolveRecognition(
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

  /**
   * Consulta a API externa (uma vez por observação) e devolve a decisão final.
   * Quando `fallbackAllowed` é `false`, uma resposta não aceita retorna `null`
   * (nenhum movimento deve ser criado).
   */
  async evaluateExternal(
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
}
