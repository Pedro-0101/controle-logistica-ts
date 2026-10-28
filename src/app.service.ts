import { Injectable } from '@nestjs/common';
import { AnprService } from './anpr/anpr.service.js';
import { MonitoringService } from './monitoring/monitoring.service.js';
import { AutoRegistrationService } from './auto-registration/auto-registration.service.js';
import type { Camera } from './camera/entities/camera.entity.js';
import type { StatsQueryDtoType } from './stats/dto/stats-query.schema.js';

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

  async getStats(query: StatsQueryDtoType = {}) {
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;

    let cameras: Camera[] | undefined;
    if (query.companyId) {
      try {
        cameras = await this.monitoring.listCameras(query.companyId);
      } catch {
        cameras = [];
      }
    }
    const cameraIds = query.companyId
      ? new Set((cameras ?? []).map((camera) => camera.id))
      : undefined;

    const [monitors, confirmedObservations, performance] = await Promise.allSettled([
      this.anpr.listMonitors(),
      this.monitoring.getConfirmedObservationsReport({ cameras, dateFrom, dateTo }),
      this.anpr.performanceStats(),
    ]);

    const allMonitors = monitors.status === 'fulfilled' ? monitors.value : [];
    const activeMonitors = cameraIds
      ? allMonitors.filter((cameraId) => cameraIds.has(cameraId))
      : allMonitors;
    const observationReport =
      confirmedObservations.status === 'fulfilled' ? confirmedObservations.value : null;
    const observations = observationReport?.observations ?? [];
    const performanceData = performance.status === 'fulfilled' ? performance.value : null;

    return {
      timestamp: new Date().toISOString(),
      scope: {
        companyId: query.companyId ?? null,
        dateFrom: query.dateFrom ?? null,
        dateTo: query.dateTo ?? null,
        filtered: [
          ...(query.companyId
            ? ['activeMonitors', 'monitorIds', 'performance.cameras', 'confirmedObservations']
            : []),
          ...(query.dateFrom || query.dateTo ? ['confirmedObservations'] : []),
        ].filter((value, index, values) => values.indexOf(value) === index),
        global: [
          'performance.counters',
          'performance.durations',
          'performance.queue',
          'registration',
        ],
      },
      anpr: {
        availability: {
          monitors: monitors.status === 'fulfilled',
          observations: observationReport !== null && observationReport.unavailableCameras === 0,
          checkedCameras: observationReport?.checkedCameras ?? null,
          unavailableCameras: observationReport?.unavailableCameras ?? null,
        },
        performance: performanceData
          ? {
              status: 'available',
              source: 'python_anpr',
              data: this.filterPerformanceCameras(performanceData, cameraIds),
            }
          : { status: 'unavailable', source: 'python_anpr', data: null },
        activeMonitors: activeMonitors.length,
        monitorIds: activeMonitors,
        confirmedObservations: observations.map(({ camera, observation }) => ({
          cameraId: camera.id,
          cameraName: camera.name,
          companyId: camera.companyId,
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

  private filterPerformanceCameras(
    data: Record<string, unknown>,
    cameraIds?: Set<string>,
  ): Record<string, unknown> {
    if (!cameraIds) return data;

    const cameras = data['cameras'];
    if (!cameras || typeof cameras !== 'object' || Array.isArray(cameras)) {
      return { ...data, cameras: {} };
    }

    const filtered = Object.fromEntries(
      Object.entries(cameras as Record<string, unknown>).filter(([id]) => cameraIds.has(id)),
    );
    return { ...data, cameras: filtered };
  }
}
