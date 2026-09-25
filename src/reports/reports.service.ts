import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Movement } from '../movement/entities/movement.entity.js';
import { CompanyConfig } from '../company-config/entities/company-config.entity.js';
import { requireCompanyId, type Actor } from '../auth/company-scope.js';
import { toJourneyWindow, type JourneyWindow } from './journey-window.js';
import {
  MovementTimeService,
  routeKey,
  type DwellSegment,
  type RouteBaseline,
  type TimeMovement,
  type TimelineRange,
  type TransitSegment,
  type VehicleTimeline,
} from './movement-time.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_MS = 7 * DAY_MS;
const LOOKBACK_MS = 7 * DAY_MS;
const BASELINE_WINDOW_MS = 90 * DAY_MS;
const BASELINE_CACHE_MS = 10 * 60 * 1000;
const OPEN_DWELL_ALERT_MINUTES = 480;
const CONFIDENCE_MIN_SAMPLES = 5;

export interface ReportRangeFilters {
  dateFrom?: string;
  dateTo?: string;
  vehicleId?: string;
  adminUnityId?: string;
  pointId?: string;
}

interface LoadOptions extends ReportRangeFilters {
  lookbackMs?: number;
}

interface Segments {
  dwell: DwellSegment[];
  transit: TransitSegment[];
  timelines: VehicleTimeline[];
}

interface DurationStats {
  visits: number;
  completed: number;
  avgMinutes: number;
  medianMinutes: number;
  p95Minutes: number;
  minMinutes: number;
  maxMinutes: number;
}

interface BookDuration {
  kind: 'dwell' | 'transit';
  minutes: number | null;
  ongoing: boolean;
  anomaly: string | null;
  originUnitName?: string | null;
  destinationUnitName?: string | null;
}

@Injectable()
export class ReportsService {
  private readonly baselineCache = new Map<
    string,
    { at: number; baselines: Map<string, RouteBaseline> }
  >();

  constructor(
    @InjectRepository(Movement)
    private readonly movementRepository: Repository<Movement>,
    @InjectRepository(CompanyConfig)
    private readonly configRepository: Repository<CompanyConfig>,
    private readonly movementTime: MovementTimeService,
  ) {}

  async getVehicleTimeline(actor: Actor, filters: ReportRangeFilters) {
    const companyId = requireCompanyId(actor);
    const window = await this.loadWindow(companyId);
    const range = this.resolveRange(filters);
    const { timelines } = await this.collectSegments(companyId, window, range, filters);
    return { range: this.rangeToIso(range), vehicles: timelines };
  }

  async getFleetStatus(actor: Actor) {
    const companyId = requireCompanyId(actor);
    const window = await this.loadWindow(companyId);
    const now = new Date();
    const { timelines } = await this.collectSegments(
      companyId,
      window,
      { dateFrom: new Date(now.getTime() - LOOKBACK_MS), dateTo: now },
      {},
    );

    const atUnitsMap = new Map<
      string,
      { unitId: string; unitName: string | null; vehicles: unknown[] }
    >();
    const inTransit: unknown[] = [];
    const unknown: unknown[] = [];

    for (const timeline of timelines) {
      const { summary, vehicle } = timeline;
      if (summary.currentState === 'at_unit' && summary.currentUnitId) {
        const segment = timeline.segments.find(
          (item): item is DwellSegment => item.kind === 'dwell' && item.ongoing,
        );
        const group = atUnitsMap.get(summary.currentUnitId) ?? {
          unitId: summary.currentUnitId,
          unitName: segment?.unitName ?? null,
          vehicles: [],
        };
        group.vehicles.push({
          vehicle,
          entryMovementId: segment?.entryMovementId ?? null,
          since: summary.currentSince,
          dwellMinutes: summary.currentMinutes,
          inJourneyWindow: segment?.inJourneyWindow ?? true,
        });
        atUnitsMap.set(summary.currentUnitId, group);
      } else if (summary.currentState === 'in_transit') {
        inTransit.push({ vehicle, since: summary.currentSince, minutes: summary.currentMinutes });
      } else {
        unknown.push({ vehicle });
      }
    }

    return {
      generatedAt: now.toISOString(),
      atUnits: [...atUnitsMap.values()],
      inTransit,
      unknown,
    };
  }

  async getDwellReport(actor: Actor, filters: ReportRangeFilters) {
    const companyId = requireCompanyId(actor);
    const window = await this.loadWindow(companyId);
    const range = this.resolveRange(filters);
    const { dwell, timelines } = await this.collectSegments(companyId, window, range, filters);

    return {
      range: this.rangeToIso(range),
      byVehicle: timelines.map((timeline) => ({
        vehicle: timeline.vehicle,
        ...this.dwellStats(
          timeline.segments.filter((item): item is DwellSegment => item.kind === 'dwell'),
        ),
      })),
      byUnit: this.aggregateUnits(dwell),
    };
  }

  async getTransitReport(actor: Actor, filters: ReportRangeFilters) {
    const companyId = requireCompanyId(actor);
    const window = await this.loadWindow(companyId);
    const range = this.resolveRange(filters);
    const { transit } = await this.collectSegments(companyId, window, range, filters);
    return { range: this.rangeToIso(range), routes: this.aggregateRoutes(transit) };
  }

  async getUtilizationReport(actor: Actor, filters: ReportRangeFilters) {
    const companyId = requireCompanyId(actor);
    const window = await this.loadWindow(companyId);
    const range = this.resolveRange(filters);
    const { timelines } = await this.collectSegments(companyId, window, range, filters);
    const rangeMinutes = Math.max(
      0,
      Math.round((range.dateTo.getTime() - range.dateFrom.getTime()) / 60000),
    );

    const byVehicle = timelines.map((timeline) => {
      const dwellMinutes = this.sumCompleted(timeline.segments, 'dwell');
      const transitMinutes = this.sumCompleted(timeline.segments, 'transit');
      return {
        vehicle: timeline.vehicle,
        rangeMinutes,
        dwellMinutes,
        transitMinutes,
        unaccountedMinutes: Math.max(0, rangeMinutes - dwellMinutes - transitMinutes),
        dwellPct: this.pct(dwellMinutes, rangeMinutes),
        transitPct: this.pct(transitMinutes, rangeMinutes),
      };
    });

    return {
      range: this.rangeToIso(range),
      totals: {
        rangeMinutes,
        dwellMinutes: byVehicle.reduce((total, item) => total + item.dwellMinutes, 0),
        transitMinutes: byVehicle.reduce((total, item) => total + item.transitMinutes, 0),
      },
      byVehicle,
    };
  }

  async getExceptions(actor: Actor, filters: ReportRangeFilters) {
    const companyId = requireCompanyId(actor);
    const window = await this.loadWindow(companyId);
    const range = this.resolveRange(filters);
    const { dwell, transit, timelines } = await this.collectSegments(
      companyId,
      window,
      range,
      filters,
    );
    const vehicles = this.vehicleIndex(timelines);

    const openTooLong = dwell
      .filter((segment) => segment.ongoing && (segment.minutes ?? 0) >= OPEN_DWELL_ALERT_MINUTES)
      .map((segment) => this.dwellException(vehicles, segment, 'open_too_long'));
    const missingExit = dwell
      .filter((segment) => segment.anomaly === 'missing_exit')
      .map((segment) => this.dwellException(vehicles, segment, 'missing_exit'));
    const missingArrival = transit
      .filter((segment) => segment.anomaly === 'missing_arrival')
      .map((segment) => this.transitException(vehicles, segment, 'missing_arrival'));
    const aboveBaseline = transit
      .filter(
        (segment) =>
          segment.baseline !== null &&
          segment.baseline.sampleCount >= CONFIDENCE_MIN_SAMPLES &&
          segment.minutes !== null &&
          segment.minutes > segment.baseline.p95Minutes,
      )
      .map((segment) => this.transitException(vehicles, segment, 'above_p95'));
    const overnight = transit
      .filter((segment) => segment.overnight)
      .map((segment) => this.transitException(vehicles, segment, 'overnight'));

    return {
      range: this.rangeToIso(range),
      summary: {
        openTooLong: openTooLong.length,
        missingExit: missingExit.length,
        missingArrival: missingArrival.length,
        aboveBaseline: aboveBaseline.length,
        overnight: overnight.length,
      },
      openTooLong,
      missingExit,
      missingArrival,
      aboveBaseline,
      overnight,
    };
  }

  async getMovementBook(actor: Actor, filters: ReportRangeFilters) {
    const companyId = requireCompanyId(actor);
    const window = await this.loadWindow(companyId);
    const range = this.resolveRange(filters);
    const { timelines } = await this.collectSegments(companyId, window, range, filters);
    const movements = await this.loadMovements(companyId, {
      ...filters,
      dateFrom: range.dateFrom.toISOString(),
      dateTo: range.dateTo.toISOString(),
    });
    const rows = this.toBookRows(movements, timelines);

    return {
      range: this.rangeToIso(range),
      data: rows,
      summary: {
        movements: rows.length,
        dwellMinutes: rows.reduce(
          (total, row) => total + (row.kind === 'dwell' ? (row.minutes ?? 0) : 0),
          0,
        ),
        transitMinutes: rows.reduce(
          (total, row) => total + (row.kind === 'transit' ? (row.minutes ?? 0) : 0),
          0,
        ),
        anomalies: rows.filter((row) => row.anomaly !== null).length,
      },
    };
  }

  toCsv(book: { data: Array<Record<string, unknown>> }): string {
    const header = [
      'dataHora',
      'placa',
      'veiculo',
      'tipo',
      'unidade',
      'ponto',
      'motorista',
      'motivo',
      'tempoMin',
      'origem',
      'destino',
      'anomalia',
    ];
    const lines = book.data.map((row) =>
      [
        row.dateTime,
        row.vehiclePlate,
        row.vehicleCode,
        row.type,
        row.unitName ?? '',
        row.pointName ?? '',
        row.driverName ?? '',
        row.purpose ?? '',
        row.minutes ?? '',
        row.originUnitName ?? '',
        row.destinationUnitName ?? '',
        row.anomaly ?? '',
      ]
        .map((value) => this.csvCell(value as string | number))
        .join(','),
    );
    return [header.join(','), ...lines].join('\n');
  }

  private async collectSegments(
    companyId: string,
    window: JourneyWindow,
    range: TimelineRange,
    filters: ReportRangeFilters,
  ): Promise<Segments> {
    const movements = await this.loadMovements(companyId, {
      ...filters,
      dateFrom: new Date(range.dateFrom.getTime() - LOOKBACK_MS).toISOString(),
      dateTo: range.dateTo.toISOString(),
    });
    const baselines = await this.getRouteBaselines(companyId, range.dateTo, window);
    const timelines = this.movementTime.buildTimelines(
      movements,
      window,
      range,
      new Date(),
      baselines,
    );

    const dwell: DwellSegment[] = [];
    const transit: TransitSegment[] = [];
    for (const timeline of timelines) {
      for (const segment of timeline.segments) {
        if (segment.kind === 'dwell') dwell.push(segment);
        else transit.push(segment);
      }
    }

    return { dwell, transit, timelines };
  }

  private async loadWindow(companyId: string): Promise<JourneyWindow> {
    const config = await this.configRepository.findOneBy({ companyId });
    return toJourneyWindow({
      timezone: config?.timezone,
      journeyWindowStart: config?.journeyWindowStart,
      journeyWindowEnd: config?.journeyWindowEnd,
      journeyWindowDays: config?.journeyWindowDays,
    });
  }

  private resolveRange(filters: ReportRangeFilters): TimelineRange {
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : new Date();
    const dateFrom = filters.dateFrom
      ? new Date(filters.dateFrom)
      : new Date(dateTo.getTime() - DEFAULT_RANGE_MS);
    return { dateFrom, dateTo };
  }

  private rangeToIso(range: TimelineRange) {
    return { dateFrom: range.dateFrom.toISOString(), dateTo: range.dateTo.toISOString() };
  }

  private async loadMovements(companyId: string, filters: LoadOptions): Promise<TimeMovement[]> {
    const query = this.movementRepository
      .createQueryBuilder('m')
      .innerJoin('points', 'point', 'point.id = m.pointId')
      .innerJoin('admin_unities', 'unit', 'unit.id = point.adminUnityId')
      .innerJoin('vehicles', 'vehicle', 'vehicle.id = m.vehicleId')
      .select([
        'm.id AS id',
        'm.vehicleId AS vehicle_id',
        'm.pointId AS point_id',
        'm.type AS type',
        'm.dateTime AS date_time',
        'm.status AS status',
        'm.purpose AS purpose',
        'm.driverName AS driver_name',
        'vehicle.plate AS vehicle_plate',
        'vehicle.code AS vehicle_code',
        'vehicle.type AS vehicle_type',
        'point.name AS point_name',
        'point.code AS point_code',
        'unit.id AS unit_id',
        'unit.name AS unit_name',
        'unit.code AS unit_code',
      ])
      .where('m.companyId = :companyId', { companyId })
      .andWhere("vehicle.type = 'own'")
      .andWhere('m.status IN (:...statuses)', { statuses: ['open', 'closed'] })
      .andWhere('m.vehicleId IS NOT NULL');

    if (filters.dateFrom) query.andWhere('m.dateTime >= :dateFrom', { dateFrom: filters.dateFrom });
    if (filters.dateTo) query.andWhere('m.dateTime <= :dateTo', { dateTo: filters.dateTo });
    if (filters.vehicleId) query.andWhere('m.vehicleId = :vehicleId', { vehicleId: filters.vehicleId });
    if (filters.pointId) query.andWhere('m.pointId = :pointId', { pointId: filters.pointId });
    if (filters.adminUnityId) query.andWhere('unit.id = :adminUnityId', { adminUnityId: filters.adminUnityId });

    query.orderBy('m.dateTime', 'ASC').addOrderBy('m.createdAt', 'ASC');

    const raw = await query.getRawMany<Record<string, unknown>>();
    return raw.map((row) => this.toTimeMovement(row));
  }

  private toTimeMovement(row: Record<string, unknown>): TimeMovement {
    return {
      id: String(row.id),
      vehicleId: String(row.vehicle_id),
      vehiclePlate: String(row.vehicle_plate),
      vehicleCode: String(row.vehicle_code),
      vehicleType: String(row.vehicle_type),
      pointId: row.point_id ? String(row.point_id) : null,
      pointName: row.point_name ? String(row.point_name) : null,
      pointCode: row.point_code ? String(row.point_code) : null,
      unitId: String(row.unit_id),
      unitName: row.unit_name ? String(row.unit_name) : null,
      unitCode: row.unit_code ? String(row.unit_code) : null,
      type: row.type === 'exit' ? 'exit' : 'entry',
      dateTime: new Date(row.date_time as string),
      status: String(row.status),
      purpose: row.purpose ? String(row.purpose) : null,
      driverName: row.driver_name ? String(row.driver_name) : null,
    };
  }

  private async getRouteBaselines(
    companyId: string,
    reference: Date,
    window: JourneyWindow,
  ): Promise<Map<string, RouteBaseline>> {
    const cached = this.baselineCache.get(companyId);
    if (cached && reference.getTime() - cached.at < BASELINE_CACHE_MS) {
      return cached.baselines;
    }

    const movements = await this.loadMovements(companyId, {
      dateFrom: new Date(reference.getTime() - BASELINE_WINDOW_MS).toISOString(),
      dateTo: reference.toISOString(),
    });
    const timelines = this.movementTime.buildTimelines(
      movements,
      window,
      { dateFrom: new Date(0), dateTo: reference },
      reference,
    );

    const samples = new Map<string, number[]>();
    for (const timeline of timelines) {
      for (const segment of timeline.segments) {
        if (segment.kind !== 'transit' || segment.ongoing) continue;
        if (!segment.inJourneyWindow || segment.minutes === null) continue;
        const key = routeKey(segment.originUnitId, segment.destinationUnitId ?? '');
        const list = samples.get(key) ?? [];
        list.push(segment.minutes);
        samples.set(key, list);
      }
    }

    const baselines = new Map<string, RouteBaseline>();
    for (const [key, values] of samples) {
      baselines.set(key, {
        avgMinutes: Math.round(values.reduce((total, value) => total + value, 0) / values.length),
        p95Minutes: this.percentile(values, 0.95),
        sampleCount: values.length,
      });
    }

    this.baselineCache.set(companyId, { at: reference.getTime(), baselines });
    return baselines;
  }

  private dwellStats(segments: DwellSegment[]): DurationStats {
    const completed = segments
      .filter((segment) => !segment.ongoing && segment.minutes !== null)
      .map((segment) => segment.minutes as number);
    return this.stats(segments.length, completed);
  }

  private transitStats(segments: TransitSegment[]): DurationStats {
    const completed = segments
      .filter((segment) => !segment.ongoing && segment.minutes !== null)
      .map((segment) => segment.minutes as number);
    return this.stats(segments.length, completed);
  }

  private stats(visits: number, values: number[]): DurationStats {
    const sorted = [...values].sort((a, b) => a - b);
    const total = sorted.reduce((sum, value) => sum + value, 0);
    return {
      visits,
      completed: sorted.length,
      avgMinutes: sorted.length > 0 ? Math.round(total / sorted.length) : 0,
      medianMinutes: this.percentile(sorted, 0.5),
      p95Minutes: this.percentile(sorted, 0.95),
      minMinutes: sorted.length > 0 ? sorted[0] : 0,
      maxMinutes: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
    };
  }

  private aggregateUnits(dwell: DwellSegment[]) {
    const byUnit = new Map<string, { unitName: string | null; segments: DwellSegment[] }>();
    for (const segment of dwell) {
      const group = byUnit.get(segment.unitId) ?? { unitName: segment.unitName, segments: [] };
      group.segments.push(segment);
      byUnit.set(segment.unitId, group);
    }
    return [...byUnit.entries()].map(([unitId, group]) => ({
      unitId,
      unitName: group.unitName,
      ...this.dwellStats(group.segments),
    }));
  }

  private aggregateRoutes(transit: TransitSegment[]) {
    const byRoute = new Map<
      string,
      {
        originUnitId: string;
        originUnitName: string | null;
        destinationUnitId: string | null;
        destinationUnitName: string | null;
        segments: TransitSegment[];
      }
    >();
    for (const segment of transit) {
      const key = routeKey(segment.originUnitId, segment.destinationUnitId ?? '');
      const group = byRoute.get(key) ?? {
        originUnitId: segment.originUnitId,
        originUnitName: segment.originUnitName,
        destinationUnitId: segment.destinationUnitId,
        destinationUnitName: segment.destinationUnitName,
        segments: [],
      };
      group.segments.push(segment);
      byRoute.set(key, group);
    }

    return [...byRoute.values()].map((group) => ({
      originUnitId: group.originUnitId,
      originUnitName: group.originUnitName,
      destinationUnitId: group.destinationUnitId,
      destinationUnitName: group.destinationUnitName,
      ...this.transitStats(group.segments),
    }));
  }

  private toBookRows(movements: TimeMovement[], timelines: VehicleTimeline[]) {
    const durations = new Map<string, BookDuration>();
    for (const timeline of timelines) {
      for (const segment of timeline.segments) {
        if (segment.kind === 'dwell') {
          durations.set(segment.entryMovementId, {
            kind: 'dwell',
            minutes: segment.minutes,
            ongoing: segment.ongoing,
            anomaly: segment.anomaly,
          });
          if (segment.exitMovementId) {
            durations.set(segment.exitMovementId, {
              kind: 'dwell',
              minutes: segment.minutes,
              ongoing: false,
              anomaly: null,
            });
          }
        } else {
          const transit: BookDuration = {
            kind: 'transit',
            minutes: segment.minutes,
            ongoing: segment.ongoing,
            anomaly: segment.anomaly,
            originUnitName: segment.originUnitName,
            destinationUnitName: segment.destinationUnitName,
          };
          durations.set(segment.departedMovementId, transit);
          if (segment.arrivedMovementId) {
            durations.set(segment.arrivedMovementId, { ...transit, anomaly: null });
          }
        }
      }
    }

    return [...movements]
      .sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime())
      .map((movement) => {
        const duration = durations.get(movement.id);
        return {
          movementId: movement.id,
          dateTime: movement.dateTime.toISOString(),
          vehicleId: movement.vehicleId,
          vehiclePlate: movement.vehiclePlate,
          vehicleCode: movement.vehicleCode,
          type: movement.type,
          unitId: movement.unitId,
          unitName: movement.unitName,
          pointId: movement.pointId,
          pointName: movement.pointName,
          driverName: movement.driverName,
          purpose: movement.purpose,
          status: movement.status,
          kind: duration?.kind ?? null,
          minutes: duration?.minutes ?? null,
          ongoing: duration?.ongoing ?? false,
          originUnitName: duration?.originUnitName ?? null,
          destinationUnitName: duration?.destinationUnitName ?? null,
          anomaly: duration?.anomaly ?? null,
        };
      });
  }

  private vehicleIndex(timelines: VehicleTimeline[]) {
    const index = new Map<string, VehicleTimeline['vehicle']>();
    for (const timeline of timelines) {
      for (const segment of timeline.segments) {
        const movementId =
          segment.kind === 'dwell' ? segment.entryMovementId : segment.departedMovementId;
        index.set(movementId, timeline.vehicle);
      }
    }
    return index;
  }

  private dwellException(
    vehicles: Map<string, VehicleTimeline['vehicle']>,
    segment: DwellSegment,
    anomaly: string,
  ) {
    return {
      vehicle: vehicles.get(segment.entryMovementId) ?? null,
      anomaly,
      unitId: segment.unitId,
      unitName: segment.unitName,
      entryMovementId: segment.entryMovementId,
      entryAt: segment.entryAt,
      exitMovementId: segment.exitMovementId,
      minutes: segment.minutes,
      ongoing: segment.ongoing,
    };
  }

  private transitException(
    vehicles: Map<string, VehicleTimeline['vehicle']>,
    segment: TransitSegment,
    anomaly: string,
  ) {
    return {
      vehicle: vehicles.get(segment.departedMovementId) ?? null,
      anomaly,
      originUnitId: segment.originUnitId,
      originUnitName: segment.originUnitName,
      destinationUnitId: segment.destinationUnitId,
      destinationUnitName: segment.destinationUnitName,
      departedMovementId: segment.departedMovementId,
      departedAt: segment.departedAt,
      minutes: segment.minutes,
      baseline: segment.baseline,
      deviationPct: segment.deviationPct,
      ongoing: segment.ongoing,
    };
  }

  private sumCompleted(
    segments: Array<DwellSegment | TransitSegment>,
    kind: 'dwell' | 'transit',
  ): number {
    return segments
      .filter((segment) => segment.kind === kind && !segment.ongoing && segment.minutes !== null)
      .reduce((total, segment) => total + (segment.minutes ?? 0), 0);
  }

  private pct(value: number, total: number): number {
    if (total <= 0) return 0;
    return Math.round((value / total) * 100);
  }

  private percentile(values: number[], ratio: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    const index = Math.min(sorted.length - 1, Math.floor(ratio * sorted.length));
    return sorted[index];
  }

  private csvCell(value: string | number): string {
    const text = String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }
}
