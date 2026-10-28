import { matchesNotificationFilters } from './notification-filter.matcher.js';
import type {
  CameraErrorEvent,
  MovementRegisteredEvent,
  MovementRegisteredFilters,
  SystemErrorEvent,
} from './notification-events.js';

function movementEvent(overrides: Partial<MovementRegisteredEvent> = {}): MovementRegisteredEvent {
  return {
    type: 'movement.registered',
    companyId: 'company-1',
    severity: 'info',
    title: 'Movimento registrado',
    body: 'Placa ABC1D23',
    resourceType: 'movement',
    resourceId: 'movement-1',
    pointId: 'point-1',
    cameraId: 'camera-1',
    occurredAt: new Date(),
    payload: {
      movementId: 'movement-1',
      pointId: 'point-1',
      pointName: 'Portaria',
      cameraId: 'camera-1',
      movementType: 'entry',
      status: 'pending_review',
      autoRegistered: true,
      plate: 'ABC1D23',
      action: 'created',
      occurredAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

describe('matchesNotificationFilters', () => {
  it('aplica o filtro padrão de status do movimento', () => {
    const pending = movementEvent();
    const open = movementEvent({
      payload: { ...pending.payload, status: 'open' },
    });

    const filters: MovementRegisteredFilters = { statuses: ['pending_review'] };
    expect(matchesNotificationFilters(pending, filters)).toBe(true);
    expect(matchesNotificationFilters(open, filters)).toBe(false);
  });

  it('lista vazia funciona como "todos"', () => {
    expect(
      matchesNotificationFilters(movementEvent(), {
        statuses: [],
        pointIds: [],
        cameraIds: [],
      }),
    ).toBe(true);
  });

  it('combina ponto, câmera e tipo de erro de câmera', () => {
    const event: CameraErrorEvent = {
      type: 'camera.error',
      companyId: 'company-1',
      severity: 'error',
      title: 'Falha',
      body: 'Câmera offline',
      resourceType: 'camera',
      resourceId: 'camera-1',
      pointId: 'point-1',
      cameraId: 'camera-1',
      occurredAt: new Date(),
      payload: {
        cameraId: 'camera-1',
        cameraName: 'Câmera 1',
        pointId: 'point-1',
        kind: 'offline',
        errorMessage: null,
        occurredAt: new Date().toISOString(),
      },
    };

    expect(
      matchesNotificationFilters(event, {
        pointIds: ['point-1'],
        cameraIds: ['camera-1'],
        kinds: ['offline'],
      }),
    ).toBe(true);
    expect(matchesNotificationFilters(event, { kinds: ['snapshot_failed'] })).toBe(false);
  });

  it('filtra erro de sistema por severidade', () => {
    const event: SystemErrorEvent = {
      type: 'system.error',
      companyId: null,
      severity: 'error',
      title: 'Erro',
      body: 'Falha',
      resourceType: 'system',
      resourceId: null,
      pointId: null,
      cameraId: null,
      occurredAt: new Date(),
      payload: {
        source: 'http',
        statusCode: 500,
        message: 'Falha',
        path: '/x',
        occurredAt: new Date().toISOString(),
      },
    };

    expect(matchesNotificationFilters(event, { severities: ['error'] })).toBe(true);
    expect(matchesNotificationFilters(event, { severities: ['warning'] })).toBe(false);
    expect(matchesNotificationFilters(event, { sources: ['http'] })).toBe(true);
  });
});
