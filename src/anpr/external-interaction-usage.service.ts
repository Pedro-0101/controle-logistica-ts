import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalInteraction } from './entities/external-interaction.entity.js';
import type { FindExternalInteractionsDtoType } from './dto/find-external-interactions.schema.js';
import { type Actor, resolveCompanyScope } from '../auth/company-scope.js';
import { paginationMeta, paginationSkip } from '../common/pagination.js';
import { applyFilters, summarize, toNumber } from './external-interaction.query.js';
import type { CompanyUsage } from './external-interaction.types.js';

/**
 * Visão global de uso da API externa, restrita ao admin raiz e com breakdown
 * agregado por empresa.
 */
@Injectable()
export class ExternalInteractionUsageService {
  constructor(
    @InjectRepository(ExternalInteraction)
    private readonly repository: Repository<ExternalInteraction>,
    private readonly config: ConfigService,
  ) {}

  async findUsage(actor: Actor, filters: FindExternalInteractionsDtoType) {
    if (actor.companyId) {
      throw new ForbiddenException(
        'Apenas o administrador global (company_id = null) pode acessar o uso da API externa',
      );
    }
    const scope = resolveCompanyScope(actor);
    const { page, limit } = filters;
    const currency = this.config.get<string>('ANPR_EXTERNAL_COST_CURRENCY') ?? 'USD';

    const dataQuery = applyFilters(this.repository.createQueryBuilder('i'), filters, scope);
    const summaryQuery = applyFilters(this.repository.createQueryBuilder('i'), filters, scope);

    const [summary, data, byCompany] = await Promise.all([
      summarize(summaryQuery, currency),
      dataQuery
        .orderBy('i.createdAt', 'DESC')
        .skip(paginationSkip(page, limit))
        .take(limit)
        .getMany(),
      this.usageByCompany(filters, scope),
    ]);

    return {
      data,
      meta: paginationMeta(page, limit, summary.calls),
      summary,
      byCompany,
    };
  }

  private async usageByCompany(
    filters: FindExternalInteractionsDtoType,
    scope: ReturnType<typeof resolveCompanyScope>,
  ): Promise<CompanyUsage[]> {
    const query = applyFilters(
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
}
