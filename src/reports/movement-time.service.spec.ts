import { MovementTimeService, routeKey, type TimeMovement } from './movement-time.service.js';
import { toJourneyWindow } from './journey-window.js';

const window = toJourneyWindow({
  timezone: 'UTC',
  journeyWindowStart: '00:00',
  journeyWindowEnd: '23:59',
  journeyWindowDays: '1,2,3,4,5,6,7',
});

const range = {
  dateFrom: new Date('2026-09-01T00:00:00.000Z'),
  dateTo: new Date('2026-09-02T00:00:00.000Z'),
};

function movement(
  overrides: Omit<Partial<TimeMovement>, 'dateTime'> & {
    id: string;
    type: 'entry' | 'exit';
    dateTime: string;
  },
): TimeMovement {
  return {
    vehicleId: 'v1',
    vehiclePlate: 'ABC1D23',
    vehicleCode: 'VEH-001',
    vehicleType: 'own',
    pointId: 'p1',
    pointName: 'Portão 1',
    pointCode: 'P1',
    unitId: 'unitA',
    unitName: 'Unidade A',
    unitCode: 'UA',
    status: 'closed',
    purpose: null,
    driverName: null,
    ...overrides,
    dateTime: new Date(overrides.dateTime),
  };
}

describe('MovementTimeService', () => {
  const service = new MovementTimeService();
  const now = new Date('2026-09-01T12:00:00.000Z');

  it('calcula permanência pareando entrada e saída na mesma unidade', () => {
    const timelines = service.buildTimelines(
      [
        movement({ id: 'e1', type: 'entry', dateTime: '2026-09-01T09:00:00.000Z' }),
        movement({ id: 'x1', type: 'exit', dateTime: '2026-09-01T11:00:00.000Z' }),
      ],
      window,
      range,
      now,
    );

    expect(timelines).toHaveLength(1);
    const dwell = timelines[0].segments.find((segment) => segment.kind === 'dwell');
    expect(dwell?.minutes).toBe(120);
    expect(dwell?.ongoing).toBe(false);
    expect(timelines[0].summary.totalDwellMinutes).toBe(120);
    expect(timelines[0].summary.currentState).toBe('in_transit');
  });

  it('deriva trânsito entre unidades e aplica o baseline da rota', () => {
    const baselines = new Map([
      [routeKey('unitA', 'unitB'), { avgMinutes: 30, p95Minutes: 40, sampleCount: 10 }],
    ]);

    const timelines = service.buildTimelines(
      [
        movement({ id: 'e1', type: 'entry', dateTime: '2026-09-01T09:00:00.000Z', unitId: 'unitA' }),
        movement({ id: 'x1', type: 'exit', dateTime: '2026-09-01T10:00:00.000Z', unitId: 'unitA' }),
        movement({ id: 'e2', type: 'entry', dateTime: '2026-09-01T10:30:00.000Z', unitId: 'unitB', unitName: 'Unidade B', pointId: 'p2', pointName: 'Portão B' }),
        movement({ id: 'x2', type: 'exit', dateTime: '2026-09-01T11:30:00.000Z', unitId: 'unitB', unitName: 'Unidade B', pointId: 'p2', pointName: 'Portão B' }),
      ],
      window,
      range,
      now,
      baselines,
    );

    const transit = timelines[0].segments.find(
      (segment) => segment.kind === 'transit' && !segment.ongoing,
    );
    expect(transit).toMatchObject({
      originUnitId: 'unitA',
      destinationUnitId: 'unitB',
      minutes: 30,
      inJourneyWindow: true,
      deviationPct: 0,
    });
    expect(timelines[0].summary.totalTransitMinutes).toBe(30);
    expect(timelines[0].summary.dwellCount).toBe(2);
  });

  it('marca entrada sem saída como missing_exit quando há evento posterior', () => {
    const timelines = service.buildTimelines(
      [
        movement({ id: 'e1', type: 'entry', dateTime: '2026-09-01T09:00:00.000Z' }),
        movement({ id: 'e2', type: 'entry', dateTime: '2026-09-01T10:00:00.000Z' }),
      ],
      window,
      range,
      now,
    );

    const dwell = timelines[0].segments.filter((segment) => segment.kind === 'dwell');
    expect(dwell).toHaveLength(2);
    const first = dwell.find((segment) => segment.kind === 'dwell' && segment.entryMovementId === 'e1');
    expect(first).toMatchObject({ ongoing: true, anomaly: 'missing_exit' });
    expect(timelines[0].summary.currentState).toBe('at_unit');
    expect(timelines[0].summary.currentMinutes).toBe(120);
  });

  it('ignora segmentos iniciados fora do período do relatório', () => {
    const timelines = service.buildTimelines(
      [
        movement({ id: 'e0', type: 'entry', dateTime: '2026-08-31T09:00:00.000Z' }),
        movement({ id: 'x0', type: 'exit', dateTime: '2026-08-31T10:00:00.000Z' }),
      ],
      window,
      range,
      now,
    );

    expect(timelines[0].segments).toHaveLength(0);
  });

  it('marca trânsito que cruza a meia-noite como overnight', () => {
    const timelines = service.buildTimelines(
      [
        movement({ id: 'x1', type: 'exit', dateTime: '2026-09-01T23:30:00.000Z', unitId: 'unitA' }),
        movement({ id: 'e1', type: 'entry', dateTime: '2026-09-02T01:00:00.000Z', unitId: 'unitB' }),
      ],
      window,
      { dateFrom: new Date('2026-09-01T00:00:00.000Z'), dateTo: new Date('2026-09-03T00:00:00.000Z') },
      now,
    );

    const transit = timelines[0].segments.find((segment) => segment.kind === 'transit');
    expect(transit).toMatchObject({ overnight: true, inJourneyWindow: false });
  });
});
