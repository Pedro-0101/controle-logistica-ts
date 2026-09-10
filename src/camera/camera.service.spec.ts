import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CameraService } from './camera.service.js';
import { Camera } from './entities/camera.entity.js';
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

describe('CameraService', () => {
  let service: CameraService;
  const repository = {
    create: vi.fn((data: Partial<Camera>) => data),
    save: vi.fn((data: Partial<Camera>) => data),
    find: vi.fn(),
    findOneBy: vi.fn(),
    remove: vi.fn((data: Partial<Camera>) => data),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CameraService,
        {
          provide: getRepositoryToken(Camera),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<CameraService>(CameraService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('usuário comum deve forçar companyId da própria empresa', () => {
      service.create({ name: 'Portaria 1' } as never, companyActor);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Portaria 1',
          companyId: 'company-1',
          createdById: 'user-id',
        }),
      );
    });

    it('root pode definir companyId livremente', () => {
      service.create(
        { name: 'Portaria 1', companyId: 'empresa-x' } as never,
        rootActor,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'empresa-x',
          createdById: 'root-id',
        }),
      );
    });

    it('deve repassar o pointId da câmera para o repositório', () => {
      service.create(
        { name: 'Portaria 1', pointId: 'point-1' } as never,
        companyActor,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ pointId: 'point-1' }),
      );
    });
  });

  describe('findAll', () => {
    it('usuário comum deve filtrar câmeras pela própria empresa', async () => {
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

    it('deve lançar 404 quando não encontra a câmera', async () => {
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
        name: 'Portaria 1',
        companyId: 'company-1',
      });
      await service.update('1', { name: 'Portaria 2' } as never, companyActor);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          name: 'Portaria 2',
          companyId: 'company-1',
          updatedById: 'user-id',
        }),
      );
    });
  });

  describe('remove', () => {
    it('deve remover a câmera encontrada', async () => {
      repository.findOneBy.mockResolvedValue({ id: '1' });
      await service.remove('1', companyActor);
      expect(repository.remove).toHaveBeenCalledWith({ id: '1' });
    });

    it('deve lançar 404 ao remover câmera inexistente', async () => {
      repository.findOneBy.mockResolvedValue(null);
      await expect(service.remove('1', companyActor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
