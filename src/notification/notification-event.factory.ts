import type {
  CameraErrorEvent,
  CameraErrorKind,
  ExternalApiUsageEvent,
  ExternalOutcome,
  MovementAction,
  MovementRegisteredEvent,
  MovementStatus,
  MovementType,
  SystemErrorEvent,
} from './notification-events.js';

const OUTCOME_LABELS: Record<ExternalOutcome, string> = {
  success: 'placa reconhecida',
  no_plate: 'nenhuma placa encontrada',
  low_confidence: 'confiança abaixo do limite',
  timeout: 'timeout na API',
  error: 'erro na API',
  rate_limited: 'limite de uso atingido',
};

const CAMERA_ERROR_LABELS: Record<CameraErrorKind, string> = {
  offline: 'Câmera offline',
  snapshot_failed: 'Falha ao capturar imagem da câmera',
  sync_failed: 'Falha ao sincronizar câmera',
  stream_failed: 'Falha no streaming da câmera',
};

const MOVEMENT_DIRECTION: Record<MovementType, string> = {
  entry: 'entrada',
  exit: 'saída',
};

function truncate(value: string, max = 500): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function errorMessageOf(error: unknown): string {
  if (error instanceof Error) return truncate(error.message);
  if (typeof error === 'string') return truncate(error);
  try {
    return truncate(JSON.stringify(error));
  } catch {
    return 'Erro desconhecido';
  }
}

export function buildMovementNotification(params: {
  companyId: string;
  movementId: string;
  pointId: string | null;
  pointName: string | null;
  cameraId: string | null;
  movementType: MovementType;
  status: MovementStatus;
  autoRegistered: boolean;
  plate: string | null;
  action: MovementAction;
  occurredAt?: Date;
}): MovementRegisteredEvent {
  const direction = MOVEMENT_DIRECTION[params.movementType];
  const plateLabel = params.plate ?? 'não reconhecida';
  const pointLabel = params.pointName ? ` no ponto ${params.pointName}` : '';
  const originLabel = params.autoRegistered ? ' (automático)' : '';

  const title =
    params.action === 'recalculated'
      ? 'Movimento confirmado após revisão'
      : params.action === 'discarded'
        ? 'Movimento descartado'
        : params.status === 'pending_review'
          ? 'Movimento aguardando revisão'
          : `Movimento de ${direction} registrado`;

  const body =
    params.action === 'discarded'
      ? `Leitura da placa ${plateLabel}${pointLabel} foi descartada`
      : `Placa ${plateLabel}${pointLabel}${originLabel}`;

  const severity =
    params.action === 'discarded' || params.status === 'pending_review' ? 'warning' : 'info';

  return {
    type: 'movement.registered',
    companyId: params.companyId,
    severity,
    title,
    body,
    payload: {
      movementId: params.movementId,
      pointId: params.pointId,
      pointName: params.pointName,
      cameraId: params.cameraId,
      movementType: params.movementType,
      status: params.status,
      autoRegistered: params.autoRegistered,
      plate: params.plate,
      action: params.action,
      occurredAt: (params.occurredAt ?? new Date()).toISOString(),
    },
    resourceType: 'movement',
    resourceId: params.movementId,
    pointId: params.pointId,
    cameraId: params.cameraId,
    occurredAt: params.occurredAt ?? new Date(),
    dedupeKey: `movement.registered:${params.movementId}:${params.action}`,
    dedupeWindowSeconds: 0,
  };
}

export function buildExternalApiNotification(params: {
  companyId: string;
  interactionId: string | null;
  provider: string;
  outcome: ExternalOutcome;
  pointId: string | null;
  cameraId: string | null;
  cameraName?: string | null;
  latencyMs: number | null;
  httpStatus: number | null;
  errorMessage: string | null;
  occurredAt?: Date;
}): ExternalApiUsageEvent {
  const isProblem = ['error', 'timeout', 'rate_limited'].includes(params.outcome);
  const severity = params.outcome === 'rate_limited' ? 'warning' : isProblem ? 'error' : 'info';
  const title = isProblem
    ? `Falha na API externa (${params.provider})`
    : `API externa utilizada (${params.provider})`;

  const details = [
    OUTCOME_LABELS[params.outcome],
    params.cameraName ? `câmera ${params.cameraName}` : null,
    params.httpStatus ? `HTTP ${params.httpStatus}` : null,
    params.latencyMs !== null ? `${params.latencyMs} ms` : null,
    params.errorMessage,
  ].filter((part): part is string => Boolean(part));

  return {
    type: 'external_api.usage',
    companyId: params.companyId,
    severity,
    title,
    body: truncate(details.join(' · ')),
    payload: {
      interactionId: params.interactionId,
      provider: params.provider,
      outcome: params.outcome,
      pointId: params.pointId,
      cameraId: params.cameraId,
      latencyMs: params.latencyMs,
      httpStatus: params.httpStatus,
      errorMessage: params.errorMessage,
      occurredAt: (params.occurredAt ?? new Date()).toISOString(),
    },
    resourceType: 'external_interaction',
    resourceId: params.interactionId,
    pointId: params.pointId,
    cameraId: params.cameraId,
    occurredAt: params.occurredAt ?? new Date(),
  };
}

export function buildCameraErrorNotification(params: {
  companyId: string;
  cameraId: string | null;
  cameraName: string | null;
  pointId: string | null;
  kind: CameraErrorKind;
  error?: unknown;
  occurredAt?: Date;
}): CameraErrorEvent {
  const message = params.error === undefined ? null : errorMessageOf(params.error);
  const severity = params.kind === 'offline' ? 'critical' : 'error';

  return {
    type: 'camera.error',
    companyId: params.companyId,
    severity,
    title: CAMERA_ERROR_LABELS[params.kind],
    body: [params.cameraName ? `Câmera ${params.cameraName}` : 'Câmera', message]
      .filter((part): part is string => Boolean(part))
      .join(': '),
    payload: {
      cameraId: params.cameraId,
      cameraName: params.cameraName,
      pointId: params.pointId,
      kind: params.kind,
      errorMessage: message,
      occurredAt: (params.occurredAt ?? new Date()).toISOString(),
    },
    resourceType: 'camera',
    resourceId: params.cameraId,
    pointId: params.pointId,
    cameraId: params.cameraId,
    occurredAt: params.occurredAt ?? new Date(),
  };
}

export function buildSystemErrorNotification(params: {
  companyId?: string | null;
  source: string;
  statusCode?: number | null;
  message: string;
  path?: string | null;
  occurredAt?: Date;
}): SystemErrorEvent {
  return {
    type: 'system.error',
    companyId: params.companyId ?? null,
    severity: params.statusCode && params.statusCode >= 500 ? 'error' : 'warning',
    title: `Erro no sistema (${params.source})`,
    body: truncate(params.message),
    payload: {
      source: params.source,
      statusCode: params.statusCode ?? null,
      message: truncate(params.message),
      path: params.path ?? null,
      occurredAt: (params.occurredAt ?? new Date()).toISOString(),
    },
    resourceType: 'system',
    resourceId: null,
    pointId: null,
    cameraId: null,
    occurredAt: params.occurredAt ?? new Date(),
  };
}
