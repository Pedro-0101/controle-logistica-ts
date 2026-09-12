import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CompanyService } from './company.service.js';
import { Company } from './entities/company.entity.js';
import { User } from '../user/entities/user.entity.js';
import { UserService } from '../user/user.service.js';
import { CompanyConfigService } from '../company-config/company-config.service.js';
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
  active: true,
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
  const configService = {
    createWithDefaults: vi.fn(async () => ({ id: 'config-1', companyId: 'new-id' })),
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
        {
          provide: CompanyConfigService,
          useValue: configService,
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

    it('root cria empresa, admin e config na mesma transação', async () => {
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
      expect(manager.create).toHaveBeenCalledWith(
        'CompanyConfig',
        expect.objectContaining({
          companyId: 'new-id',
          createdById: 'root-id',
        }),
      );
      expect(userService.hashPassword).toHaveBeenCalledWith('senha123');
      expect(manager.save).toHaveBeenCalledTimes(3);
      expect(result.company).toMatchObject({ name: 'X', id: 'new-id' });
      expect(result.admin).toMatchObject({ role: 'admin', companyId: 'new-id' });
      expect(result.admin).not.toHaveProperty('password');
      expect(result.config).toMatchObject({ companyId: 'new-id' });
    });
  });

  describe('findOne', () => {
    it('root deve buscar empresa por id', async () => {
      repository.findOneBy.mockResolvedValue({ id: 'company-1' });
      await service.findOne('company-1', rootActor);
      expect(repository.findOneBy).toHaveBeenCalledWith({ id: 'company-1' });
    });

    it('usuário comum deve ver apenas a própria empresa', async () => {
      repository.findOneBy.mockResolvedValue({ id: 'company-1' });
      await service.findOne('company-1', companyActor);
      expect(repository.findOneBy).toHaveBeenCalledWith({ id: 'company-1' });
    });

    it('usuário comum não deve acessar empresa de terceiros', async () => {
      await expect(service.findOne('company-2', companyActor)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.findOneBy).not.toHaveBeenCalled();
    });

    it('deve lançar 404 quando a empresa não existe', async () => {
      repository.findOneBy.mockResolvedValue(null);
      await expect(service.findOne('company-1', rootActor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('deve atualizar a empresa e registrar updatedById', async () => {
      repository.findOneBy.mockResolvedValue({
        id: 'company-1',
        name: 'X',
      });
      await service.update(
        'company-1',
        { name: 'X Atualizada' } as never,
        rootActor,
      );

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'company-1',
          name: 'X Atualizada',
          updatedById: 'root-id',
        }),
      );
    });
  });

  describe('remove', () => {
    it('deve remover a empresa encontrada', async () => {
      repository.findOneBy.mockResolvedValue({ id: 'company-1' });
      await service.remove('company-1', rootActor);
      expect(repository.remove).toHaveBeenCalledWith({ id: 'company-1' });
    });
  });
});
