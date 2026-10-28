import { z } from 'zod';
import { createZodDto } from 'zod-nest';
import { NOTIFICATION_EVENT_TYPES } from '../notification-events.js';

export const updateCompanyNotificationSettingItemSchema = z
  .object({
    eventType: z.enum(NOTIFICATION_EVENT_TYPES),
    enabled: z.boolean().optional().meta({
      description: 'Ativa/desativa o evento como padrão da empresa',
    }),
    defaultFilters: z.record(z.string(), z.unknown()).nullable().optional().meta({
      description: 'Filtros padrão aplicados a todos os usuários da empresa',
    }),
    allowUserOverride: z.boolean().optional().meta({
      description: 'Permite que usuários sobrescrevam os defaults da empresa',
    }),
  })
  .strict();

export const updateCompanyNotificationSettingsSchema = z
  .object({
    items: z.array(updateCompanyNotificationSettingItemSchema).min(1).max(10),
  })
  .strict()
  .meta({ id: 'UpdateCompanyNotificationSettingsDto' });

export class UpdateCompanyNotificationSettingsDto extends createZodDto(
  updateCompanyNotificationSettingsSchema,
) {}

export type UpdateCompanyNotificationSettingsDtoType = z.infer<
  typeof updateCompanyNotificationSettingsSchema
>;
