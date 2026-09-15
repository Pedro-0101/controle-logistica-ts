import { Injectable, Logger } from '@nestjs/common';
import { AnprService } from './anpr/anpr.service.js';
import { MonitoringService } from './monitoring/monitoring.service.js';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly anpr: AnprService,
    private readonly monitoring: MonitoringService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getStats() {
    const [monitors, confirmedObservations] = await Promise.allSettled([
      this.anpr.listMonitors(),
      this.monitoring.getConfirmedObservations(),
    ]);

    const activeMonitors = monitors.status === 'fulfilled' ? monitors.value : [];
    const observations = confirmedObservations.status === 'fulfilled' ? confirmedObservations.value : [];

    return {
      timestamp: new Date().toISOString(),
      anpr: {
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
    };
  }
}
