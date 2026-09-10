import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminUnityService } from './admin-unity.service.js';
import { AdminUnity } from './entities/admin-unity.entity.js';
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

describe('AdminUnityService', () => {
  let service: AdminUnityService;
  const repository = {
    create: vi.fn((data: Partial<AdminUnity>) => data),
    save: vi.fn((data: Partial<AdminUnity>) => data),
    find: vi.fn(),
    findOneBy: vi.fn(),
    remove: vi.fn((data: Partial<AdminUnity>) => data),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUnityService,
        {
          provide: getRepositoryToken(AdminUnity),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<AdminUnityService>(AdminUnityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('usuário comum deve forçar companyId da própria empresa', () => {
      service.create({ name: 'Unidade 1' } as never, companyActor);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Unidade 1',
          companyId: 'company-1',
        }),
      );
    });

    it('root sem empresa deve ser bloqueado ao criar unidade', () => {
      expect(() =>
        service.create({ name: 'Unidade 1' } as never, rootActor),
      ).toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('usuário comum deve filtrar unidades pela própria empresa', async () => {
      repository.find.mockResolvedValue([{ id: '1' }]);
      await service.findAll(companyActor);
      expect(repository.find).toHaveBeenCalledWith({
        where: { companyId: 'company-1' },
      });
    });

    it('root deve listar sem filtro de empresa', async () => {
      repository.find.mockResolvedValue([{ id: '1' }]);
      await service.findAll(rootActor);
      expect(repository.find).toHaveBeenCalledWith({ where: undefined });
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

    it('deve lançar 404 quando não encontra a unidade', async () => {
      repository.findOneBy.mockResolvedValue(null);
      await expect(service.findOne('1', companyActor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('deve forçar companyId do ator', async () => {
      repository.findOneBy.mockResolvedValue({
        id: '1',
        name: 'Unidade 1',
        companyId: 'company-1',
      });
      await service.update('1', { name: 'Unidade 2' } as never, companyActor);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          name: 'Unidade 2',
          companyId: 'company-1',
        }),
      );
    });
  });

  describe('remove', () => {
    it('deve remover a unidade encontrada', async () => {
      repository.findOneBy.mockResolvedValue({ id: '1' });
      await service.remove('1', companyActor);
      expect(repository.remove).toHaveBeenCalledWith({ id: '1' });
    });

    it('deve lançar 404 ao remover unidade inexistente', async () => {
      repository.findOneBy.mockResolvedValue(null);
      await expect(service.remove('1', companyActor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
