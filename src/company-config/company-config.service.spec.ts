import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CompanyConfigService } from './company-config.service.js';
import { CompanyConfig } from './entities/company-config.entity.js';
import type { Actor } from '../auth/company-scope.js';

const rootActor: Actor = {
  userId: 'root-id',
  email: 'root@sistema.com',
  role: 'admin',
  companyId: null,
};

const companyActor: Actor = {
  userId: 'user-id',
  email: 'user@empresa.com',
  role: 'admin',
  companyId: 'company-1',
};

describe('CompanyConfigService', () => {
  let service: CompanyConfigService;
  const repository = {
    create: vi.fn((data: Partial<CompanyConfig>) => data),
    save: vi.fn(async (data: Partial<CompanyConfig>) => ({
      ...data,
      id: data.id ?? 'config-1',
    })),
    findOneBy: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyConfigService,
        {
          provide: getRepositoryToken(CompanyConfig),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<CompanyConfigService>(CompanyConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createWithDefaults', () => {
    it('deve criar configuração comCompanyId e createdById', async () => {
      const result = await service.createWithDefaults('company-1', 'root-id');

      expect(repository.create).toHaveBeenCalledWith({
        companyId: 'company-1',
        createdById: 'root-id',
      });
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        companyId: 'company-1',
        createdById: 'root-id',
      });
    });
  });

  describe('findOne', () => {
    it('root deve buscar config por companyId', async () => {
      repository.findOneBy.mockResolvedValue({ id: 'config-1', companyId: 'company-1' });
      const result = await service.findOne('company-1', rootActor);
      expect(repository.findOneBy).toHaveBeenCalledWith({ companyId: 'company-1' });
      expect(result).toMatchObject({ id: 'config-1', companyId: 'company-1' });
    });

    it('usuário da empresa deve ver apenas a própria config', async () => {
      repository.findOneBy.mockResolvedValue({ id: 'config-1', companyId: 'company-1' });
      const result = await service.findOne('company-1', companyActor);
      expect(repository.findOneBy).toHaveBeenCalledWith({ companyId: 'company-1' });
      expect(result).toMatchObject({ id: 'config-1', companyId: 'company-1' });
    });

    it('usuário não deve acessar config de outra empresa', async () => {
      await expect(service.findOne('company-2', companyActor)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.findOneBy).not.toHaveBeenCalled();
    });

    it('deve lançar 404 quando a config não existe', async () => {
      repository.findOneBy.mockResolvedValue(null);
      await expect(service.findOne('company-1', rootActor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('deve atualizar a config e registrar updatedById', async () => {
      repository.findOneBy.mockResolvedValue({
        id: 'config-1',
        companyId: 'company-1',
        timezone: 'America/Sao_Paulo',
      });

      const result = await service.update(
        'company-1',
        { timezone: 'America/New_York' } as never,
        companyActor,
      );

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'config-1',
          companyId: 'company-1',
          timezone: 'America/New_York',
          updatedById: 'user-id',
        }),
      );
      expect(result).toMatchObject({
        id: 'config-1',
        companyId: 'company-1',
        timezone: 'America/New_York',
        updatedById: 'user-id',
      });
    });

    it('deve lançar 404 ao tentar atualizar config inexistente', async () => {
      repository.findOneBy.mockResolvedValue(null);
      await expect(
        service.update('company-1', { timezone: 'America/New_York' } as never, companyActor),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
