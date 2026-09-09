import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PointService } from './point.service.js';
import { Point } from './entities/point.entity.js';
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

describe('PointService', () => {
  let service: PointService;
  const repository = {
    create: vi.fn((data: Partial<Point>) => data),
    save: vi.fn((data: Partial<Point>) => data),
    find: vi.fn(),
    findOneBy: vi.fn(),
    remove: vi.fn((data: Partial<Point>) => data),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PointService,
        {
          provide: getRepositoryToken(Point),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<PointService>(PointService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('usuário comum deve forçar companyId da própria empresa', () => {
      service.create({ name: 'P1' } as never, companyActor);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'P1',
          companyId: 'company-1',
          createdById: 'user-id',
        }),
      );
    });

    it('root pode definir companyId livremente', () => {
      service.create(
        { name: 'P1', companyId: 'empresa-x' } as never,
        rootActor,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'empresa-x',
          createdById: 'root-id',
        }),
      );
    });
  });

  describe('findAll', () => {
    it('usuário comum deve filtrar pontos pela própria empresa', async () => {
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

    it('deve lançar 404 quando não encontra o ponto', async () => {
      repository.findOneBy.mockResolvedValue(null);
      await expect(service.findOne('1', companyActor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('deve forçar companyId do ator e registrar updatedById', async () => {
      repository.findOneBy.mockResolvedValue({
        id: '1',
        name: 'P1',
        companyId: 'company-1',
      });
      await service.update('1', { name: 'P2' } as never, companyActor);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          name: 'P2',
          companyId: 'company-1',
          updatedById: 'user-id',
        }),
      );
    });
  });

  describe('remove', () => {
    it('deve remover o ponto encontrado', async () => {
      repository.findOneBy.mockResolvedValue({ id: '1' });
      await service.remove('1', companyActor);
      expect(repository.remove).toHaveBeenCalledWith({ id: '1' });
    });

    it('deve lançar 404 ao remover ponto inexistente', async () => {
      repository.findOneBy.mockResolvedValue(null);
      await expect(service.remove('1', companyActor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
