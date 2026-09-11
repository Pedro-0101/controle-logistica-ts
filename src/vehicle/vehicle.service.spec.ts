import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { VehicleService } from './vehicle.service.js';
import { Vehicle } from './entities/vehicle.entity.js';
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

describe('VehicleService', () => {
  let service: VehicleService;
  const repository = {
    create: vi.fn((data: Partial<Vehicle>) => data),
    save: vi.fn((data: Partial<Vehicle>) => data),
    find: vi.fn(),
    findOneBy: vi.fn(),
    remove: vi.fn((data: Partial<Vehicle>) => data),
    upsert: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehicleService,
        {
          provide: getRepositoryToken(Vehicle),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<VehicleService>(VehicleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('usuário comum deve forçar companyId da própria empresa', () => {
      service.create({ plate: 'ABC1234' } as never, companyActor);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          plate: 'ABC1234',
          companyId: 'company-1',
          createdById: 'user-id',
        }),
      );
    });

    it('root sem empresa deve ser bloqueado ao criar veículo', () => {
      expect(() =>
        service.create({ plate: 'ABC1234' } as never, rootActor),
      ).toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('usuário comum deve filtrar veículos pela própria empresa', async () => {
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

  describe('findOrCreateByPlate', () => {
    it('deve retornar o veículo existente sem criar outro', async () => {
      repository.findOneBy.mockResolvedValue({ id: 'vehicle-1', plate: 'ABC1234' });

      const result = await service.findOrCreateByPlate(
        'ABC1234',
        'company-1',
        companyActor,
      );

      expect(result).toEqual({ id: 'vehicle-1', plate: 'ABC1234' });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('deve criar veículo visitante quando a placa não existe', async () => {
      repository.findOneBy
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'new-vehicle', plate: 'ABC1234' });
      repository.upsert.mockResolvedValue({ identifiers: [], generatedMaps: [], raw: [] });

      const result = await service.findOrCreateByPlate(
        'ABC1234',
        'company-1',
        companyActor,
      );

      expect(repository.upsert).toHaveBeenCalledWith(
        {
          plate: 'ABC1234',
          code: 'ABC1234',
          type: 'visitor',
          active: true,
          companyId: 'company-1',
          createdById: 'user-id',
        },
        {
          conflictPaths: ['companyId', 'plate'],
          skipUpdateIfNoValuesChanged: true,
        },
      );
      expect(result).toEqual({ id: 'new-vehicle', plate: 'ABC1234' });
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

    it('deve lançar 404 quando não encontra o veículo', async () => {
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
        plate: 'ABC1234',
        companyId: 'company-1',
      });
      await service.update('1', { plate: 'ABC1D23' } as never, companyActor);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          plate: 'ABC1D23',
          companyId: 'company-1',
          updatedById: 'user-id',
        }),
      );
    });
  });

  describe('remove', () => {
    it('deve remover o veículo encontrado', async () => {
      repository.findOneBy.mockResolvedValue({ id: '1' });
      await service.remove('1', companyActor);
      expect(repository.remove).toHaveBeenCalledWith({ id: '1' });
    });

    it('deve lançar 404 ao remover veículo inexistente', async () => {
      repository.findOneBy.mockResolvedValue(null);
      await expect(service.remove('1', companyActor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
