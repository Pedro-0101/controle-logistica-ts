import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { ExternalInteractionService } from './external-interaction.service.js';
import { ExternalInteraction } from './entities/external-interaction.entity.js';
import type { Actor } from '../auth/company-scope.js';

const companyActor: Actor = {
  userId: 'user-id',
  email: 'user@empresa.com',
  role: 'admin',
  companyId: 'company-1',
};

const rootActor: Actor = {
  userId: 'root-id',
  email: 'root@sistema.com',
  role: 'admin',
  companyId: null,
};

type MockQueryBuilder = Record<string, ReturnType<typeof vi.fn>>;

const chainable = (result: {
  raw?: unknown;
  many?: unknown[];
  rawMany?: unknown[];
}): MockQueryBuilder => {
  const qb: MockQueryBuilder = {};
  for (const method of [
    'select',
    'addSelect',
    'andWhere',
    'where',
    'orderBy',
    'skip',
    'take',
    'leftJoin',
    'groupBy',
    'addGroupBy',
  ]) {
    qb[method] = vi.fn(() => qb);
  }
  qb.getRawOne = vi.fn(async () => result.raw);
  qb.getMany = vi.fn(async () => result.many ?? []);
  qb.getRawMany = vi.fn(async () => result.rawMany ?? []);
  return qb;
};

describe('ExternalInteractionService', () => {
  let service: ExternalInteractionService;
  const repository = {
    create: vi.fn((data: Partial<ExternalInteraction>) => data),
    save: vi.fn(async (data: Partial<ExternalInteraction>) => ({ ...data, id: 'interaction-1' })),
    update: vi.fn(async () => ({ affected: 1 })),
    createQueryBuilder: vi.fn(),
  };
  const configValues: Record<string, string | undefined> = {};
  const config = {
    get: vi.fn((key: string) => configValues[key]),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    for (const key of Object.keys(configValues)) delete configValues[key];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExternalInteractionService,
        { provide: getRepositoryToken(ExternalInteraction), useValue: repository },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<ExternalInteractionService>(ExternalInteractionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('record', () => {
    it('grava a interação com custo calculado', async () => {
      configValues.GOOGLE_VISION_PRICE_PER_1000 = '1.5';

      const id = await service.record({
        companyId: 'company-1',
        cameraId: 'camera-1',
        observationId: 'obs-1',
        provider: 'google_vision',
        mode: 'verified',
        outcome: 'success',
        externalPlate: 'ABC1D23',
        finalPlate: 'ABC1D23',
        finalSource: 'external',
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        finishedAt: new Date('2026-01-01T00:00:00.500Z'),
        latencyMs: 500,
        billableUnits: 1,
      });

      expect(id).toBe('interaction-1');
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          unitCost: 0.0015,
          costAmount: 0.0015,
          costCurrency: 'USD',
          billableUnits: 1,
          outcome: 'success',
        }),
      );
    });

    it('deixa custo nulo quando o preço não está configurado', async () => {
      await service.record({
        companyId: 'company-1',
        provider: 'google_vision',
        mode: 'verified',
        outcome: 'no_plate',
        billableUnits: 1,
        startedAt: new Date(),
      });

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ unitCost: null, costAmount: null }),
      );
    });

    it('não propaga falha ao gravar (best-effort)', async () => {
      repository.save.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.record({
          companyId: 'company-1',
          provider: 'google_vision',
          mode: 'verified',
          outcome: 'error',
          startedAt: new Date(),
        }),
      ).resolves.toBeNull();
    });
  });

  describe('attachMovement', () => {
    it('vincula o movimento à interação', async () => {
      await service.attachMovement('interaction-1', 'mov-1', 'ABC1D23', 'external');
      expect(repository.update).toHaveBeenCalledWith(
        { id: 'interaction-1' },
        { movementId: 'mov-1', finalPlate: 'ABC1D23', finalSource: 'external' },
      );
    });

    it('não propaga falha ao vincular', async () => {
      repository.update.mockRejectedValueOnce(new Error('db down'));
      await expect(
        service.attachMovement('interaction-1', 'mov-1', 'ABC1D23', 'external'),
      ).resolves.toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('aplica escopo da empresa e retorna resumo e paginação', async () => {
      const dataQb = chainable({ many: [{ id: 'interaction-1' }] });
      const summaryQb = chainable({
        raw: {
          calls: '3',
          success: '2',
          no_plate: '1',
          failures: '0',
          external_used: '2',
          avg_latency: '120.5',
          p95_latency: '200',
          total_cost: '0.0045',
        },
      });
      repository.createQueryBuilder
        .mockReturnValueOnce(dataQb)
        .mockReturnValueOnce(summaryQb);

      const result = await service.findAll(companyActor, { page: 1, limit: 20 } as never);

      expect(dataQb.andWhere).toHaveBeenCalledWith('i.companyId = :companyId', {
        companyId: 'company-1',
      });
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });
      expect(result.summary).toEqual({
        calls: 3,
        success: 2,
        noPlate: 1,
        failures: 0,
        externalUsed: 2,
        avgLatencyMs: 120.5,
        p95LatencyMs: 200,
        totalCost: 0.0045,
        costCurrency: 'USD',
      });
      expect(result.data).toEqual([{ id: 'interaction-1' }]);
    });

    it('não aplica escopo para usuário root e trata resumo vazio', async () => {
      const dataQb = chainable({ many: [] });
      const summaryQb = chainable({ raw: undefined });
      repository.createQueryBuilder
        .mockReturnValueOnce(dataQb)
        .mockReturnValueOnce(summaryQb);

      const result = await service.findAll(rootActor, { page: 2, limit: 10 } as never);

      expect(dataQb.andWhere).not.toHaveBeenCalled();
      expect(result.meta.total).toBe(0);
      expect(result.summary.calls).toBe(0);
      expect(result.summary.avgLatencyMs).toBeNull();
    });

    it('aplica todos os filtros opcionais', async () => {
      const dataQb = chainable({ many: [] });
      const summaryQb = chainable({ raw: { calls: '0' } });
      repository.createQueryBuilder
        .mockReturnValueOnce(dataQb)
        .mockReturnValueOnce(summaryQb);

      await service.findAll(companyActor, {
        page: 1,
        limit: 20,
        provider: 'google_vision',
        mode: 'external',
        outcome: 'timeout',
        finalSource: 'none',
        cameraId: 'camera-1',
        observationId: 'obs-1',
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-01-02T00:00:00.000Z',
      } as never);

      expect(dataQb.andWhere).toHaveBeenCalledWith('i.provider = :provider', {
        provider: 'google_vision',
      });
      expect(dataQb.andWhere).toHaveBeenCalledWith('i.mode = :mode', { mode: 'external' });
      expect(dataQb.andWhere).toHaveBeenCalledWith('i.outcome = :outcome', { outcome: 'timeout' });
      expect(dataQb.andWhere).toHaveBeenCalledWith('i.finalSource = :finalSource', {
        finalSource: 'none',
      });
      expect(dataQb.andWhere).toHaveBeenCalledWith('i.cameraId = :cameraId', {
        cameraId: 'camera-1',
      });
      expect(dataQb.andWhere).toHaveBeenCalledWith('i.observationId = :observationId', {
        observationId: 'obs-1',
      });
      expect(dataQb.andWhere).toHaveBeenCalledWith('i.createdAt >= :dateFrom', {
        dateFrom: '2026-01-01T00:00:00.000Z',
      });
      expect(dataQb.andWhere).toHaveBeenCalledWith('i.createdAt <= :dateTo', {
        dateTo: '2026-01-02T00:00:00.000Z',
      });
    });
  });

  describe('findUsage', () => {
    it('bloqueia usuário de empresa (somente admin raiz)', async () => {
      await expect(
        service.findUsage(companyActor, { page: 1, limit: 20 } as never),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('retorna uso global com breakdown por empresa para o root', async () => {
      const dataQb = chainable({ many: [{ id: 'interaction-1' }] });
      const summaryQb = chainable({ raw: { calls: '5', success: '4', failures: '1' } });
      const byCompanyQb = chainable({
        rawMany: [
          {
            company_id: 'company-1',
            company_name: 'Empresa 1',
            calls: '3',
            success: '3',
            no_plate: '0',
            failures: '0',
            avg_latency: '100',
            total_cost: '0.003',
          },
          {
            company_id: 'company-2',
            company_name: null,
            calls: '2',
            success: '1',
            no_plate: '0',
            failures: '1',
            avg_latency: '300',
            total_cost: null,
          },
        ],
      });
      repository.createQueryBuilder
        .mockReturnValueOnce(dataQb)
        .mockReturnValueOnce(summaryQb)
        .mockReturnValueOnce(byCompanyQb);

      const result = await service.findUsage(rootActor, { page: 1, limit: 20 } as never);

      expect(result.meta).toEqual({ page: 1, limit: 20, total: 5, totalPages: 1 });
      expect(result.byCompany).toEqual([
        {
          companyId: 'company-1',
          companyName: 'Empresa 1',
          calls: 3,
          success: 3,
          noPlate: 0,
          failures: 0,
          avgLatencyMs: 100,
          totalCost: 0.003,
        },
        {
          companyId: 'company-2',
          companyName: null,
          calls: 2,
          success: 1,
          noPlate: 0,
          failures: 1,
          avgLatencyMs: 300,
          totalCost: null,
        },
      ]);
      expect(byCompanyQb.leftJoin).toHaveBeenCalledWith('companies', 'c', 'c.id = i.companyId');
      expect(byCompanyQb.groupBy).toHaveBeenCalledWith('i.companyId');
    });

    it('aplica filtro de empresa informado pelo root', async () => {
      const dataQb = chainable({ many: [] });
      const summaryQb = chainable({ raw: { calls: '0' } });
      const byCompanyQb = chainable({ rawMany: [] });
      repository.createQueryBuilder
        .mockReturnValueOnce(dataQb)
        .mockReturnValueOnce(summaryQb)
        .mockReturnValueOnce(byCompanyQb);

      await service.findUsage(rootActor, {
        page: 1,
        limit: 20,
        companyId: 'company-9',
      } as never);

      expect(dataQb.andWhere).toHaveBeenCalledWith('i.companyId = :filterCompanyId', {
        filterCompanyId: 'company-9',
      });
    });
  });
});
