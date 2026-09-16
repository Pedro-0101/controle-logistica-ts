import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import { AutoRegistrationService } from './auto-registration.service.js';
import { MonitoringService } from '../monitoring/monitoring.service.js';
import { AnprService } from '../anpr/anpr.service.js';
import { ExternalInteractionService } from '../anpr/external-interaction.service.js';
import { PlateRecognitionProviderFactory } from '../anpr/providers/plate-recognition.factory.js';
import { ExternalProviderError } from '../anpr/providers/plate-recognition.types.js';
import { VehicleService } from '../vehicle/vehicle.service.js';
import { MovementService } from '../movement/movement.service.js';
import { CompanyConfigService } from '../company-config/company-config.service.js';
import { PointService } from '../point/point.service.js';
import { CameraObservation } from '../monitoring/observation.entity.js';
import type { Camera } from '../camera/entities/camera.entity.js';
import type { CurrentObservation } from '../monitoring/observation.schema.js';

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const camera = {
  id: 'camera-1',
  companyId: 'company-1',
  pointId: 'point-1',
  name: 'Câmera 1',
} as unknown as Camera;

const state: CurrentObservation = {
  cameraId: 'camera-1',
  status: 'confirmed',
  observationId: 'obs-1',
  placa: 'ABC1D23',
  confianca: 0.8,
  capturedAt: '2026-01-01T00:00:00.000Z',
  lastSeenAt: '2026-01-01T00:00:01.000Z',
  expiresAt: '2026-01-01T00:00:10.000Z',
  consecutiveReads: 2,
  box: null,
};

const baseCompanyConfig = () => ({
  anprAutoRegister: true,
  anprSaveUnrecognizedPhotos: false,
  anprAutoRegisterCooldownSeconds: 0,
  anprConfidenceThreshold: 0.85,
  anprMatchTimeoutSeconds: 5,
  anprConfirmationReads: 2,
  anprStaleAfterSeconds: 5,
  anprRecognitionMode: 'local',
  anprExternalProvider: 'google_vision',
  anprExternalMinConfidence: 0.7,
  anprExternalTimeoutMs: 8000,
  anprExternalFallbackToLocal: true,
});

describe('AutoRegistrationService', () => {
  let service: AutoRegistrationService;
  let monitoring: { getConfirmedObservations: ReturnType<typeof vi.fn>; ensureObservationPersisted: ReturnType<typeof vi.fn> };
  let anpr: { observationImage: ReturnType<typeof vi.fn> };
  let providers: { get: ReturnType<typeof vi.fn> };
  let interactions: { record: ReturnType<typeof vi.fn>; attachMovement: ReturnType<typeof vi.fn> };
  let vehicleService: { findByPlate: ReturnType<typeof vi.fn> };
  let movementService: {
    findExistingByObservation: ReturnType<typeof vi.fn>;
    hasRecentMovement: ReturnType<typeof vi.fn>;
    createAutoRegistered: ReturnType<typeof vi.fn>;
  };
  let companyConfigService: { findOne: ReturnType<typeof vi.fn>; createWithDefaults: ReturnType<typeof vi.fn> };
  let pointService: { findOne: ReturnType<typeof vi.fn> };
  let observations: { save: ReturnType<typeof vi.fn>; manager: { connection: { query: ReturnType<typeof vi.fn> } } };
  let configMock: { get: ReturnType<typeof vi.fn> };
  let companyConfig: ReturnType<typeof baseCompanyConfig>;
  let point: Record<string, unknown>;
  let observation: Record<string, unknown>;
  let provider: { name: string; recognize: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    companyConfig = baseCompanyConfig();
    point = { inheritCompanyConfig: true };
    observation = {
      id: 'obs-1',
      cameraId: 'camera-1',
      pointId: 'point-1',
      companyId: 'company-1',
      plate: 'ABC1D23',
      externalPlate: null,
      externalConfidence: null,
      externalProvider: null,
      externalCheckedAt: null,
    };
    provider = { name: 'google_vision', recognize: vi.fn() };

    monitoring = {
      getConfirmedObservations: vi.fn(async () => [{ camera, observation: state }]),
      ensureObservationPersisted: vi.fn(async () => observation),
    };
    anpr = { observationImage: vi.fn(async () => Buffer.from('image')) };
    providers = { get: vi.fn(() => provider) };
    interactions = {
      record: vi.fn(async () => 'interaction-1'),
      attachMovement: vi.fn(async () => undefined),
    };
    vehicleService = { findByPlate: vi.fn(async () => ({ id: 'veh-1', active: true })) };
    movementService = {
      findExistingByObservation: vi.fn(async () => null),
      hasRecentMovement: vi.fn(async () => false),
      createAutoRegistered: vi.fn(async () => ({ id: 'mov-1' })),
    };
    companyConfigService = {
      findOne: vi.fn(async () => companyConfig),
      createWithDefaults: vi.fn(async () => companyConfig),
    };
    pointService = { findOne: vi.fn(async () => point) };
    observations = {
      save: vi.fn(async (value: Record<string, unknown>) => value),
      manager: { connection: { query: vi.fn(async () => [{ id: 'system-user-1' }]) } },
    };
    configMock = { get: vi.fn(() => undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutoRegistrationService,
        { provide: MonitoringService, useValue: monitoring },
        { provide: AnprService, useValue: anpr },
        { provide: PlateRecognitionProviderFactory, useValue: providers },
        { provide: ExternalInteractionService, useValue: interactions },
        { provide: VehicleService, useValue: vehicleService },
        { provide: MovementService, useValue: movementService },
        { provide: CompanyConfigService, useValue: companyConfigService },
        { provide: PointService, useValue: pointService },
        { provide: getRepositoryToken(CameraObservation), useValue: observations },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<AutoRegistrationService>(AutoRegistrationService);
  });

  it('modo local usa apenas a placa local e não chama a API externa', async () => {
    await service.reconcile();

    expect(providers.get).not.toHaveBeenCalled();
    expect(interactions.record).not.toHaveBeenCalled();
    expect(movementService.createAutoRegistered).toHaveBeenCalledWith(
      expect.objectContaining({
        recognizedPlate: 'ABC1D23',
        recognitionProvider: 'local',
        recognitionConfidence: 0.8,
      }),
    );
  });

  it('modo verified usa a placa externa quando aceita', async () => {
    companyConfig.anprRecognitionMode = 'verified';
    provider.recognize.mockResolvedValue({
      plate: 'XYZ9Z99',
      confidence: 0.95,
      raw: 'XYZ9Z99',
      provider: 'google_vision',
      billableUnits: 1,
      httpStatus: 200,
    });

    await service.reconcile();

    expect(anpr.observationImage).toHaveBeenCalledWith('camera-1', 'obs-1');
    expect(interactions.record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'success', finalSource: 'external', externalPlate: 'XYZ9Z99' }),
    );
    expect(observations.save).toHaveBeenCalledWith(
      expect.objectContaining({ externalPlate: 'XYZ9Z99', externalProvider: 'google_vision' }),
    );
    expect(movementService.createAutoRegistered).toHaveBeenCalledWith(
      expect.objectContaining({
        recognizedPlate: 'XYZ9Z99',
        recognitionProvider: 'google_vision',
        recognitionConfidence: 0.95,
      }),
    );
    expect(interactions.attachMovement).toHaveBeenCalledWith(
      'interaction-1', 'mov-1', 'XYZ9Z99', 'external',
    );
  });

  it('modo verified cai para a placa local quando a API não encontra placa', async () => {
    companyConfig.anprRecognitionMode = 'verified';
    provider.recognize.mockResolvedValue(null);

    await service.reconcile();

    expect(interactions.record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'no_plate', finalSource: 'local_fallback' }),
    );
    expect(movementService.createAutoRegistered).toHaveBeenCalledWith(
      expect.objectContaining({ recognizedPlate: 'ABC1D23', recognitionProvider: 'local' }),
    );
  });

  it('modo verified cai para a placa local quando a API retorna baixa confiança', async () => {
    companyConfig.anprRecognitionMode = 'verified';
    provider.recognize.mockResolvedValue({
      plate: 'XYZ9Z99',
      confidence: 0.5,
      raw: 'XYZ9Z99',
      provider: 'google_vision',
    });

    await service.reconcile();

    expect(interactions.record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'low_confidence', finalSource: 'local_fallback' }),
    );
    expect(movementService.createAutoRegistered).toHaveBeenCalledWith(
      expect.objectContaining({ recognizedPlate: 'ABC1D23' }),
    );
  });

  it('modo external sem fallback não cria movimento quando a API falha', async () => {
    companyConfig.anprRecognitionMode = 'external';
    companyConfig.anprExternalFallbackToLocal = false;
    provider.recognize.mockRejectedValue(new ExternalProviderError('timeout', 'timeout'));

    await service.reconcile();

    expect(interactions.record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'timeout', finalSource: 'none' }),
    );
    expect(movementService.createAutoRegistered).not.toHaveBeenCalled();
  });

  it('modo external sem fallback não cria movimento quando não há placa', async () => {
    companyConfig.anprRecognitionMode = 'external';
    companyConfig.anprExternalFallbackToLocal = false;
    provider.recognize.mockResolvedValue(null);

    await service.reconcile();

    expect(movementService.createAutoRegistered).not.toHaveBeenCalled();
  });

  it('reutiliza o resultado externo persistido sem rechamar a API', async () => {
    companyConfig.anprRecognitionMode = 'verified';
    observation.externalCheckedAt = new Date();
    observation.externalPlate = 'XYZ9Z99';
    observation.externalConfidence = 0.9;
    observation.externalProvider = 'google_vision';

    await service.reconcile();

    expect(providers.get).not.toHaveBeenCalled();
    expect(anpr.observationImage).not.toHaveBeenCalled();
    expect(movementService.createAutoRegistered).toHaveBeenCalledWith(
      expect.objectContaining({ recognizedPlate: 'XYZ9Z99', recognitionProvider: 'google_vision' }),
    );
  });

  it('reutiliza o resultado persistido negativo e cai para local', async () => {
    companyConfig.anprRecognitionMode = 'verified';
    observation.externalCheckedAt = new Date();
    observation.externalPlate = null;

    await service.reconcile();

    expect(providers.get).not.toHaveBeenCalled();
    expect(movementService.createAutoRegistered).toHaveBeenCalledWith(
      expect.objectContaining({ recognizedPlate: 'ABC1D23', recognitionProvider: 'local' }),
    );
  });

  it('cai para local quando não consegue buscar a imagem de evidência', async () => {
    companyConfig.anprRecognitionMode = 'verified';
    anpr.observationImage.mockRejectedValue(new Error('sem imagem'));

    await service.reconcile();

    expect(provider.recognize).not.toHaveBeenCalled();
    expect(movementService.createAutoRegistered).toHaveBeenCalledWith(
      expect.objectContaining({ recognizedPlate: 'ABC1D23' }),
    );
  });

  it('cai para local quando o provider configurado é desconhecido', async () => {
    companyConfig.anprRecognitionMode = 'verified';
    providers.get.mockReturnValue(null);

    await service.reconcile();

    expect(provider.recognize).not.toHaveBeenCalled();
    expect(movementService.createAutoRegistered).toHaveBeenCalledWith(
      expect.objectContaining({ recognizedPlate: 'ABC1D23' }),
    );
  });

  it('não cria movimento quando já existe para a observação', async () => {
    movementService.findExistingByObservation.mockResolvedValue({ id: 'mov-existente' });

    await service.reconcile();

    expect(movementService.createAutoRegistered).not.toHaveBeenCalled();
  });

  it('não cria movimento quando o auto-registro está desabilitado', async () => {
    companyConfig.anprAutoRegister = false;

    await service.reconcile();

    expect(movementService.createAutoRegistered).not.toHaveBeenCalled();
  });

  it('respeita o cooldown do veículo no ponto', async () => {
    companyConfig.anprAutoRegisterCooldownSeconds = 30;
    movementService.hasRecentMovement.mockResolvedValue(true);

    await service.reconcile();

    expect(movementService.createAutoRegistered).not.toHaveBeenCalled();
  });

  it('refaz o cooldown com a placa final quando a externa corrige a local', async () => {
    companyConfig.anprRecognitionMode = 'verified';
    companyConfig.anprAutoRegisterCooldownSeconds = 30;
    provider.recognize.mockResolvedValue({
      plate: 'XYZ9Z99',
      confidence: 0.95,
      raw: 'XYZ9Z99',
      provider: 'google_vision',
    });
    movementService.hasRecentMovement
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await service.reconcile();

    expect(movementService.createAutoRegistered).not.toHaveBeenCalled();
  });

  it('salva foto de evidência usando a imagem já baixada', async () => {
    companyConfig.anprRecognitionMode = 'verified';
    companyConfig.anprSaveUnrecognizedPhotos = true;
    vehicleService.findByPlate.mockResolvedValue(null);
    provider.recognize.mockResolvedValue({
      plate: 'XYZ9Z99',
      confidence: 0.95,
      raw: 'XYZ9Z99',
      provider: 'google_vision',
    });

    await service.reconcile();

    expect(anpr.observationImage).toHaveBeenCalledTimes(1);
    expect(observations.save).toHaveBeenCalled();
  });

  it('não quebra quando o salvamento da foto de evidência falha', async () => {
    companyConfig.anprSaveUnrecognizedPhotos = true;
    vehicleService.findByPlate.mockResolvedValue(null);
    (fs.writeFileSync as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('disco cheio');
    });

    await expect(service.reconcile()).resolves.toBeUndefined();
    expect(movementService.createAutoRegistered).toHaveBeenCalled();
  });

  it('usa usuário de fallback quando não há admin na empresa', async () => {
    observations.manager.connection.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'fallback-user' }]);

    await service.reconcile();

    expect(movementService.createAutoRegistered).toHaveBeenCalledWith(
      expect.objectContaining({ systemUserId: 'fallback-user' }),
    );
  });

  it('usa usuário sentinela quando não há nenhum usuário', async () => {
    observations.manager.connection.query.mockResolvedValue([]);

    await service.reconcile();

    expect(movementService.createAutoRegistered).toHaveBeenCalledWith(
      expect.objectContaining({ systemUserId: '00000000-0000-0000-0000-000000000000' }),
    );
  });

  it('não propaga erro ao buscar observações (reconcile)', async () => {
    monitoring.getConfirmedObservations.mockRejectedValueOnce(new Error('anpr offline'));

    await expect(service.reconcile()).resolves.toBeUndefined();
    expect(movementService.createAutoRegistered).not.toHaveBeenCalled();
  });

  it('isola erro de uma observação e continua', async () => {
    pointService.findOne.mockRejectedValueOnce(new Error('ponto inválido'));

    await expect(service.reconcile()).resolves.toBeUndefined();
    expect(movementService.createAutoRegistered).not.toHaveBeenCalled();
  });

  it('não faz reconciliação quando o monitoramento está desabilitado', () => {
    configMock.get.mockReturnValue('false');

    service.onApplicationBootstrap();

    expect(monitoring.getConfirmedObservations).not.toHaveBeenCalled();
  });
});
