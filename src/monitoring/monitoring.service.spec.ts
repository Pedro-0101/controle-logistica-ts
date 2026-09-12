import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MonitoringService } from './monitoring.service.js';
import { Camera } from '../camera/entities/camera.entity.js';
import { Point } from '../point/entities/point.entity.js';
import { AdminUnity } from '../admin-unity/entities/admin-unity.entity.js';
import { CameraObservation } from './observation.entity.js';
import { AnprService } from '../anpr/anpr.service.js';
import { MediaMTXService } from '../camera/mediamtx.service.js';
import { SnapshotService } from '../camera/snapshot.service.js';
import type { Actor } from '../auth/company-scope.js';
import type { CurrentObservation } from './observation.schema.js';

const companyActor: Actor = {
  userId: 'user-id',
  email: 'user@empresa.com',
  role: 'admin',
  companyId: 'company-1',
};

describe('MonitoringService', () => {
  let service: MonitoringService;

  const camerasRepo = {
    find: vi.fn(),
    findOneBy: vi.fn(),
  };
  const pointsRepo = {
    findOneBy: vi.fn(),
  };
  const unitsRepo = {
    findOneBy: vi.fn(),
  };
  const observationsRepo = {
    findOne: vi.fn(),
    findOneBy: vi.fn(),
    findOneByOrFail: vi.fn(),
    createQueryBuilder: vi.fn(),
  };
  const anprService = {
    upsertMonitor: vi.fn(),
    deleteMonitor: vi.fn(),
    listMonitors: vi.fn(),
    currentObservation: vi.fn(),
  };
  const mediamtxService = {
    addPath: vi.fn(),
    removePath: vi.fn(),
    pathExists: vi.fn(),
    listPaths: vi.fn(),
    getStreamUrls: vi.fn(() => ({
      hlsUrl: 'http://localhost:8888/test/index.m3u8',
      webrtcUrl: 'http://localhost:8889/test',
      rtspUrl: 'rtsp://localhost:8554/test',
    })),
  };
  const snapshotService = {
    capture: vi.fn(),
  };
  const configService = {
    get: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoringService,
        { provide: getRepositoryToken(Camera), useValue: camerasRepo },
        { provide: getRepositoryToken(Point), useValue: pointsRepo },
        { provide: getRepositoryToken(AdminUnity), useValue: unitsRepo },
        { provide: getRepositoryToken(CameraObservation), useValue: observationsRepo },
        { provide: AnprService, useValue: anprService },
        { provide: MediaMTXService, useValue: mediamtxService },
        { provide: SnapshotService, useValue: snapshotService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<MonitoringService>(MonitoringService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onApplicationBootstrap', () => {
    it('não deve iniciar reconciliação quando MONITORING_ENABLED=false', () => {
      configService.get.mockReturnValue('false');
      const spy = vi.spyOn(service, 'reconcile');

      service.onApplicationBootstrap();

      expect(spy).not.toHaveBeenCalled();
    });

    it('deve iniciar reconciliação quando MONITORING_ENABLED não é false', async () => {
      configService.get.mockReturnValue(undefined);
      camerasRepo.find.mockResolvedValue([]);

      service.onApplicationBootstrap();
      await service.reconcile();

      expect(anprService.listMonitors).toHaveBeenCalled();
    });
  });

  describe('reconcile / sync', () => {
    it('deve registrar câmeras com contexto válido', async () => {
      const camera = { id: 'cam-1', pointId: 'point-1', adminUnityId: 'unit-1', companyId: 'company-1' } as Camera;
      camerasRepo.find.mockResolvedValue([camera]);
      pointsRepo.findOneBy.mockResolvedValue({ id: 'point-1', companyId: 'company-1', active: true, adminUnityId: 'unit-1' });
      unitsRepo.findOneBy.mockResolvedValue({ id: 'unit-1', companyId: 'company-1', active: true });
      anprService.listMonitors.mockResolvedValue([]);

      await service.reconcile();

      expect(anprService.upsertMonitor).toHaveBeenCalledWith(camera);
    });

    it('não deve registrar câmera com ponto inválido', async () => {
      camerasRepo.find.mockResolvedValue([
        { id: 'cam-1', pointId: 'point-1', adminUnityId: 'unit-1', companyId: 'company-1' } as Camera,
      ]);
      pointsRepo.findOneBy.mockResolvedValue(null);
      unitsRepo.findOneBy.mockResolvedValue({ id: 'unit-1', companyId: 'company-1', active: true });
      anprService.listMonitors.mockResolvedValue([]);

      await service.reconcile();

      expect(anprService.upsertMonitor).not.toHaveBeenCalled();
    });

    it('deve remover monitores órfãos', async () => {
      camerasRepo.find.mockResolvedValue([]);
      anprService.listMonitors.mockResolvedValue(['orphan-1']);

      await service.reconcile();

      expect(anprService.deleteMonitor).toHaveBeenCalledWith('orphan-1');
    });

    it('não deve sincronizar quando stopped', async () => {
      await service.onModuleDestroy();
      camerasRepo.find.mockResolvedValue([]);

      await service.reconcile();

      expect(anprService.listMonitors).not.toHaveBeenCalled();
    });
  });

  describe('fresh', () => {
    it('deve retornar true para estado confirmed com timestamps válidos', () => {
      const now = Date.now();
      const state: CurrentObservation = {
        cameraId: 'cam-1',
        status: 'confirmed',
        observationId: 'obs-1',
        placa: 'ABC1D23',
        confianca: 0.95,
        capturedAt: new Date(now - 100).toISOString(),
        lastSeenAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 5000).toISOString(),
        consecutiveReads: 2,
        box: [1, 2, 30, 40],
      };

      expect(service.fresh(state)).toBe(true);
    });

    it('deve retornar false para estado não confirmed', () => {
      const now = Date.now();
      const state: CurrentObservation = {
        cameraId: 'cam-1',
        status: 'candidate',
        observationId: 'obs-1',
        placa: 'ABC1D23',
        confianca: 0.95,
        capturedAt: new Date(now - 100).toISOString(),
        lastSeenAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 5000).toISOString(),
        consecutiveReads: 2,
        box: null,
      };

      expect(service.fresh(state)).toBe(false);
    });

    it('deve retornar false para observation expirada', () => {
      const now = Date.now();
      const state: CurrentObservation = {
        cameraId: 'cam-1',
        status: 'confirmed',
        observationId: 'obs-1',
        placa: 'ABC1D23',
        confianca: 0.95,
        capturedAt: new Date(now - 10000).toISOString(),
        lastSeenAt: new Date(now - 5000).toISOString(),
        expiresAt: new Date(now - 1000).toISOString(),
        consecutiveReads: 2,
        box: null,
      };

      expect(service.fresh(state)).toBe(false);
    });

    it('deve retornar false sem observationId', () => {
      const now = Date.now();
      const state: CurrentObservation = {
        cameraId: 'cam-1',
        status: 'confirmed',
        observationId: null,
        placa: 'ABC1D23',
        confianca: 0.95,
        capturedAt: new Date(now - 100).toISOString(),
        lastSeenAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 5000).toISOString(),
        consecutiveReads: 2,
        box: null,
      };

      expect(service.fresh(state)).toBe(false);
    });

    it('deve retornar false sem placa', () => {
      const now = Date.now();
      const state: CurrentObservation = {
        cameraId: 'cam-1',
        status: 'confirmed',
        observationId: 'obs-1',
        placa: null,
        confianca: 0.95,
        capturedAt: new Date(now - 100).toISOString(),
        lastSeenAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 5000).toISOString(),
        consecutiveReads: 2,
        box: null,
      };

      expect(service.fresh(state)).toBe(false);
    });
  });

  describe('cameraInScope', () => {
    it('deve retornar câmera quando contexto é válido', async () => {
      const camera = { id: 'cam-1', pointId: 'point-1', adminUnityId: 'unit-1', companyId: 'company-1' } as Camera;
      camerasRepo.findOneBy.mockResolvedValue(camera);
      pointsRepo.findOneBy.mockResolvedValue({ id: 'point-1', companyId: 'company-1', active: true, adminUnityId: 'unit-1' });
      unitsRepo.findOneBy.mockResolvedValue({ id: 'unit-1', companyId: 'company-1', active: true });

      const result = await service.cameraInScope('cam-1', companyActor);

      expect(result).toEqual(camera);
    });

    it('deve lançar 404 quando câmera não existe', async () => {
      camerasRepo.findOneBy.mockResolvedValue(null);

      await expect(service.cameraInScope('cam-1', companyActor)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar 400 quando ponto é inválido', async () => {
      camerasRepo.findOneBy.mockResolvedValue({
        id: 'cam-1', pointId: 'point-1', adminUnityId: 'unit-1', companyId: 'company-1',
      });
      pointsRepo.findOneBy.mockResolvedValue(null);
      unitsRepo.findOneBy.mockResolvedValue({ id: 'unit-1', companyId: 'company-1', active: true });

      await expect(service.cameraInScope('cam-1', companyActor)).rejects.toThrow(BadRequestException);
    });

    it('deve lançar 400 quando unidade é inativa', async () => {
      camerasRepo.findOneBy.mockResolvedValue({
        id: 'cam-1', pointId: 'point-1', adminUnityId: 'unit-1', companyId: 'company-1',
      });
      pointsRepo.findOneBy.mockResolvedValue({ id: 'point-1', companyId: 'company-1', active: true, adminUnityId: 'unit-1' });
      unitsRepo.findOneBy.mockResolvedValue(null);

      await expect(service.cameraInScope('cam-1', companyActor)).rejects.toThrow(BadRequestException);
    });
  });

  describe('current', () => {
    const now = Date.now();
    const confirmedState: CurrentObservation = {
      cameraId: 'cam-1',
      status: 'confirmed',
      observationId: 'obs-1',
      placa: 'ABC1D23',
      confianca: 0.95,
      capturedAt: new Date(now - 100).toISOString(),
      lastSeenAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 5000).toISOString(),
      consecutiveReads: 2,
      box: [1, 2, 30, 40],
    };

    beforeEach(() => {
      const camera = { id: 'cam-1', pointId: 'point-1', adminUnityId: 'unit-1', companyId: 'company-1' } as Camera;
      camerasRepo.findOneBy.mockResolvedValue(camera);
      pointsRepo.findOneBy.mockResolvedValue({ id: 'point-1', companyId: 'company-1', active: true, adminUnityId: 'unit-1' });
      unitsRepo.findOneBy.mockResolvedValue({ id: 'unit-1', companyId: 'company-1', active: true });
    });

    it('deve retornar estado não confirmed sem persistir', async () => {
      const waitingState: CurrentObservation = {
        ...confirmedState,
        status: 'waiting',
        observationId: null,
        placa: null,
        confianca: null,
        capturedAt: null,
        lastSeenAt: null,
        expiresAt: null,
        consecutiveReads: 0,
      };
      anprService.currentObservation.mockResolvedValue(waitingState);

      const result = await service.current('cam-1', companyActor);

      expect(result.status).toBe('waiting');
      expect(observationsRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('deve persistir observação na primeira consulta confirmed', async () => {
      anprService.currentObservation.mockResolvedValue(confirmedState);
      observationsRepo.findOneBy.mockResolvedValue(null);
      const insertExecute = vi.fn().mockResolvedValue(undefined);
      const insertMock = {
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        orIgnore: vi.fn().mockReturnThis(),
        execute: insertExecute,
      };
      observationsRepo.findOneByOrFail.mockResolvedValue({
        id: 'obs-1', cameraId: 'cam-1', pointId: 'point-1', companyId: 'company-1',
        plate: 'ABC1D23', confidence: 0.95,
      });
      const updateExecute = vi.fn().mockResolvedValue(undefined);
      const updateMock = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: updateExecute,
      };
      let callCount = 0;
      observationsRepo.createQueryBuilder.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? insertMock : updateMock;
      });

      await service.current('cam-1', companyActor);

      expect(insertExecute).toHaveBeenCalled();
      expect(updateExecute).toHaveBeenCalled();
    });

    it('não deve criar observação duas vezes para a mesma observação', async () => {
      anprService.currentObservation.mockResolvedValue(confirmedState);
      observationsRepo.findOneBy.mockResolvedValue({ id: 'obs-1', cameraId: 'cam-1', companyId: 'company-1', plate: 'ABC1D23', pointId: 'point-1' });
      const updateMock = { update: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), execute: vi.fn().mockResolvedValue(undefined) };
      observationsRepo.createQueryBuilder.mockReturnValue(updateMock);

      await service.current('cam-1', companyActor);

      expect(observationsRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    });

    it('deve marcar como stale quando observação expirou', async () => {
      const staleState: CurrentObservation = {
        ...confirmedState,
        expiresAt: new Date(now - 1000).toISOString(),
      };
      anprService.currentObservation.mockResolvedValue(staleState);

      const result = await service.current('cam-1', companyActor);

      expect(result.status).toBe('stale');
      expect(result.placa).toBeNull();
    });
  });

  describe('assertCurrent', () => {
    it('deve passar quando observação está fresh e corresponde', async () => {
      const camera = { id: 'cam-1', pointId: 'point-1', adminUnityId: 'unit-1', companyId: 'company-1' } as Camera;
      camerasRepo.findOneBy.mockResolvedValue(camera);
      pointsRepo.findOneBy.mockResolvedValue({ id: 'point-1', companyId: 'company-1', active: true, adminUnityId: 'unit-1' });
      unitsRepo.findOneBy.mockResolvedValue({ id: 'unit-1', companyId: 'company-1', active: true });

      const now = Date.now();
      anprService.currentObservation.mockResolvedValue({
        cameraId: 'cam-1', status: 'confirmed', observationId: 'obs-1', placa: 'ABC1D23',
        confianca: 0.95, capturedAt: new Date(now - 100).toISOString(), lastSeenAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 5000).toISOString(), consecutiveReads: 2, box: null,
      });

      const observation = { id: 'obs-1', cameraId: 'cam-1', plate: 'ABC1D23', pointId: 'point-1' } as CameraObservation;

      await expect(service.assertCurrent(observation, companyActor)).resolves.toBeUndefined();
    });

    it('deve lançar 409 quando observação expirou', async () => {
      const camera = { id: 'cam-1', pointId: 'point-1', adminUnityId: 'unit-1', companyId: 'company-1' } as Camera;
      camerasRepo.findOneBy.mockResolvedValue(camera);
      pointsRepo.findOneBy.mockResolvedValue({ id: 'point-1', companyId: 'company-1', active: true, adminUnityId: 'unit-1' });
      unitsRepo.findOneBy.mockResolvedValue({ id: 'unit-1', companyId: 'company-1', active: true });

      anprService.currentObservation.mockResolvedValue({
        cameraId: 'cam-1', status: 'stale', observationId: null, placa: null,
        confianca: null, capturedAt: null, lastSeenAt: null, expiresAt: null,
        consecutiveReads: 0, box: null,
      });

      const observation = { id: 'obs-1', cameraId: 'cam-1', plate: 'ABC1D23', pointId: 'point-1' } as CameraObservation;

      await expect(service.assertCurrent(observation, companyActor)).rejects.toThrow(ConflictException);
    });

    it('deve lançar 409 quando observationId não corresponde', async () => {
      const camera = { id: 'cam-1', pointId: 'point-1', adminUnityId: 'unit-1', companyId: 'company-1' } as Camera;
      camerasRepo.findOneBy.mockResolvedValue(camera);
      pointsRepo.findOneBy.mockResolvedValue({ id: 'point-1', companyId: 'company-1', active: true, adminUnityId: 'unit-1' });
      unitsRepo.findOneBy.mockResolvedValue({ id: 'unit-1', companyId: 'company-1', active: true });

      const now = Date.now();
      anprService.currentObservation.mockResolvedValue({
        cameraId: 'cam-1', status: 'confirmed', observationId: 'other-obs', placa: 'ABC1D23',
        confianca: 0.95, capturedAt: new Date(now - 100).toISOString(), lastSeenAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 5000).toISOString(), consecutiveReads: 2, box: null,
      });

      const observation = { id: 'obs-1', cameraId: 'cam-1', plate: 'ABC1D23', pointId: 'point-1' } as CameraObservation;

      await expect(service.assertCurrent(observation, companyActor)).rejects.toThrow(ConflictException);
    });
  });



  describe('onModuleDestroy', () => {
    it('deve marcar como stopped e ignorar reconcile', async () => {
      await service.onModuleDestroy();

      camerasRepo.find.mockResolvedValue([]);
      await service.reconcile();

      expect(camerasRepo.find).not.toHaveBeenCalled();
    });
  });
});
