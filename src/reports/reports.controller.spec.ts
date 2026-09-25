import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';

const user: AuthenticatedUser = {
  userId: 'user-1',
  email: 'joao@empresa.com',
  role: 'admin',
  companyId: 'company-1',
};

describe('ReportsController', () => {
  let controller: ReportsController;
  const service = {
    getVehicleTimeline: vi.fn(),
    getMovementBook: vi.fn(),
    getFleetStatus: vi.fn(),
    getDwellReport: vi.fn(),
    getTransitReport: vi.fn(),
    getUtilizationReport: vi.fn(),
    getExceptions: vi.fn(),
    toCsv: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: service }],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('vehicleTimeline delega ao service', () => {
    const filters = { dateFrom: '2026-09-01T00:00:00.000Z' };
    service.getVehicleTimeline.mockReturnValue({ vehicles: [] });

    expect(controller.vehicleTimeline(filters as never, user)).toEqual({ vehicles: [] });
    expect(service.getVehicleTimeline).toHaveBeenCalledWith(user, filters);
  });

  it('movementBook retorna JSON quando format=json', async () => {
    const filters = { format: 'json' as const };
    service.getMovementBook.mockResolvedValue({ data: [] });

    await expect(controller.movementBook(filters as never, user)).resolves.toEqual({ data: [] });
    expect(service.getMovementBook).toHaveBeenCalledWith(user, filters);
    expect(service.toCsv).not.toHaveBeenCalled();
  });

  it('movementBook retorna CSV quando format=csv', async () => {
    const filters = { format: 'csv' as const };
    service.getMovementBook.mockResolvedValue({ data: [{ movementId: '1' }] });
    service.toCsv.mockReturnValue('dataHora,placa\n2026-09-01,ABC1D23');

    const result = await controller.movementBook(filters as never, user);

    expect(result).toBeInstanceOf(StreamableFile);
    expect(service.toCsv).toHaveBeenCalledWith({ data: [{ movementId: '1' }] });
  });

  it('fleetStatus delega ao service', () => {
    service.getFleetStatus.mockReturnValue({ atUnits: [] });
    expect(controller.fleetStatus(user)).toEqual({ atUnits: [] });
    expect(service.getFleetStatus).toHaveBeenCalledWith(user);
  });

  it('dwell delega ao service', () => {
    service.getDwellReport.mockReturnValue({ byVehicle: [] });
    expect(controller.dwell({} as never, user)).toEqual({ byVehicle: [] });
    expect(service.getDwellReport).toHaveBeenCalledWith(user, {});
  });

  it('transit delega ao service', () => {
    service.getTransitReport.mockReturnValue({ routes: [] });
    expect(controller.transit({} as never, user)).toEqual({ routes: [] });
    expect(service.getTransitReport).toHaveBeenCalledWith(user, {});
  });

  it('utilization delega ao service', () => {
    service.getUtilizationReport.mockReturnValue({ byVehicle: [] });
    expect(controller.utilization({} as never, user)).toEqual({ byVehicle: [] });
    expect(service.getUtilizationReport).toHaveBeenCalledWith(user, {});
  });

  it('exceptions delega ao service', () => {
    service.getExceptions.mockReturnValue({ missingExit: [] });
    expect(controller.exceptions({} as never, user)).toEqual({ missingExit: [] });
    expect(service.getExceptions).toHaveBeenCalledWith(user, {});
  });
});
