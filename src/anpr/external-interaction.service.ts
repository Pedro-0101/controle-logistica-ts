import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalInteraction } from './entities/external-interaction.entity.js';
import type { FindExternalInteractionsDtoType } from './dto/find-external-interactions.schema.js';
import { type Actor, resolveCompanyScope } from '../auth/company-scope.js';
import { paginationMeta, paginationSkip } from '../common/pagination.js';
import { applyFilters, summarize } from './external-interaction.query.js';
import { ExternalInteractionUsageService } from './external-interaction-usage.service.js';
import type { RecordExternalInteractionInput } from './external-interaction.types.js';

/**
 * Registra e lista as interações com APIs externas de reconhecimento.
 *
 * A gravação é best-effort: qualquer falha aqui é logada e ignorada, para
 * nunca impedir a criação do movimento. A visão de uso agregado fica no
 * `ExternalInteractionUsageService`.
 */
@Injectable()
export class ExternalInteractionService {
  private readonly logger = new Logger(ExternalInteractionService.name);

  constructor(
    @InjectRepository(ExternalInteraction)
    private readonly repository: Repository<ExternalInteraction>,
    private readonly config: ConfigService,
    private readonly usageService: ExternalInteractionUsageService,
  ) {}

  async record(input: RecordExternalInteractionInput): Promise<string | null> {
    try {
      const billableUnits = input.billableUnits ?? 0;
      const { unitCost, costAmount, costCurrency } = this.costFor(input.provider, billableUnits);
      const entity = this.repository.create({
        companyId: input.companyId,
        cameraId: input.cameraId ?? null,
        pointId: input.pointId ?? null,
        observationId: input.observationId ?? null,
        movementId: input.movementId ?? null,
        provider: input.provider,
        mode: input.mode,
        localPlate: input.localPlate ?? null,
        externalPlate: input.externalPlate ?? null,
        finalPlate: input.finalPlate ?? null,
        finalSource: input.finalSource ?? null,
        outcome: input.outcome,
        httpStatus: input.httpStatus ?? null,
        errorMessage: input.errorMessage ?? null,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt ?? null,
        latencyMs: input.latencyMs ?? null,
        billableUnits,
        unitCost,
        costAmount,
        costCurrency,
        requestBytes: input.requestBytes ?? null,
        responseBytes: input.responseBytes ?? null,
      });
      const saved = await this.repository.save(entity);
      return saved.id;
    } catch (error) {
      this.logger.warn(`Falha ao registrar interação externa: ${String(error)}`);
      return null;
    }
  }

  async attachMovement(
    interactionId: string,
    movementId: string,
    finalPlate: string,
    finalSource: RecordExternalInteractionInput['finalSource'],
  ): Promise<void> {
    try {
      await this.repository.update({ id: interactionId }, { movementId, finalPlate, finalSource });
    } catch (error) {
      this.logger.warn(`Falha ao vincular movimento à interação externa: ${String(error)}`);
    }
  }

  async findAll(actor: Actor, filters: FindExternalInteractionsDtoType) {
    const scope = resolveCompanyScope(actor);
    const { page, limit } = filters;
    const currency = this.config.get<string>('ANPR_EXTERNAL_COST_CURRENCY') ?? 'USD';

    const dataQuery = applyFilters(
      this.repository.createQueryBuilder('i'),
      filters,
      scope,
    );
    const summaryQuery = applyFilters(
      this.repository.createQueryBuilder('i'),
      filters,
      scope,
    );

    const summary = await summarize(summaryQuery, currency);
    const total = summary.calls;

    const data = await dataQuery
      .orderBy('i.createdAt', 'DESC')
      .skip(paginationSkip(page, limit))
      .take(limit)
      .getMany();

    return {
      data,
      meta: paginationMeta(page, limit, total),
      summary,
    };
  }

  /**
   * Visão global de uso da API externa — restrita ao admin raiz (`companyId = null`).
   */
  findUsage(actor: Actor, filters: FindExternalInteractionsDtoType) {
    return this.usageService.findUsage(actor, filters);
  }

  private costFor(
    provider: string,
    billableUnits: number,
  ): { unitCost: number | null; costAmount: number | null; costCurrency: string } {
    const currency = this.config.get<string>('ANPR_EXTERNAL_COST_CURRENCY') ?? 'USD';
    const providerKey = `${provider.toUpperCase()}_PRICE_PER_1000`;
    const raw =
      this.config.get<string>(providerKey) ??
      this.config.get<string>('ANPR_EXTERNAL_PRICE_PER_1000');
    const pricePerThousand = raw === undefined ? NaN : Number(raw);
    if (!Number.isFinite(pricePerThousand) || pricePerThousand <= 0) {
      return { unitCost: null, costAmount: null, costCurrency: currency };
    }
    const unitCost = pricePerThousand / 1000;
    return {
      unitCost,
      costAmount: Number((unitCost * billableUnits).toFixed(6)),
      costCurrency: currency,
    };
  }
}
