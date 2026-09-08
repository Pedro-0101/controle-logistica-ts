import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { CompanyService } from './company.service.js';
import { Company } from './entities/company.entity.js';
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

describe('CompanyService', () => {
  let service: CompanyService;
  const repository = {
    create: vi.fn((data: Partial<Company>) => data),
    save: vi.fn((data: Partial<Company>) => data),
    find: vi.fn(),
    findOneBy: vi.fn(),
    remove: vi.fn((data: Partial<Company>) => data),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyService,
        {
          provide: getRepositoryToken(Company),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<CompanyService>(CompanyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('root deve listar todas as empresas', async () => {
      repository.find.mockResolvedValue([{ id: '1' }]);
      await service.findAll(rootActor);
      expect(repository.find).toHaveBeenCalledWith();
    });

    it('usuário comum deve ver apenas a própria empresa', async () => {
      repository.find.mockResolvedValue([{ id: 'company-1' }]);
      await service.findAll(companyActor);
      expect(repository.find).toHaveBeenCalledWith({
        where: { id: 'company-1' },
      });
    });
  });

  describe('create', () => {
    it('usuário comum não pode criar empresa', async () => {
      await expect(
        service.create(
          {
            name: 'X',
            companyName: 'X Ltda',
            cnpj: '12345678000199',
            stateRegistration: '123',
            address: 'Rua X',
            email: 'x@x.com',
          },
          companyActor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('root pode criar empresa com createdById', async () => {
      await service.create(
        {
          name: 'X',
          companyName: 'X Ltda',
          cnpj: '12345678000199',
          stateRegistration: '123',
          address: 'Rua X',
          email: 'x@x.com',
        },
        rootActor,
      );
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ createdById: 'root-id' }),
      );
    });
  });
});
