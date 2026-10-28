import { z } from 'zod';
import { createZodDto } from 'zod-nest';
import {
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_SEVERITIES,
} from '../notification-events.js';

const filtersRecordSchema = z.record(z.string(), z.unknown());

export const notificationItemSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid().nullable(),
    userId: z.string().uuid(),
    eventType: z.enum(NOTIFICATION_EVENT_TYPES),
    severity: z.enum(NOTIFICATION_SEVERITIES),
    title: z.string(),
    body: z.string(),
    payload: z.record(z.string(), z.unknown()),
    resourceType: z.string().nullable(),
    resourceId: z.string().uuid().nullable(),
    pointId: z.string().uuid().nullable(),
    cameraId: z.string().uuid().nullable(),
    readAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .meta({ id: 'NotificationItemDto' });

export const paginatedNotificationsResponseSchema = z
  .object({
    data: z.array(notificationItemSchema),
    meta: z.object({
      page: z.number().int(),
      limit: z.number().int(),
      total: z.number().int(),
      totalPages: z.number().int(),
    }),
  })
  .meta({ id: 'PaginatedNotificationsResponse' });

export const unreadCountResponseSchema = z
  .object({ count: z.number().int().min(0) })
  .meta({ id: 'UnreadNotificationsCount' });

export const markAllReadResponseSchema = z
  .object({ updated: z.number().int().min(0) })
  .meta({ id: 'MarkAllNotificationsReadResponse' });

export const notificationFilterOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export const notificationFilterDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  kind: z.enum(['points', 'cameras', 'options', 'boolean']),
  options: z.array(notificationFilterOptionSchema).optional(),
  multiple: z.boolean().optional(),
});

export const notificationEventCatalogSchema = z
  .object({
    type: z.enum(NOTIFICATION_EVENT_TYPES),
    label: z.string(),
    description: z.string(),
    defaultEnabled: z.boolean(),
    defaultFilters: filtersRecordSchema,
    dedupeWindowSeconds: z.number().int().min(0),
    filters: z.array(notificationFilterDefinitionSchema),
  })
  .meta({ id: 'NotificationEventDefinition' });

export const notificationCatalogResponseSchema = z
  .object({ events: z.array(notificationEventCatalogSchema) })
  .meta({ id: 'NotificationCatalogResponse' });

export const filterPointSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
});

export const filterCameraSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  pointId: z.string().uuid(),
});

export const availableFiltersSchema = z.object({
  points: z.array(filterPointSchema),
  cameras: z.array(filterCameraSchema),
});

export const notificationPreferenceItemSchema = z
  .object({
    eventType: z.enum(NOTIFICATION_EVENT_TYPES),
    enabled: z.boolean(),
    filters: filtersRecordSchema,
    source: z.enum(['user', 'company', 'catalog']),
    override: z
      .object({
        enabled: z.boolean().nullable(),
        filters: filtersRecordSchema.nullable(),
      })
      .nullable(),
    company: z
      .object({
        enabled: z.boolean(),
        defaultFilters: filtersRecordSchema.nullable(),
        allowUserOverride: z.boolean(),
      })
      .nullable(),
  })
  .meta({ id: 'NotificationPreferenceItem' });

export const notificationPreferencesResponseSchema = z
  .object({
    events: z.array(notificationPreferenceItemSchema),
    availableFilters: availableFiltersSchema,
  })
  .meta({ id: 'NotificationPreferencesResponse' });

export const companyNotificationSettingItemSchema = z
  .object({
    eventType: z.enum(NOTIFICATION_EVENT_TYPES),
    enabled: z.boolean(),
    defaultFilters: filtersRecordSchema.nullable(),
    allowUserOverride: z.boolean(),
    isDefault: z.boolean(),
  })
  .meta({ id: 'CompanyNotificationSettingItem' });

export const companyNotificationSettingsResponseSchema = z
  .object({
    companyId: z.string().uuid(),
    events: z.array(companyNotificationSettingItemSchema),
    availableFilters: availableFiltersSchema,
  })
  .meta({ id: 'CompanyNotificationSettingsResponse' });

export class NotificationItemDto extends createZodDto(notificationItemSchema) {}
export class PaginatedNotificationsResponseDto extends createZodDto(
  paginatedNotificationsResponseSchema,
) {}
export class UnreadCountResponseDto extends createZodDto(unreadCountResponseSchema) {}
export class MarkAllReadResponseDto extends createZodDto(markAllReadResponseSchema) {}
export class NotificationCatalogResponseDto extends createZodDto(
  notificationCatalogResponseSchema,
) {}
export class NotificationPreferencesResponseDto extends createZodDto(
  notificationPreferencesResponseSchema,
) {}
export class CompanyNotificationSettingsResponseDto extends createZodDto(
  companyNotificationSettingsResponseSchema,
) {}
