import {
  getNotificationEventDefinition,
  mergeNotificationFilters,
  safeParseNotificationFilters,
  type NotificationEventType,
  type NotificationFilters,
} from './notification-events.js';

export interface CompanyNotificationPreferenceSource {
  enabled: boolean;
  defaultFilters: unknown;
  allowUserOverride: boolean;
}

export interface UserNotificationPreferenceSource {
  enabled: boolean | null;
  filters: unknown;
}

export interface ResolvedNotificationPreference {
  enabled: boolean;
  filters: NotificationFilters;
  source: 'user' | 'company' | 'catalog';
}

/**
 * Resolve a preferência efetiva de um usuário para um evento.
 *
 * Precedência: preferência do usuário > configuração da empresa > catálogo.
 * Quando a empresa desabilita a sobrescrita, os valores do usuário são ignorados.
 */
export function resolveNotificationPreference(
  type: NotificationEventType,
  company: CompanyNotificationPreferenceSource | null | undefined,
  user: UserNotificationPreferenceSource | null | undefined,
): ResolvedNotificationPreference {
  const definition = getNotificationEventDefinition(type);
  const allowOverride = company?.allowUserOverride !== false;

  const userEnabled = allowOverride ? user?.enabled ?? null : null;
  const userFilters = allowOverride ? user?.filters : null;

  const enabled = userEnabled ?? company?.enabled ?? definition.defaultEnabled;

  const merged = mergeNotificationFilters(
    definition.defaultFilters as Record<string, unknown>,
    company?.defaultFilters as Record<string, unknown> | null,
    userFilters as Record<string, unknown> | null,
  );
  const filters =
    safeParseNotificationFilters(type, merged) ??
    safeParseNotificationFilters(type, definition.defaultFilters) ??
    ({} as NotificationFilters);

  const source =
    userEnabled !== null || (allowOverride && user?.filters !== null && user?.filters !== undefined)
      ? 'user'
      : company
        ? 'company'
        : 'catalog';

  return { enabled, filters, source };
}
