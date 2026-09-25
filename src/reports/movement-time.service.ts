import { Injectable } from '@nestjs/common';
import {
  intervalWithinJourneyWindow,
  isWithinJourneyWindow,
  type JourneyWindow,
} from './journey-window.js';

export type MovementDirection = 'entry' | 'exit';

/** Movimento já enriquecido com os dados de veículo/ponto/unidade. */
export interface TimeMovement {
  id: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleCode: string;
  vehicleType: string;
  pointId: string | null;
  pointName: string | null;
  pointCode: string | null;
  unitId: string;
  unitName: string | null;
  unitCode: string | null;
  type: MovementDirection;
  dateTime: Date;
  status: string;
  purpose: string | null;
  driverName: string | null;
}

export interface VehicleRef {
  id: string;
  plate: string;
  code: string;
  type: string;
}

/** Baseline histórico de uma rota (unidade origem → unidade destino). */
export interface RouteBaseline {
  avgMinutes: number;
  p95Minutes: number;
  sampleCount: number;
}

export interface DwellSegment {
  kind: 'dwell';
  unitId: string;
  unitName: string | null;
  entryMovementId: string;
  entryPointId: string | null;
  entryPointName: string | null;
  entryAt: string;
  exitMovementId: string | null;
  exitPointId: string | null;
  exitPointName: string | null;
  exitAt: string | null;
  minutes: number | null;
  ongoing: boolean;
  inJourneyWindow: boolean;
  anomaly: 'missing_exit' | null;
}

export interface TransitSegment {
  kind: 'transit';
  originUnitId: string;
  originUnitName: string | null;
  destinationUnitId: string | null;
  destinationUnitName: string | null;
  departedMovementId: string;
  departedAt: string;
  arrivedMovementId: string | null;
  arrivedAt: string | null;
  minutes: number | null;
  ongoing: boolean;
  inJourneyWindow: boolean;
  overnight: boolean;
  anomaly: 'missing_arrival' | null;
  baseline: RouteBaseline | null;
  deviationPct: number | null;
}

export type TimelineSegment = DwellSegment | TransitSegment;

export interface VehicleTimeline {
  vehicle: VehicleRef;
  segments: TimelineSegment[];
  summary: {
    dwellCount: number;
    transitCount: number;
    totalDwellMinutes: number;
    totalTransitMinutes: number;
    currentState: 'at_unit' | 'in_transit' | 'unknown';
    currentUnitId: string | null;
    currentSince: string | null;
    currentMinutes: number | null;
  };
}

export interface TimelineRange {
  dateFrom: Date;
  dateTo: Date;
}

export function routeKey(originUnitId: string, destinationUnitId: string): string {
  return `${originUnitId}::${destinationUnitId}`;
}

function compareMovements(a: TimeMovement, b: TimeMovement): number {
  const diff = a.dateTime.getTime() - b.dateTime.getTime();
  if (diff !== 0) return diff;
  return a.id.localeCompare(b.id);
}

function diffMinutes(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
}

/**
 * Reconstrói a linha do tempo de tempo de veículos (permanência e ausência).
 *
 * A permanência é obtida pareando entrada↔saída por `veículo + unidade`
 * (mesma regra do reconcile). O trânsito é derivado da sequência global de
 * eventos do veículo: saída em uma unidade seguida de entrada em outra.
 */
@Injectable()
export class MovementTimeService {
  buildTimelines(
    movements: TimeMovement[],
    window: JourneyWindow,
    range: TimelineRange,
    now: Date,
    baselines: Map<string, RouteBaseline> = new Map(),
  ): VehicleTimeline[] {
    const byVehicle = new Map<string, TimeMovement[]>();
    for (const movement of movements) {
      const list = byVehicle.get(movement.vehicleId);
      if (list) list.push(movement);
      else byVehicle.set(movement.vehicleId, [movement]);
    }

    const timelines: VehicleTimeline[] = [];
    for (const vehicleMovements of byVehicle.values()) {
      timelines.push(
        this.buildTimeline(vehicleMovements, window, range, now, baselines),
      );
    }

    return timelines.sort((a, b) => a.vehicle.plate.localeCompare(b.vehicle.plate));
  }

  private buildTimeline(
    movements: TimeMovement[],
    window: JourneyWindow,
    range: TimelineRange,
    now: Date,
    baselines: Map<string, RouteBaseline>,
  ): VehicleTimeline {
    const sorted = [...movements].sort(compareMovements);
    const first = sorted[0];
    const vehicle: VehicleRef = {
      id: first.vehicleId,
      plate: first.vehiclePlate,
      code: first.vehicleCode,
      type: first.vehicleType,
    };

    const segments: TimelineSegment[] = [];
    segments.push(...this.buildDwellSegments(sorted, window, now));
    segments.push(...this.buildTransitSegments(sorted, window, now, baselines));

    const lastEvent = sorted[sorted.length - 1] ?? null;
    const lastEventId = lastEvent?.id ?? null;
    for (const segment of segments) {
      if (segment.kind === 'dwell' && segment.ongoing && segment.entryMovementId !== lastEventId) {
        segment.anomaly = 'missing_exit';
      }
    }

    const visible = segments
      .filter((segment) => this.isVisible(segment, range))
      .sort((a, b) => this.segmentStart(a).getTime() - this.segmentStart(b).getTime());

    return {
      vehicle,
      segments: visible,
      summary: this.buildSummary(visible, lastEvent, now),
    };
  }

  private buildDwellSegments(
    movements: TimeMovement[],
    window: JourneyWindow,
    now: Date,
  ): DwellSegment[] {
    const byUnit = new Map<string, TimeMovement[]>();
    for (const movement of movements) {
      const list = byUnit.get(movement.unitId);
      if (list) list.push(movement);
      else byUnit.set(movement.unitId, [movement]);
    }

    const segments: DwellSegment[] = [];
    for (const events of byUnit.values()) {
      const stack: TimeMovement[] = [];
      for (const event of events) {
        if (event.type === 'entry') {
          stack.push(event);
          continue;
        }
        const entry = stack.pop();
        if (!entry) continue;
        segments.push(this.makeDwell(entry, event, window));
      }
      for (const entry of stack) {
        segments.push(this.makeOpenDwell(entry, window, now));
      }
    }
    return segments;
  }

  private makeDwell(
    entry: TimeMovement,
    exit: TimeMovement,
    window: JourneyWindow,
  ): DwellSegment {
    return {
      kind: 'dwell',
      unitId: entry.unitId,
      unitName: entry.unitName,
      entryMovementId: entry.id,
      entryPointId: entry.pointId,
      entryPointName: entry.pointName,
      entryAt: entry.dateTime.toISOString(),
      exitMovementId: exit.id,
      exitPointId: exit.pointId,
      exitPointName: exit.pointName,
      exitAt: exit.dateTime.toISOString(),
      minutes: diffMinutes(entry.dateTime, exit.dateTime),
      ongoing: false,
      inJourneyWindow: intervalWithinJourneyWindow(entry.dateTime, exit.dateTime, window),
      anomaly: null,
    };
  }

  private makeOpenDwell(
    entry: TimeMovement,
    window: JourneyWindow,
    now: Date,
  ): DwellSegment {
    return {
      kind: 'dwell',
      unitId: entry.unitId,
      unitName: entry.unitName,
      entryMovementId: entry.id,
      entryPointId: entry.pointId,
      entryPointName: entry.pointName,
      entryAt: entry.dateTime.toISOString(),
      exitMovementId: null,
      exitPointId: null,
      exitPointName: null,
      exitAt: null,
      minutes: diffMinutes(entry.dateTime, now),
      ongoing: true,
      inJourneyWindow: isWithinJourneyWindow(entry.dateTime, window),
      anomaly: null,
    };
  }

  private buildTransitSegments(
    sorted: TimeMovement[],
    window: JourneyWindow,
    now: Date,
    baselines: Map<string, RouteBaseline>,
  ): TransitSegment[] {
    const segments: TransitSegment[] = [];

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (current.type !== 'entry' || previous.type !== 'exit') continue;
      if (previous.unitId === current.unitId) continue;
      segments.push(this.makeTransit(previous, current, window, baselines));
    }

    const last = sorted[sorted.length - 1];
    if (last && last.type === 'exit') {
      segments.push(this.makeOpenTransit(last, window, now));
    }

    return segments;
  }

  private makeTransit(
    departed: TimeMovement,
    arrived: TimeMovement,
    window: JourneyWindow,
    baselines: Map<string, RouteBaseline>,
  ): TransitSegment {
    const minutes = diffMinutes(departed.dateTime, arrived.dateTime);
    const inJourneyWindow = intervalWithinJourneyWindow(
      departed.dateTime,
      arrived.dateTime,
      window,
    );
    const baseline = baselines.get(routeKey(departed.unitId, arrived.unitId)) ?? null;

    return {
      kind: 'transit',
      originUnitId: departed.unitId,
      originUnitName: departed.unitName,
      destinationUnitId: arrived.unitId,
      destinationUnitName: arrived.unitName,
      departedMovementId: departed.id,
      departedAt: departed.dateTime.toISOString(),
      arrivedMovementId: arrived.id,
      arrivedAt: arrived.dateTime.toISOString(),
      minutes,
      ongoing: false,
      inJourneyWindow,
      overnight: !inJourneyWindow,
      anomaly: null,
      baseline,
      deviationPct:
        baseline && baseline.avgMinutes > 0
          ? Math.round(((minutes - baseline.avgMinutes) / baseline.avgMinutes) * 100)
          : null,
    };
  }

  private makeOpenTransit(
    departed: TimeMovement,
    window: JourneyWindow,
    now: Date,
  ): TransitSegment {
    return {
      kind: 'transit',
      originUnitId: departed.unitId,
      originUnitName: departed.unitName,
      destinationUnitId: null,
      destinationUnitName: null,
      departedMovementId: departed.id,
      departedAt: departed.dateTime.toISOString(),
      arrivedMovementId: null,
      arrivedAt: null,
      minutes: diffMinutes(departed.dateTime, now),
      ongoing: true,
      inJourneyWindow: isWithinJourneyWindow(departed.dateTime, window),
      overnight: false,
      anomaly: 'missing_arrival',
      baseline: null,
      deviationPct: null,
    };
  }

  private isVisible(segment: TimelineSegment, range: TimelineRange): boolean {
    const start = this.segmentStart(segment).getTime();
    return start >= range.dateFrom.getTime() && start <= range.dateTo.getTime();
  }

  private segmentStart(segment: TimelineSegment): Date {
    return segment.kind === 'dwell'
      ? new Date(segment.entryAt)
      : new Date(segment.departedAt);
  }

  private buildSummary(
    segments: TimelineSegment[],
    lastEvent: TimeMovement | null,
    now: Date,
  ): VehicleTimeline['summary'] {
    const dwell = segments.filter(
      (segment): segment is DwellSegment => segment.kind === 'dwell',
    );
    const transit = segments.filter(
      (segment): segment is TransitSegment => segment.kind === 'transit',
    );

    const totalDwellMinutes = dwell
      .filter((segment) => !segment.ongoing && segment.minutes !== null)
      .reduce((total, segment) => total + (segment.minutes ?? 0), 0);
    const totalTransitMinutes = transit
      .filter((segment) => !segment.ongoing && segment.minutes !== null)
      .reduce((total, segment) => total + (segment.minutes ?? 0), 0);

    const current = this.resolveCurrentState(lastEvent, now);

    return {
      dwellCount: dwell.length,
      transitCount: transit.length,
      totalDwellMinutes,
      totalTransitMinutes,
      currentState: current.state,
      currentUnitId: current.unitId,
      currentSince: current.since,
      currentMinutes: current.minutes,
    };
  }

  private resolveCurrentState(
    lastEvent: TimeMovement | null,
    now: Date,
  ): {
    state: 'at_unit' | 'in_transit' | 'unknown';
    unitId: string | null;
    since: string | null;
    minutes: number | null;
  } {
    if (!lastEvent) {
      return { state: 'unknown', unitId: null, since: null, minutes: null };
    }
    const since = lastEvent.dateTime.toISOString();
    const minutes = diffMinutes(lastEvent.dateTime, now);
    if (lastEvent.type === 'entry') {
      return { state: 'at_unit', unitId: lastEvent.unitId, since, minutes };
    }
    return { state: 'in_transit', unitId: null, since, minutes };
  }
}
