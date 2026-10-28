import { AppService } from './app.service.js';
import { AnprService } from './anpr/anpr.service.js';
import { MonitoringService } from './monitoring/monitoring.service.js';
import { AutoRegistrationService } from './auto-registration/auto-registration.service.js';

describe('AppService performance stats', () => {
  const anpr = { listMonitors: vi.fn(), performanceStats: vi.fn() };
  const monitoring = { listCameras: vi.fn(), getConfirmedObservationsReport: vi.fn() };
  const registration = { getStats: vi.fn(() => ({ queue: { active: 1 }, durationUnit: 'ms' })) };
  const service = new AppService(anpr as unknown as AnprService, monitoring as unknown as MonitoringService, registration as unknown as AutoRegistrationService);

  beforeEach(() => {
    vi.clearAllMocks();
    anpr.listMonitors.mockResolvedValue(['camera-1']);
    anpr.performanceStats.mockResolvedValue({ count: 2, inference: { no_plate: 3 } });
    monitoring.listCameras.mockResolvedValue([]);
    monitoring.getConfirmedObservationsReport.mockResolvedValue({ observations: [], checkedCameras: 1, unavailableCameras: 0 });
  });

  it('preserves existing fields and exposes Python and registration metrics', async () => {
    const stats = await service.getStats();
    expect(stats.anpr).toMatchObject({
      activeMonitors: 1, monitorIds: ['camera-1'], confirmedObservations: [],
      availability: { monitors: true, observations: true },
      performance: { status: 'available', source: 'python_anpr', data: { count: 2, inference: { no_plate: 3 } } },
    });
    expect(stats.registration).toEqual({ queue: { active: 1 }, durationUnit: 'ms' });
  });

  it('marks metrics unavailable instead of reporting false zero performance', async () => {
    anpr.performanceStats.mockRejectedValue(new Error('offline'));
    anpr.listMonitors.mockRejectedValue(new Error('offline'));
    monitoring.getConfirmedObservationsReport.mockResolvedValue({ observations: [], checkedCameras: 3, unavailableCameras: 3 });
    const stats = await service.getStats();
    expect(stats.anpr.performance).toEqual({ status: 'unavailable', source: 'python_anpr', data: null });
    expect(stats.anpr.availability).toEqual({ monitors: false, observations: false, checkedCameras: 3, unavailableCameras: 3 });
  });

  it('distinguishes partial observations and unavailable observation queries', async () => {
    monitoring.getConfirmedObservationsReport.mockResolvedValueOnce({ observations: [], checkedCameras: 3, unavailableCameras: 1 });
    expect((await service.getStats()).anpr.availability).toMatchObject({ observations: false, unavailableCameras: 1 });
    monitoring.getConfirmedObservationsReport.mockRejectedValueOnce(new Error('database unavailable'));
    expect((await service.getStats()).anpr.availability).toMatchObject({ observations: false, checkedCameras: null, unavailableCameras: null });
  });

  it('applies company and date filters to cameras, monitors, observations and per-camera metrics', async () => {
    const camera = { id: 'camera-1', companyId: 'company-1', name: 'Portaria 1' };
    monitoring.listCameras.mockResolvedValue([camera]);
    monitoring.getConfirmedObservationsReport.mockResolvedValue({
      observations: [{
        camera,
        observation: {
          placa: 'ABC1D23', confianca: 0.95, status: 'confirmed', observationId: 'obs-1',
          capturedAt: '2026-08-01T10:00:00.000Z', lastSeenAt: '2026-08-01T10:00:01.000Z',
        },
      }],
      checkedCameras: 1,
      unavailableCameras: 0,
    });
    anpr.listMonitors.mockResolvedValue(['camera-1', 'camera-2']);
    anpr.performanceStats.mockResolvedValue({
      cameras: { 'camera-1': { counters: { snapshots: 2 } }, 'camera-2': { counters: { snapshots: 9 } } },
      counters: { snapshots: 11 },
    });

    const stats = await service.getStats({
      companyId: 'company-1',
      dateFrom: '2026-08-01T00:00:00.000Z',
      dateTo: '2026-08-31T23:59:59.999Z',
    });

    expect(monitoring.listCameras).toHaveBeenCalledWith('company-1');
    expect(monitoring.getConfirmedObservationsReport).toHaveBeenCalledWith({
      cameras: [camera],
      dateFrom: new Date('2026-08-01T00:00:00.000Z'),
      dateTo: new Date('2026-08-31T23:59:59.999Z'),
    });
    expect(stats.anpr.monitorIds).toEqual(['camera-1']);
    expect(stats.anpr.performance.data).toMatchObject({
      cameras: { 'camera-1': { counters: { snapshots: 2 } } },
      counters: { snapshots: 11 },
    });
    expect(stats.anpr.confirmedObservations[0]).toMatchObject({
      cameraId: 'camera-1', companyId: 'company-1', plate: 'ABC1D23',
    });
    expect(stats.scope).toMatchObject({ companyId: 'company-1', dateFrom: '2026-08-01T00:00:00.000Z' });
  });
});
