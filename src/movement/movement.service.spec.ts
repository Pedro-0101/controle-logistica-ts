import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MovementService } from './movement.service.js';
import { Movement } from './entities/movement.entity.js';
import { CameraService } from '../camera/camera.service.js';
import { AnprService } from '../anpr/anpr.service.js';
import { VehicleService } from '../vehicle/vehicle.service.js';
import { PointService } from '../point/point.service.js';
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
  const cameraService = { findOne: vi.fn() };
  const anprService = { reconhecerCamera: vi.fn() };
  const vehicleService = { findOrCreateByPlate: vi.fn() };
  const pointService = { findOne: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MovementService,
        {
          provide: getRepositoryToken(Movement),
          useValue: repository,
        },
        { provide: CameraService, useValue: cameraService },
        { provide: AnprService, useValue: anprService },
        { provide: VehicleService, useValue: vehicleService },
        { provide: PointService, useValue: pointService },
      ],
    }).compile();

    service = module.get<MovementService>(MovementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('usuário comum deve forçar companyId da própria empresa', () => {
      service.create({ vehicleId: 'v-1', type: 'entry' } as never, companyActor);

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
      cameraService.findOne.mockResolvedValue({ id: 'camera-1', pointId: 'point-1' });
      pointService.findOne.mockResolvedValue({ id: 'point-1', type: 'entry' });
      anprService.reconhecerCamera.mockResolvedValue({ placa: 'ABC1D23' });
      vehicleService.findOrCreateByPlate.mockResolvedValue({ id: 'vehicle-1' });
      repository.save.mockResolvedValue({ id: 'mov-1' });
    });

    it('deve orquestrar câmera → ponto → ANPR → veículo → movimento', async () => {
      const result = await service.createFromCamera(dto, companyActor);

      expect(cameraService.findOne).toHaveBeenCalledWith('camera-1', companyActor);
      expect(pointService.findOne).toHaveBeenCalledWith('point-1', companyActor);
      expect(anprService.reconhecerCamera).toHaveBeenCalledWith({
        id: 'camera-1',
        pointId: 'point-1',
      });
      expect(vehicleService.findOrCreateByPlate).toHaveBeenCalledWith(
        'ABC1D23',
        'company-1',
        companyActor,
      );
      expect(result).toEqual({
        movement: { id: 'mov-1' },
        vehicle: { id: 'vehicle-1' },
      });
    });

    it('usuário comum deve registrar na própria empresa com pointId da câmera e type do ponto', async () => {
      await service.createFromCamera(dto, companyActor);

      expect(repository.create).toHaveBeenCalledWith(
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
      pointService.findOne.mockResolvedValue({ id: 'point-1', type: 'both' });

      await expect(service.createFromCamera(dto, companyActor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ponto "both" com type no payload deve usar o type informado', async () => {
      pointService.findOne.mockResolvedValue({ id: 'point-1', type: 'both' });

      await service.createFromCamera(
        { ...(dto as object), type: 'exit' } as never,
        companyActor,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'exit' }),
      );
    });

    it('deve usar a data atual quando dateTime não é informado', async () => {
      const before = new Date().toISOString();
      await service.createFromCamera(
        { ...(dto as object), dateTime: undefined } as never,
        companyActor,
      );
      const created = repository.create.mock.calls[0][0] as { dateTime: string };
      expect(created.dateTime >= before).toBe(true);
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
      });
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
