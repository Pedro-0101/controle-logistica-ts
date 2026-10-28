import type {
  CameraErrorFilters,
  ExternalApiUsageFilters,
  MovementRegisteredFilters,
  NotificationEvent,
  NotificationFilters,
  SystemErrorFilters,
} from './notification-events.js';

function matchesList<T>(allowed: readonly T[] | undefined, value: T | null | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  if (value === null || value === undefined) return false;
  return allowed.includes(value);
}

/**
 * Verifica se um evento atende aos filtros efetivos de um usuário.
 * Listas ausentes ou vazias significam "todos". O casamento é sempre por
 * interseção (`evento ∈ filtro`).
 */
export function matchesNotificationFilters(
  event: NotificationEvent,
  filters: NotificationFilters | null | undefined,
): boolean {
  if (!filters) return true;

  switch (event.type) {
    case 'movement.registered': {
      const filter = filters as MovementRegisteredFilters;
      const payload = event.payload;
      return (
        matchesList(filter.pointIds, payload.pointId) &&
        matchesList(filter.cameraIds, payload.cameraId) &&
        matchesList(filter.movementTypes, payload.movementType) &&
        matchesList(filter.statuses, payload.status) &&
        (filter.autoRegistered === undefined ||
          filter.autoRegistered === payload.autoRegistered)
      );
    }
    case 'external_api.usage': {
      const filter = filters as ExternalApiUsageFilters;
      const payload = event.payload;
      return (
        matchesList(filter.pointIds, payload.pointId) &&
        matchesList(filter.cameraIds, payload.cameraId) &&
        matchesList(filter.providers, payload.provider) &&
        matchesList(filter.outcomes, payload.outcome)
      );
    }
    case 'camera.error': {
      const filter = filters as CameraErrorFilters;
      const payload = event.payload;
      return (
        matchesList(filter.pointIds, payload.pointId) &&
        matchesList(filter.cameraIds, payload.cameraId) &&
        matchesList(filter.kinds, payload.kind)
      );
    }
    case 'system.error': {
      const filter = filters as SystemErrorFilters;
      return (
        matchesList(filter.sources, event.payload.source) &&
        matchesList(filter.severities, event.severity)
      );
    }
  }
}
