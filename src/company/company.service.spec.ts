import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CompanyService } from './company.service.js';
import { Company } from './entities/company.entity.js';
import { User } from '../user/entities/user.entity.js';
import { UserService } from '../user/user.service.js';
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

const createDto = {
  name: 'X',
  companyName: 'X Ltda',
  cnpj: '12345678000199',
  stateRegistration: '123',
  address: 'Rua X',
  email: 'x@x.com',
  admin: { name: 'João', email: 'joao@x.com', password: 'senha123' },
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
  const manager = {
    create: vi.fn((_entity: unknown, data: unknown) => data),
    save: vi.fn(async (data: { id?: string } & Record<string, unknown>) => ({
      ...data,
      id: data.id ?? 'new-id',
    })),
  };
  const dataSource = {
    transaction: vi.fn(
      async (callback: (tx: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };
  const userService = {
    hashPassword: vi.fn(async () => 'hashed-password'),
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
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: UserService,
          useValue: userService,
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
      await expect(service.create(createDto, companyActor)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('root cria empresa e admin na mesma transação', async () => {
      const result = await service.create(createDto, rootActor);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.create).toHaveBeenCalledWith(
        Company,
        expect.objectContaining({ name: 'X', createdById: 'root-id' }),
      );
      expect(manager.create).toHaveBeenCalledWith(
        User,
        expect.objectContaining({
          role: 'admin',
          companyId: 'new-id',
          email: 'joao@x.com',
        }),
      );
      expect(userService.hashPassword).toHaveBeenCalledWith('senha123');
      expect(manager.save).toHaveBeenCalledTimes(2);
      expect(result.company).toMatchObject({ name: 'X', id: 'new-id' });
      expect(result.admin).toMatchObject({ role: 'admin', companyId: 'new-id' });
      expect(result.admin).not.toHaveProperty('password');
    });
  });
});
