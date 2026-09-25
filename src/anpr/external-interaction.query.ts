import type { SelectQueryBuilder } from 'typeorm';
import { ExternalInteraction } from './entities/external-interaction.entity.js';
import type { FindExternalInteractionsDtoType } from './dto/find-external-interactions.schema.js';
import type { CompanyScope } from '../auth/company-scope.js';
import type { ExternalInteractionSummary } from './external-interaction.types.js';

export const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Aplica os filtros de listagem (escopo + query string) a um QueryBuilder.
 */
export function applyFilters(
  query: SelectQueryBuilder<ExternalInteraction>,
  filters: FindExternalInteractionsDtoType,
  scope: CompanyScope,
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

/**
 * Agrega o resumo das interações filtradas (chamadas, sucesso/falhas, latência e custo).
 */
export async function summarize(
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
