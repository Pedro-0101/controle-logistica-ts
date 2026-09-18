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
    count: vi.fn(),
    remove: vi.fn((data: Partial<Movement>) => data),
    createQueryBuilder: vi.fn(),
  };
  const anprService = { reconhecerCamera: vi.fn() };
  const vehicleService = { findOrCreateByPlate: vi.fn(), findOne: vi.fn(), findByPlate: vi.fn() };
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
    findOne: vi.fn(),
    find: vi.fn(),
    save: vi.fn((data: Partial<Movement>) => data),
    create: vi.fn((data: Partial<Movement>) => data),
    createQueryBuilder: vi.fn(),
  };
  const closeVisitQb = {
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    getOne: vi.fn(),
  };
  movementRepoInTx.createQueryBuilder.mockReturnValue(closeVisitQb);
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
      movementRepoInTx.createQueryBuilder.mockReturnValue(closeVisitQb);
      closeVisitQb.getOne.mockResolvedValue(null);
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

    it('saída confirmada fecha a entrada aberta do mesmo veículo na unidade', async () => {
      pointService.findOne.mockResolvedValue({
        id: 'point-exit', type: 'exit', active: true, adminUnityId: 'unit-1',
      });
      movementRepoInTx.save.mockImplementation((data: Partial<Movement> | Partial<Movement>[]) => data as never);
      const openEntry = {
        id: 'mov-entry', type: 'entry', status: 'open', vehicleId: 'vehicle-1',
        companyId: 'company-1', dateTime: new Date('2026-08-29T11:00:00.000Z'),
      };
      closeVisitQb.getOne.mockResolvedValue(openEntry);

      await service.createFromCamera(dto, companyActor);

      expect(closeVisitQb.andWhere).toHaveBeenCalledWith(
        'point.adminUnityId = :adminUnityId', { adminUnityId: 'unit-1' },
      );
      expect(openEntry.status).toBe('closed');
      const finalSave = movementRepoInTx.save.mock.calls.at(-1)?.[0] as Movement[];
      expect(finalSave).toHaveLength(2);
      expect(finalSave.every((m) => m.status === 'closed')).toBe(true);
    });

    it('saída sem entrada aberta correspondente também é finalizada', async () => {
      pointService.findOne.mockResolvedValue({
        id: 'point-exit', type: 'exit', active: true, adminUnityId: 'unit-1',
      });
      movementRepoInTx.save.mockImplementation((data: Partial<Movement> | Partial<Movement>[]) => data as never);
      closeVisitQb.getOne.mockResolvedValue(null);

      await service.createFromCamera(dto, companyActor);

      const finalSave = movementRepoInTx.save.mock.calls.at(-1)?.[0] as Movement;
      expect(finalSave.status).toBe('closed');
      expect(finalSave.type).toBe('exit');
    });
  });

  describe('recalculate', () => {
    const pendingMovement = {
      id: 'mov-1',
      companyId: 'company-1',
      status: 'pending_review',
      recognizedPlate: 'ABC1D23',
      vehicleId: null,
      type: 'entry',
    };

    beforeEach(() => {
      movementRepoInTx.findOne.mockResolvedValue({ ...pendingMovement });
      movementRepoInTx.save.mockImplementation((data: Partial<Movement>) => data);
      vehicleService.findByPlate.mockResolvedValue({
        id: 'vehicle-1', plate: 'ABC1D23', active: true,
      });
    });

    it('confirma o movimento alvo e todos os pendentes com a mesma placa', async () => {
      const other = { ...pendingMovement, id: 'mov-2' };
      movementRepoInTx.find.mockResolvedValue([
        { ...pendingMovement },
        { ...other },
      ]);

      const result = await service.recalculate('mov-1', { plate: 'ABC1D23' }, companyActor);

      expect(movementRepoInTx.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: 'company-1',
            status: 'pending_review',
            recognizedPlate: expect.anything(),
          },
        }),
      );
      const saved = movementRepoInTx.save.mock.calls[0][0] as Movement[];
      expect(saved).toHaveLength(2);
      expect(saved.every((m) => m.status === 'open' && m.vehicleId === 'vehicle-1')).toBe(true);
      expect(result).toMatchObject({ id: 'mov-1', status: 'open', vehicleId: 'vehicle-1' });
    });

    it('inclui a placa do veículo resolvido na busca por pendentes', async () => {
      movementRepoInTx.find.mockResolvedValue([{ ...pendingMovement }]);
      vehicleService.findOne.mockResolvedValue({ id: 'vehicle-1', plate: 'XYZ9Z99', active: true });

      await service.recalculate('mov-1', { vehicleId: 'vehicle-1' }, companyActor);

      const where = movementRepoInTx.find.mock.calls[0][0].where as { recognizedPlate: { value: string[] } };
      expect(where.recognizedPlate.value).toEqual(
        expect.arrayContaining(['ABC1D23', 'XYZ9Z99']),
      );
    });

    it('lança 404 quando o veículo da placa não existe', async () => {
      vehicleService.findByPlate.mockResolvedValue(null);

      await expect(service.recalculate('mov-1', { plate: 'ABC1D23' }, companyActor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lança 409 quando o movimento não está pendente', async () => {
      movementRepoInTx.findOne.mockResolvedValue({ ...pendingMovement, status: 'open' });

      await expect(service.recalculate('mov-1', { plate: 'ABC1D23' }, companyActor)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('discard', () => {
    const pending = {
      id: 'mov-1',
      companyId: 'company-1',
      status: 'pending_review',
      recognizedPlate: 'ABC1D23',
    };

    it('descarta apenas os movimentos informados', async () => {
      movementRepoInTx.find.mockResolvedValue([{ ...pending }, { ...pending, id: 'mov-2' }]);
      movementRepoInTx.save.mockImplementation((data: Partial<Movement>) => data);

      const result = await service.discard(['mov-1', 'mov-2'], companyActor);

      expect(movementRepoInTx.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: expect.anything(), companyId: 'company-1' },
        }),
      );
      const saved = movementRepoInTx.save.mock.calls[0][0] as Movement[];
      expect(saved).toHaveLength(2);
      expect(saved.every((m) => m.status === 'discarded' && m.updatedById === 'user-id')).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('não afeta outros pendentes com a mesma placa', async () => {
      movementRepoInTx.find.mockResolvedValue([{ ...pending }]);
      movementRepoInTx.save.mockImplementation((data: Partial<Movement>) => data);

      await service.discard(['mov-1'], companyActor);

      const saved = movementRepoInTx.save.mock.calls[0][0] as Movement[];
      expect(saved).toHaveLength(1);
      expect(saved[0].id).toBe('mov-1');
    });

    it('lança 404 quando algum movimento não existe', async () => {
      movementRepoInTx.find.mockResolvedValue([{ ...pending }]);

      await expect(service.discard(['mov-1', 'mov-2'], companyActor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lança 409 quando algum movimento não está pendente', async () => {
      movementRepoInTx.find.mockResolvedValue([{ ...pending, status: 'open' }]);

      await expect(service.discard(['mov-1'], companyActor)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('hasRecentMovementByPlate', () => {
    it('detecta movimento recente pela placa reconhecida', async () => {
      repository.count.mockResolvedValue(1);

      await expect(
        service.hasRecentMovementByPlate('ABC1D23', 'point-1', 300, 'company-1'),
      ).resolves.toBe(true);
      expect(repository.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          recognizedPlate: 'ABC1D23',
          pointId: 'point-1',
          companyId: 'company-1',
        }),
      });
    });

    it('retorna false quando não há movimento recente', async () => {
      repository.count.mockResolvedValue(0);

      await expect(
        service.hasRecentMovementByPlate('ABC1D23', 'point-1', 300, 'company-1'),
      ).resolves.toBe(false);
    });
  });

  describe('findAll', () => {
    const defaultFilters = { page: 1, limit: 20, orderBy: 'dateTime' as const, order: 'DESC' as const };
    let qbMock: ReturnType<typeof createQbMock>;

    function createQbMock() {
      return {
        leftJoin: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getCount: vi.fn().mockResolvedValue(0),
        getRawAndEntities: vi.fn().mockResolvedValue({ entities: [], raw: [] }),
      };
    }

    beforeEach(() => {
      qbMock = createQbMock();
      repository.createQueryBuilder = vi.fn().mockReturnValue(qbMock);
    });

    it('usuário comum deve filtrar movimentos pela própria empresa', async () => {
      qbMock.getRawAndEntities.mockResolvedValue({
        entities: [{ id: '1', pointId: 'p-1', vehicleId: 'v-1' }],
        raw: [{ point_id: 'p-1', point_name: 'Portão 1', point_code: 'P-001', point_type: 'entry', vehicle_id: 'v-1', vehicle_plate: 'ABC1D23', vehicle_code: 'V-001', vehicle_type: 'own', vehicle_active: true, cam_id: null, cam_name: null, cam_ip: null }],
      });
      qbMock.getCount.mockResolvedValue(1);

      const result = await service.findAll(companyActor, defaultFilters);

      expect(repository.createQueryBuilder).toHaveBeenCalled();
      expect(qbMock.andWhere).toHaveBeenCalledWith('m.companyId = :companyId', { companyId: 'company-1' });
      expect(result).toEqual({
        data: [expect.objectContaining({ id: '1' })],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    });

    it('deve filtrar por type quando informado', async () => {
      await service.findAll(companyActor, { ...defaultFilters, type: 'entry' });
      expect(qbMock.andWhere).toHaveBeenCalledWith('m.type = :type', { type: 'entry' });
    });

    it('deve filtrar por status quando informado', async () => {
      await service.findAll(companyActor, { ...defaultFilters, status: 'open' });
      expect(qbMock.andWhere).toHaveBeenCalledWith('m.status = :status', { status: 'open' });
    });

    it('deve filtrar por plate quando informado', async () => {
      await service.findAll(companyActor, { ...defaultFilters, plate: 'ABC' });
      expect(qbMock.andWhere).toHaveBeenCalledWith('vehicle.plate ILIKE :plate', { plate: '%ABC%' });
    });

    it('deve incluir dados da câmera quando observação existe', async () => {
      qbMock.getRawAndEntities.mockResolvedValue({
        entities: [{ id: '1' }],
        raw: [{ cam_id: 'cam-1', cam_name: 'Câmera 1', cam_ip: '192.168.1.1', point_id: 'p-1', point_name: 'Portão', point_code: 'P-001', point_type: 'entry', vehicle_id: null, vehicle_plate: null, vehicle_code: null, vehicle_type: null, vehicle_active: null }],
      });

      const result = await service.findAll(companyActor, defaultFilters);
      expect(result.data[0]).toEqual(expect.objectContaining({
        camera: { id: 'cam-1', name: 'Câmera 1', ip: '192.168.1.1' },
      }));
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

  describe('reconcile', () => {
    const reconcileQb = {
      innerJoin: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      getRawAndEntities: vi.fn(),
    };
    const dto = {
      dateFrom: '2026-09-01T00:00:00.000Z',
      dateTo: '2026-09-10T00:00:00.000Z',
    };
    const movement = (overrides: Partial<Movement>) => ({
      id: 'mov-1',
      vehicleId: 'vehicle-1',
      pointId: 'point-1',
      companyId: 'company-1',
      type: 'entry',
      status: 'open',
      dateTime: new Date('2026-09-02T10:00:00.000Z'),
      ...overrides,
    }) as Movement;

    beforeEach(() => {
      movementRepoInTx.createQueryBuilder.mockReturnValue(reconcileQb);
      movementRepoInTx.save.mockImplementation((data: Partial<Movement>) => data);
      reconcileQb.getRawAndEntities.mockReset();
    });

    it('fecha entrada e saída pareadas na mesma unidade', async () => {
      const entry = movement({ id: 'entry-1', type: 'entry', status: 'open' });
      const exit = movement({
        id: 'exit-1', type: 'exit', status: 'open',
        dateTime: new Date('2026-09-02T12:00:00.000Z'),
      });
      reconcileQb.getRawAndEntities.mockResolvedValue({
        entities: [entry, exit],
        raw: [{ unitId: 'unit-1' }, { unitId: 'unit-1' }],
      });

      const result = await service.reconcile(dto, companyActor);

      expect(entry.status).toBe('closed');
      expect(exit.status).toBe('closed');
      expect(movementRepoInTx.save).toHaveBeenCalledWith([entry, exit]);
      expect(result).toMatchObject({ analyzed: 2, closed: 2, reopened: 0, unmatchedExits: 0 });
    });

    it('reabre entrada que ficou sem saída (ex.: saída descartada)', async () => {
      const entry = movement({ id: 'entry-1', type: 'entry', status: 'closed' });
      reconcileQb.getRawAndEntities.mockResolvedValue({
        entities: [entry],
        raw: [{ unitId: 'unit-1' }],
      });

      const result = await service.reconcile(dto, companyActor);

      expect(entry.status).toBe('open');
      expect(movementRepoInTx.save).toHaveBeenCalledWith([entry]);
      expect(result).toMatchObject({ analyzed: 1, closed: 0, reopened: 1, unmatchedExits: 0 });
      expect(result.movements[0]).toMatchObject({ previousStatus: 'closed', status: 'open' });
    });

    it('não altera saída sem entrada correspondente', async () => {
      const exit = movement({ id: 'exit-1', type: 'exit', status: 'open' });
      reconcileQb.getRawAndEntities.mockResolvedValue({
        entities: [exit],
        raw: [{ unitId: 'unit-1' }],
      });

      const result = await service.reconcile(dto, companyActor);

      expect(exit.status).toBe('open');
      expect(movementRepoInTx.save).not.toHaveBeenCalled();
      expect(result).toMatchObject({ analyzed: 1, unchanged: 1, unmatchedExits: 1 });
    });

    it('não pareia movimentos de unidades diferentes', async () => {
      const entry = movement({ id: 'entry-1', type: 'entry', status: 'open' });
      const exit = movement({
        id: 'exit-1', type: 'exit', status: 'open',
        dateTime: new Date('2026-09-02T12:00:00.000Z'),
      });
      reconcileQb.getRawAndEntities.mockResolvedValue({
        entities: [entry, exit],
        raw: [{ unitId: 'unit-1' }, { unitId: 'unit-2' }],
      });

      const result = await service.reconcile(dto, companyActor);

      expect(entry.status).toBe('open');
      expect(exit.status).toBe('open');
      expect(result).toMatchObject({ analyzed: 2, unchanged: 2, unmatchedExits: 1 });
    });

    it('rejeita período maior que 31 dias', async () => {
      await expect(
        service.reconcile(
          { dateFrom: '2026-08-01T00:00:00.000Z', dateTo: '2026-09-10T00:00:00.000Z' },
          companyActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('exige companyId para admin global', async () => {
      await expect(service.reconcile(dto, rootActor)).rejects.toThrow(ForbiddenException);
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
