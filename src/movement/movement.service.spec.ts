import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { MovementService } from './movement.service.js';
import { Movement } from './entities/movement.entity.js';
import { CameraService } from '../camera/camera.service.js';
import { AnprService } from '../anpr/anpr.service.js';
import { VehicleService } from '../vehicle/vehicle.service.js';
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
      pointId: 'point-1',
      type: 'entry',
      companyId: 'company-x',
      dateTime: '2026-08-29T12:00:00.000Z',
      purpose: 'Entrega',
      driverName: 'João',
      notes: 'Portão 2',
    } as never;

    beforeEach(() => {
      cameraService.findOne.mockResolvedValue({ id: 'camera-1' });
      anprService.reconhecerCamera.mockResolvedValue({ placa: 'ABC1D23' });
      vehicleService.findOrCreateByPlate.mockResolvedValue({ id: 'vehicle-1' });
      repository.save.mockResolvedValue({ id: 'mov-1' });
    });

    it('deve orquestrar câmera → ANPR → veículo → movimento', async () => {
      await service.createFromCamera(dto, companyActor);

      expect(cameraService.findOne).toHaveBeenCalledWith('camera-1', companyActor);
      expect(anprService.reconhecerCamera).toHaveBeenCalledWith({
        id: 'camera-1',
      });
      expect(vehicleService.findOrCreateByPlate).toHaveBeenCalledWith(
        'ABC1D23',
        'company-1',
        companyActor,
      );
    });

    it('usuário comum deve registrar o movimento na própria empresa', async () => {
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

    it('root deve usar o companyId informado no DTO', async () => {
      await service.createFromCamera(dto, rootActor);

      expect(vehicleService.findOrCreateByPlate).toHaveBeenCalledWith(
        'ABC1D23',
        'company-x',
        rootActor,
      );
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-x',
          createdById: 'root-id',
        }),
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
