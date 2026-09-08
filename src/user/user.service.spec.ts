import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { UserService } from './user.service.js';
import { User } from './entities/user.entity.js';
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

describe('UserService', () => {
  let service: UserService;
  const repository = {
    create: vi.fn((data: Partial<User>) => data),
    save: vi.fn((data: Partial<User>) => data),
    find: vi.fn(),
    findOneBy: vi.fn(),
    remove: vi.fn((data: Partial<User>) => data),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('root deve listar todos os usuários (sem filtro de empresa)', async () => {
      repository.find.mockResolvedValue([{ id: '1' }]);
      await service.findAll(rootActor);
      expect(repository.find).toHaveBeenCalledWith({ where: undefined });
    });

    it('usuário comum deve filtrar pela própria empresa', async () => {
      repository.find.mockResolvedValue([{ id: '1' }]);
      await service.findAll(companyActor);
      expect(repository.find).toHaveBeenCalledWith({
        where: { companyId: 'company-1' },
      });
    });
  });

  describe('findOne', () => {
    it('usuário comum deve buscar com filtro de empresa', async () => {
      repository.findOneBy.mockResolvedValue({ id: '1' });
      await service.findOne('1', companyActor);
      expect(repository.findOneBy).toHaveBeenCalledWith({
        id: '1',
        companyId: 'company-1',
      });
    });

    it('deve lançar 404 quando não encontra o usuário no escopo', async () => {
      repository.findOneBy.mockResolvedValue(null);
      await expect(service.findOne('1', companyActor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('usuário comum deve forçar companyId da própria empresa', async () => {
      await service.create(
        {
          name: 'João',
          email: 'joao@empresa.com',
          password: 'senha123',
          companyId: 'outra-empresa',
        },
        companyActor,
      );
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'company-1' }),
      );
    });

    it('root pode definir companyId livremente', async () => {
      await service.create(
        {
          name: 'João',
          email: 'joao@empresa.com',
          password: 'senha123',
          companyId: 'empresa-x',
        },
        rootActor,
      );
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'empresa-x' }),
      );
    });
  });
});
