import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import {
  ExternalInteraction,
  type ExternalOutcome,
  type FinalSource,
} from './entities/external-interaction.entity.js';
import type { FindExternalInteractionsDtoType } from './dto/find-external-interactions.schema.js';
import { type Actor, resolveCompanyScope } from '../auth/company-scope.js';

export interface RecordExternalInteractionInput {
  companyId: string;
  cameraId?: string | null;
  pointId?: string | null;
  observationId?: string | null;
  movementId?: string | null;
  provider: string;
  mode: string;
  outcome: ExternalOutcome;
  localPlate?: string | null;
  externalPlate?: string | null;
  finalPlate?: string | null;
  finalSource?: FinalSource | null;
  httpStatus?: number | null;
  errorMessage?: string | null;
  startedAt: Date;
  finishedAt?: Date | null;
  latencyMs?: number | null;
  requestBytes?: number | null;
  responseBytes?: number | null;
  billableUnits?: number;
}

export interface ExternalInteractionSummary {
  calls: number;
  success: number;
  noPlate: number;
  failures: number;
  externalUsed: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  totalCost: number | null;
  costCurrency: string;
}

export interface CompanyUsage {
  companyId: string;
  companyName: string | null;
  calls: number;
  success: number;
  noPlate: number;
  failures: number;
  avgLatencyMs: number | null;
  totalCost: number | null;
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Registra e consulta as interações com APIs externas de reconhecimento.
 *
 * A gravação é best-effort: qualquer falha aqui é logada e ignorada, para
 * nunca impedir a criação do movimento.
 */
@Injectable()
export class ExternalInteractionService {
  private readonly logger = new Logger(ExternalInteractionService.name);

  constructor(
    @InjectRepository(ExternalInteraction)
    private readonly repository: Repository<ExternalInteraction>,
    private readonly config: ConfigService,
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
    finalSource: FinalSource,
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

    const dataQuery = this.applyFilters(
      this.repository.createQueryBuilder('i'),
      filters,
      scope,
    );
    const summaryQuery = this.applyFilters(
      this.repository.createQueryBuilder('i'),
      filters,
      scope,
    );

    const summary = await this.summarize(summaryQuery, currency);
    const total = summary.calls;

    const data = await dataQuery
      .orderBy('i.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary,
    };
  }

  /**
   * Visão global de uso da API externa — restrita ao admin raiz (`companyId = null`).
   *
   * Retorna as interações de todas as empresas, o resumo agregado e um breakdown
   * por empresa (chamadas, sucesso/falhas, latência média e custo).
   */
  async findUsage(actor: Actor, filters: FindExternalInteractionsDtoType) {
    if (actor.companyId) {
      throw new ForbiddenException(
        'Apenas o administrador global (company_id = null) pode acessar o uso da API externa',
      );
    }
    const scope = resolveCompanyScope(actor);
    const { page, limit } = filters;
    const currency = this.config.get<string>('ANPR_EXTERNAL_COST_CURRENCY') ?? 'USD';

    const dataQuery = this.applyFilters(
      this.repository.createQueryBuilder('i'),
      filters,
      scope,
    );
    const summaryQuery = this.applyFilters(
      this.repository.createQueryBuilder('i'),
      filters,
      scope,
    );

    const [summary, data, byCompany] = await Promise.all([
      this.summarize(summaryQuery, currency),
      dataQuery
        .orderBy('i.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getMany(),
      this.usageByCompany(filters, scope),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total: summary.calls,
        totalPages: Math.ceil(summary.calls / limit),
      },
      summary,
      byCompany,
    };
  }

  private async summarize(
    query: SelectQueryBuilder<ExternalInteraction>,
    currency: string,
  ): Promise<ExternalInteractionSummary> {
    const raw = await query
      .select('COUNT(*)', 'calls')
      .addSelect("COALESCE(SUM(CASE WHEN i.outcome = 'success' THEN 1 ELSE 0 END), 0)", 'success')
      .addSelect(
        "COALESCE(SUM(CASE WHEN i.outcome IN ('no_plate', 'low_confidence') THEN 1 ELSE 0 END), 0)",
        'no_plate',
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN i.outcome IN ('timeout', 'error', 'rate_limited') THEN 1 ELSE 0 END), 0)",
        'failures',
      )
      .addSelect("COALESCE(SUM(CASE WHEN i.finalSource = 'external' THEN 1 ELSE 0 END), 0)", 'external_used')
      .addSelect('AVG(i.latencyMs)', 'avg_latency')
      .addSelect('PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY i.latencyMs)', 'p95_latency')
      .addSelect('SUM(i.costAmount)', 'total_cost')
      .getRawOne<Record<string, unknown>>();

    return {
      calls: toNumber(raw?.calls) ?? 0,
      success: toNumber(raw?.success) ?? 0,
      noPlate: toNumber(raw?.no_plate) ?? 0,
      failures: toNumber(raw?.failures) ?? 0,
      externalUsed: toNumber(raw?.external_used) ?? 0,
      avgLatencyMs: toNumber(raw?.avg_latency),
      p95LatencyMs: toNumber(raw?.p95_latency),
      totalCost: toNumber(raw?.total_cost),
      costCurrency: currency,
    };
  }

  private async usageByCompany(
    filters: FindExternalInteractionsDtoType,
    scope: ReturnType<typeof resolveCompanyScope>,
  ): Promise<CompanyUsage[]> {
    const query = this.applyFilters(
      this.repository
        .createQueryBuilder('i')
        .leftJoin('companies', 'c', 'c.id = i.companyId'),
      filters,
      scope,
    );
    const rows = await query
      .select('i.companyId', 'company_id')
      .addSelect('c.name', 'company_name')
      .addSelect('COUNT(*)', 'calls')
      .addSelect("COALESCE(SUM(CASE WHEN i.outcome = 'success' THEN 1 ELSE 0 END), 0)", 'success')
      .addSelect(
        "COALESCE(SUM(CASE WHEN i.outcome IN ('no_plate', 'low_confidence') THEN 1 ELSE 0 END), 0)",
        'no_plate',
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN i.outcome IN ('timeout', 'error', 'rate_limited') THEN 1 ELSE 0 END), 0)",
        'failures',
      )
      .addSelect('AVG(i.latencyMs)', 'avg_latency')
      .addSelect('SUM(i.costAmount)', 'total_cost')
      .groupBy('i.companyId')
      .addGroupBy('c.name')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany<Record<string, unknown>>();

    return rows.map((row) => ({
      companyId: String(row.company_id),
      companyName: (row.company_name as string | null) ?? null,
      calls: toNumber(row.calls) ?? 0,
      success: toNumber(row.success) ?? 0,
      noPlate: toNumber(row.no_plate) ?? 0,
      failures: toNumber(row.failures) ?? 0,
      avgLatencyMs: toNumber(row.avg_latency),
      totalCost: toNumber(row.total_cost),
    }));
  }

  private applyFilters(
    query: SelectQueryBuilder<ExternalInteraction>,
    filters: FindExternalInteractionsDtoType,
    scope: ReturnType<typeof resolveCompanyScope>,
  ): SelectQueryBuilder<ExternalInteraction> {
    if (scope.mode === 'company') {
      query.andWhere('i.companyId = :companyId', { companyId: scope.companyId });
    }
    if (filters.companyId) {
      query.andWhere('i.companyId = :filterCompanyId', { filterCompanyId: filters.companyId });
    }
    if (filters.provider) {
      query.andWhere('i.provider = :provider', { provider: filters.provider });
    }
    if (filters.mode) {
      query.andWhere('i.mode = :mode', { mode: filters.mode });
    }
    if (filters.outcome) {
      query.andWhere('i.outcome = :outcome', { outcome: filters.outcome });
    }
    if (filters.finalSource) {
      query.andWhere('i.finalSource = :finalSource', { finalSource: filters.finalSource });
    }
    if (filters.cameraId) {
      query.andWhere('i.cameraId = :cameraId', { cameraId: filters.cameraId });
    }
    if (filters.observationId) {
      query.andWhere('i.observationId = :observationId', {
        observationId: filters.observationId,
      });
    }
    if (filters.dateFrom) {
      query.andWhere('i.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      query.andWhere('i.createdAt <= :dateTo', { dateTo: filters.dateTo });
    }
    return query;
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
