import { z } from 'zod';
import { createZodDto } from 'zod-nest';
import { NOTIFICATION_EVENT_TYPES } from '../notification-events.js';

export const updateNotificationPreferenceItemSchema = z
  .object({
    eventType: z.enum(NOTIFICATION_EVENT_TYPES),
    enabled: z.boolean().nullable().optional().meta({
      description: 'true/false para sobrescrever; null para herdar da empresa',
    }),
    filters: z.record(z.string(), z.unknown()).nullable().optional().meta({
      description: 'Filtros do evento; null para herdar os defaults da empresa',
    }),
  })
  .strict();

export const updateNotificationPreferencesSchema = z
  .object({
    items: z.array(updateNotificationPreferenceItemSchema).min(1).max(10),
  })
  .strict()
  .meta({ id: 'UpdateNotificationPreferencesDto' });

export class UpdateNotificationPreferencesDto extends createZodDto(
  updateNotificationPreferencesSchema,
) {}

export type UpdateNotificationPreferencesDtoType = z.infer<
  typeof updateNotificationPreferencesSchema
>;
