import { z } from 'zod';

export const NOTIFICATION_EVENT_TYPES = [
  'movement.registered',
  'external_api.usage',
  'camera.error',
  'system.error',
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_SEVERITIES = ['info', 'warning', 'error', 'critical'] as const;

export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export type NotificationResourceType =
  | 'movement'
  | 'camera'
  | 'external_interaction'
  | 'system';

const uuidList = z.array(z.string().uuid()).optional();

export const movementRegisteredFiltersSchema = z
  .object({
    pointIds: uuidList,
    cameraIds: uuidList,
    movementTypes: z.array(z.enum(['entry', 'exit'])).optional(),
    statuses: z.array(z.enum(['open', 'closed', 'pending_review', 'discarded'])).optional(),
    autoRegistered: z.boolean().optional(),
  })
  .strict();

export const externalApiUsageFiltersSchema = z
  .object({
    pointIds: uuidList,
    cameraIds: uuidList,
    providers: z.array(z.string().min(1)).optional(),
    outcomes: z
      .array(z.enum(['success', 'no_plate', 'low_confidence', 'timeout', 'error', 'rate_limited']))
      .optional(),
  })
  .strict();

export const cameraErrorFiltersSchema = z
  .object({
    pointIds: uuidList,
    cameraIds: uuidList,
    kinds: z.array(z.enum(['offline', 'snapshot_failed', 'sync_failed', 'stream_failed'])).optional(),
  })
  .strict();

export const systemErrorFiltersSchema = z
  .object({
    sources: z.array(z.string().min(1)).optional(),
    severities: z.array(z.enum(NOTIFICATION_SEVERITIES)).optional(),
  })
  .strict();

export type MovementRegisteredFilters = z.infer<typeof movementRegisteredFiltersSchema>;
export type ExternalApiUsageFilters = z.infer<typeof externalApiUsageFiltersSchema>;
export type CameraErrorFilters = z.infer<typeof cameraErrorFiltersSchema>;
export type SystemErrorFilters = z.infer<typeof systemErrorFiltersSchema>;

export type NotificationFilters =
  | MovementRegisteredFilters
  | ExternalApiUsageFilters
  | CameraErrorFilters
  | SystemErrorFilters;

export type MovementType = 'entry' | 'exit';
export type MovementStatus = 'open' | 'closed' | 'pending_review' | 'discarded';
export type MovementAction = 'created' | 'recalculated' | 'discarded' | 'reconciled';
export type ExternalOutcome =
  | 'success'
  | 'no_plate'
  | 'low_confidence'
  | 'timeout'
  | 'error'
  | 'rate_limited';
export type CameraErrorKind = 'offline' | 'snapshot_failed' | 'sync_failed' | 'stream_failed';

export interface MovementRegisteredPayload {
  movementId: string;
  pointId: string | null;
  pointName: string | null;
  cameraId: string | null;
  movementType: MovementType;
  status: MovementStatus;
  autoRegistered: boolean;
  plate: string | null;
  action: MovementAction;
  occurredAt: string;
}

export interface ExternalApiUsagePayload {
  interactionId: string | null;
  provider: string;
  outcome: ExternalOutcome;
  pointId: string | null;
  cameraId: string | null;
  latencyMs: number | null;
  httpStatus: number | null;
  errorMessage: string | null;
  occurredAt: string;
}

export interface CameraErrorPayload {
  cameraId: string | null;
  cameraName: string | null;
  pointId: string | null;
  kind: CameraErrorKind;
  errorMessage: string | null;
  occurredAt: string;
}

export interface SystemErrorPayload {
  source: string;
  statusCode: number | null;
  message: string;
  path: string | null;
  occurredAt: string;
}

interface NotificationEventBase<TType extends NotificationEventType, TPayload> {
  type: TType;
  companyId: string | null;
  severity: NotificationSeverity;
  title: string;
  body: string;
  payload: TPayload;
  resourceType: NotificationResourceType;
  resourceId: string | null;
  pointId: string | null;
  cameraId: string | null;
  occurredAt: Date;
  dedupeKey?: string | null;
  dedupeWindowSeconds?: number;
}

export type MovementRegisteredEvent = NotificationEventBase<
  'movement.registered',
  MovementRegisteredPayload
>;
export type ExternalApiUsageEvent = NotificationEventBase<
  'external_api.usage',
  ExternalApiUsagePayload
>;
export type CameraErrorEvent = NotificationEventBase<'camera.error', CameraErrorPayload>;
export type SystemErrorEvent = NotificationEventBase<'system.error', SystemErrorPayload>;

export type NotificationEvent =
  | MovementRegisteredEvent
  | ExternalApiUsageEvent
  | CameraErrorEvent
  | SystemErrorEvent;

export interface NotificationFilterOption {
  value: string;
  label: string;
}

export type NotificationFilterDefinition =
  | { key: string; label: string; kind: 'points' | 'cameras' }
  | {
      key: string;
      label: string;
      kind: 'options';
      options: NotificationFilterOption[];
      multiple?: boolean;
    }
  | { key: string; label: string; kind: 'boolean' };

export interface NotificationEventDefinition {
  type: NotificationEventType;
  label: string;
  description: string;
  defaultEnabled: boolean;
  defaultFilters: NotificationFilters;
  dedupeWindowSeconds: number;
  filters: NotificationFilterDefinition[];
}

const movementStatusOptions: NotificationFilterOption[] = [
  { value: 'open', label: 'Registrado (aberto)' },
  { value: 'pending_review', label: 'Aguardando revisão' },
  { value: 'closed', label: 'Fechado' },
  { value: 'discarded', label: 'Descartado' },
];

const outcomeOptions: NotificationFilterOption[] = [
  { value: 'success', label: 'Sucesso' },
  { value: 'no_plate', label: 'Sem placa' },
  { value: 'low_confidence', label: 'Baixa confiança' },
  { value: 'timeout', label: 'Timeout' },
  { value: 'error', label: 'Erro' },
  { value: 'rate_limited', label: 'Limite de uso' },
];

const cameraErrorKindOptions: NotificationFilterOption[] = [
  { value: 'offline', label: 'Câmera offline' },
  { value: 'snapshot_failed', label: 'Falha ao capturar imagem' },
  { value: 'sync_failed', label: 'Falha de sincronização' },
  { value: 'stream_failed', label: 'Falha de streaming' },
];

export const NOTIFICATION_EVENT_CATALOG: readonly NotificationEventDefinition[] = [
  {
    type: 'movement.registered',
    label: 'Movimentos registrados',
    description:
      'Notifica quando um movimento é registrado (manual ou automático), incluindo pendências de revisão.',
    defaultEnabled: true,
    defaultFilters: { statuses: ['pending_review'] },
    dedupeWindowSeconds: 0,
    filters: [
      { key: 'pointIds', label: 'Pontos', kind: 'points' },
      { key: 'cameraIds', label: 'Câmeras', kind: 'cameras' },
      {
        key: 'movementTypes',
        label: 'Tipo de movimento',
        kind: 'options',
        options: [
          { value: 'entry', label: 'Entrada' },
          { value: 'exit', label: 'Saída' },
        ],
      },
      {
        key: 'statuses',
        label: 'Status',
        kind: 'options',
        options: movementStatusOptions,
      },
      { key: 'autoRegistered', label: 'Somente automáticos (ANPR)', kind: 'boolean' },
    ],
  },
  {
    type: 'external_api.usage',
    label: 'Uso de API externa',
    description:
      'Notifica chamadas às APIs externas de reconhecimento, com filtro por resultado para alertar apenas falhas.',
    defaultEnabled: true,
    defaultFilters: { outcomes: ['error', 'timeout', 'rate_limited'] },
    dedupeWindowSeconds: 300,
    filters: [
      { key: 'pointIds', label: 'Pontos', kind: 'points' },
      { key: 'cameraIds', label: 'Câmeras', kind: 'cameras' },
      {
        key: 'providers',
        label: 'Providers',
        kind: 'options',
        options: [{ value: 'google_vision', label: 'Google Vision' }],
      },
      { key: 'outcomes', label: 'Resultado', kind: 'options', options: outcomeOptions },
    ],
  },
  {
    type: 'camera.error',
    label: 'Erros de câmera',
    description:
      'Notifica câmeras offline, falhas de captura de snapshot, sincronização e streaming.',
    defaultEnabled: true,
    defaultFilters: {},
    dedupeWindowSeconds: 900,
    filters: [
      { key: 'pointIds', label: 'Pontos', kind: 'points' },
      { key: 'cameraIds', label: 'Câmeras', kind: 'cameras' },
      { key: 'kinds', label: 'Tipo de erro', kind: 'options', options: cameraErrorKindOptions },
    ],
  },
  {
    type: 'system.error',
    label: 'Outros erros do sistema',
    description: 'Notifica erros HTTP 5xx e falhas inesperadas do backend.',
    defaultEnabled: true,
    defaultFilters: {},
    dedupeWindowSeconds: 300,
    filters: [
      {
        key: 'sources',
        label: 'Origem',
        kind: 'options',
        options: [
          { value: 'http', label: 'API HTTP' },
          { value: 'database', label: 'Banco de dados' },
          { value: 'monitoring.sync', label: 'Sincronização do monitoramento' },
          { value: 'monitoring.mediamtx', label: 'MediaMTX' },
        ],
      },
      {
        key: 'severities',
        label: 'Severidade',
        kind: 'options',
        options: NOTIFICATION_SEVERITIES.map((severity) => ({
          value: severity,
          label: severity,
        })),
      },
    ],
  },
];

const DEFINITION_BY_TYPE = new Map<NotificationEventType, NotificationEventDefinition>(
  NOTIFICATION_EVENT_CATALOG.map((definition) => [definition.type, definition]),
);

const FILTER_SCHEMA_BY_TYPE: Record<NotificationEventType, z.ZodTypeAny> = {
  'movement.registered': movementRegisteredFiltersSchema,
  'external_api.usage': externalApiUsageFiltersSchema,
  'camera.error': cameraErrorFiltersSchema,
  'system.error': systemErrorFiltersSchema,
};

export function isNotificationEventType(value: string): value is NotificationEventType {
  return NOTIFICATION_EVENT_TYPES.includes(value as NotificationEventType);
}

export function getNotificationEventDefinition(
  type: NotificationEventType,
): NotificationEventDefinition {
  return DEFINITION_BY_TYPE.get(type) ?? NOTIFICATION_EVENT_CATALOG[0];
}

export function safeParseNotificationFilters(
  type: NotificationEventType,
  value: unknown,
): NotificationFilters | null {
  if (value === null || value === undefined) return null;
  const result = FILTER_SCHEMA_BY_TYPE[type].safeParse(value);
  return result.success ? (result.data as NotificationFilters) : null;
}

/**
 * Mescla filtros em ordem crescente de precedência: catálogo, empresa, usuário.
 * Chaves ausentes/`undefined` não sobrescrevem; arrays vazios são explícitos e
 * significam "todos" (o matcher ignora listas vazias).
 */
export function mergeNotificationFilters(
  ...sources: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined) merged[key] = value;
    }
  }
  return merged;
}

export function notificationFiltersFor(
  type: NotificationEventType,
  filters: NotificationFilters | null | undefined,
): Record<string, unknown> | null {
  if (!filters) return null;
  const parsed = safeParseNotificationFilters(type, filters);
  return parsed as Record<string, unknown> | null;
}
