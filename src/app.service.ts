import { Injectable } from '@nestjs/common';
import { AnprService } from './anpr/anpr.service.js';
import { MonitoringService } from './monitoring/monitoring.service.js';
import { AutoRegistrationService } from './auto-registration/auto-registration.service.js';

@Injectable()
export class AppService {
  constructor(
    private readonly anpr: AnprService,
    private readonly monitoring: MonitoringService,
    private readonly registration: AutoRegistrationService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getStats() {
    const [monitors, confirmedObservations, performance] = await Promise.allSettled([
      this.anpr.listMonitors(),
      this.monitoring.getConfirmedObservationsReport(),
      this.anpr.performanceStats(),
    ]);

    const activeMonitors = monitors.status === 'fulfilled' ? monitors.value : [];
    const observationReport = confirmedObservations.status === 'fulfilled' ? confirmedObservations.value : null;
    const observations = observationReport?.observations ?? [];

    return {
      timestamp: new Date().toISOString(),
      anpr: {
        availability: {
          monitors: monitors.status === 'fulfilled',
          observations: observationReport !== null && observationReport.unavailableCameras === 0,
          checkedCameras: observationReport?.checkedCameras ?? null,
          unavailableCameras: observationReport?.unavailableCameras ?? null,
        },
        performance: performance.status === 'fulfilled'
          ? { status: 'available', source: 'python_anpr', data: performance.value }
          : { status: 'unavailable', source: 'python_anpr', data: null },
        activeMonitors: activeMonitors.length,
        monitorIds: activeMonitors,
        confirmedObservations: observations.map(({ camera, observation }) => ({
          cameraId: camera.id,
          cameraName: camera.name,
          plate: observation.placa,
          confidence: observation.confianca,
          status: observation.status,
          observationId: observation.observationId,
          capturedAt: observation.capturedAt,
          lastSeenAt: observation.lastSeenAt,
        })),
      },
      registration: this.registration.getStats(),
    };
  }
}
