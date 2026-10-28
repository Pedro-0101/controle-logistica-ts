import { AppService } from './app.service.js';
import { AnprService } from './anpr/anpr.service.js';
import { MonitoringService } from './monitoring/monitoring.service.js';
import { AutoRegistrationService } from './auto-registration/auto-registration.service.js';

describe('AppService performance stats', () => {
  const anpr = { listMonitors: vi.fn(), performanceStats: vi.fn() };
  const monitoring = { getConfirmedObservationsReport: vi.fn() };
  const registration = { getStats: vi.fn(() => ({ queue: { active: 1 }, durationUnit: 'ms' })) };
  const service = new AppService(anpr as unknown as AnprService, monitoring as unknown as MonitoringService, registration as unknown as AutoRegistrationService);

  beforeEach(() => {
    vi.clearAllMocks();
    anpr.listMonitors.mockResolvedValue(['camera-1']);
    anpr.performanceStats.mockResolvedValue({ count: 2, inference: { no_plate: 3 } });
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
});
