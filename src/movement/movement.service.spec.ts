import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MovementService } from './movement.service.js';
import { Movement } from './entities/movement.entity.js';
import { AnprService } from '../anpr/anpr.service.js';
import { VehicleService } from '../vehicle/vehicle.service.js';
import { PointService } from '../point/point.service.js';
import { MonitoringService } from '../monitoring/monitoring.service.js';
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

describe('MovementService', () => {
  let service: MovementService;
  const repository = {
    create: vi.fn((data: Partial<Movement>) => data),
    save: vi.fn((data: Partial<Movement>) => data),
    find: vi.fn(),
    findOneBy: vi.fn(),
    remove: vi.fn((data: Partial<Movement>) => data),
  };
  const anprService = { reconhecerCamera: vi.fn() };
  const vehicleService = { findOrCreateByPlate: vi.fn(), findOne: vi.fn() };
  const pointService = { findOne: vi.fn() };
  const monitoringService = {
    current: vi.fn(),
    fresh: vi.fn(),
    assertCurrent: vi.fn(),
  };
  const observationRepo = {
    findOne: vi.fn(),
  };
  const movementRepoInTx = {
    findOneBy: vi.fn(),
    save: vi.fn((data: Partial<Movement>) => data),
    create: vi.fn((data: Partial<Movement>) => data),
  };
  const vehicleRepoInTx = {
    findOneByOrFail: vi.fn(),
    findOneBy: vi.fn(),
    createQueryBuilder: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      into: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      orIgnore: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    }),
  };
  const dataSource = {
    transaction: vi.fn(async (fn: (manager: { getRepository: (entity: unknown) => unknown }) => Promise<unknown>) => {
      const manager = {
        getRepository: (entity: unknown) => {
          const name = (entity as { name?: string }).name ?? '';
          if (name === 'CameraObservation') return observationRepo;
          if (name === 'Movement') return movementRepoInTx;
          if (name === 'Vehicle') return vehicleRepoInTx;
          return {};
        },
      };
      return fn(manager);
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MovementService,
        {
          provide: getRepositoryToken(Movement),
          useValue: repository,
        },
        { provide: AnprService, useValue: anprService },
        { provide: VehicleService, useValue: vehicleService },
        { provide: PointService, useValue: pointService },
        { provide: MonitoringService, useValue: monitoringService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<MovementService>(MovementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    beforeEach(() => {
      vehicleService.findOne.mockResolvedValue({ id: 'v-1', active: true, companyId: 'company-1' });
    });

    it('usuário comum deve forçar companyId da própria empresa', async () => {
      await service.create({ vehicleId: 'v-1', type: 'entry' } as never, companyActor);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          vehicleId: 'v-1',
          type: 'entry',
          companyId: 'company-1',
          createdById: 'user-id',
        }),
      );
    });
  });

  describe('createFromCamera', () => {
    const dto = {
      cameraId: 'camera-1',
      dateTime: '2026-08-29T12:00:00.000Z',
      purpose: 'Entrega',
      driverName: 'João',
      notes: 'Portão 2',
    } as never;

    beforeEach(() => {
      monitoringService.current.mockResolvedValue({
        cameraId: 'camera-1', status: 'confirmed', observationId: 'obs-1', placa: 'ABC1D23',
        confianca: 0.95, capturedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 5000).toISOString(), consecutiveReads: 2, box: null,
      });
      monitoringService.fresh.mockReturnValue(true);
      observationRepo.findOne.mockResolvedValue({ id: 'obs-1', expiresAt: new Date(Date.now() + 10000), plate: 'ABC1D23', cameraId: 'camera-1', pointId: 'point-1', companyId: 'company-1' });
      movementRepoInTx.findOneBy.mockResolvedValue(null);
      vehicleRepoInTx.findOneByOrFail.mockResolvedValue({ id: 'vehicle-1', active: true });
      monitoringService.assertCurrent.mockResolvedValue(undefined);
      pointService.findOne.mockResolvedValue({ id: 'point-1', type: 'entry', active: true });
      vehicleService.findOrCreateByPlate.mockResolvedValue({ id: 'vehicle-1', active: true });
      movementRepoInTx.save.mockResolvedValue({ id: 'mov-1' });
    });

    it('deve orquestrar câmera → observação → veículo → movimento', async () => {
      const result = await service.createFromCamera(dto, companyActor);

      expect(monitoringService.current).toHaveBeenCalledWith('camera-1', companyActor);
      expect(monitoringService.fresh).toHaveBeenCalled();
      expect(result).toMatchObject({
        movement: { id: 'mov-1' },
        vehicle: { id: 'vehicle-1' },
      });
    });

    it('usuário comum deve registrar na própria empresa com pointId da observação e type do ponto', async () => {
      await service.createFromCamera(dto, companyActor);

      expect(movementRepoInTx.save).toHaveBeenCalledWith(
        expect.objectContaining({
          pointId: 'point-1',
          vehicleId: 'vehicle-1',
          type: 'entry',
          status: 'open',
          companyId: 'company-1',
          createdById: 'user-id',
        }),
      );
    });

    it('root sem empresa deve ser bloqueado', async () => {
      await expect(service.createFromCamera(dto, rootActor)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('ponto "both" sem type no payload deve lançar 400', async () => {
      pointService.findOne.mockResolvedValue({ id: 'point-1', type: 'both', active: true });

      await expect(service.createFromCamera(dto, companyActor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ponto "both" com type no payload deve usar o type informado', async () => {
      pointService.findOne.mockResolvedValue({ id: 'point-1', type: 'both', active: true });

      await service.createFromCamera(
        { ...(dto as object), type: 'exit' } as never,
        companyActor,
      );

      expect(movementRepoInTx.save).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'exit' }),
      );
    });

    it('deve usar a data atual quando dateTime não é informado', async () => {
      const before = Date.now();
      await service.createFromCamera(
        { ...(dto as object), dateTime: undefined } as never,
        companyActor,
      );
      const created = movementRepoInTx.save.mock.calls[0][0] as { dateTime: Date };
      expect(created.dateTime.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('deve lançar 409 quando observação não está fresh', async () => {
      monitoringService.fresh.mockReturnValue(false);

      await expect(service.createFromCamera(dto, companyActor)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('usuário comum deve filtrar movimentos pela própria empresa', async () => {
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

    it('deve lançar 404 quando não encontra o movimento', async () => {
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
        type: 'entry',
        companyId: 'company-1',
        vehicleId: 'v-1',
        pointId: 'p-1',
      });
      vehicleService.findOne.mockResolvedValue({ id: 'v-1', active: true, companyId: 'company-1' });
      pointService.findOne.mockResolvedValue({ id: 'p-1', companyId: 'company-1', active: true, type: 'both' });
      await service.update('1', { type: 'exit' } as never, companyActor);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          type: 'exit',
          companyId: 'company-1',
          updatedById: 'user-id',
        }),
      );
    });
  });

  describe('remove', () => {
    it('deve remover o movimento encontrado', async () => {
      repository.findOneBy.mockResolvedValue({ id: '1' });
      await service.remove('1', companyActor);
      expect(repository.remove).toHaveBeenCalledWith({ id: '1' });
    });
  });
});
