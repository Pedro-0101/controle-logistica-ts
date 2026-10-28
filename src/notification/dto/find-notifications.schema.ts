import { z } from 'zod';
import { createZodDto } from 'zod-nest';
import { paginationSchema } from '../../common/pagination.schema.js';
import {
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_SEVERITIES,
} from '../notification-events.js';

export const findNotificationsSchema = z
  .object({
    ...paginationSchema.shape,
    unreadOnly: z.coerce.boolean().optional().meta({
      description: 'Retornar apenas notificações não lidas',
      examples: [true],
    }),
    eventType: z.enum(NOTIFICATION_EVENT_TYPES).optional().meta({
      description: 'Filtrar por tipo de evento',
      examples: ['movement.registered'],
    }),
    severity: z.enum(NOTIFICATION_SEVERITIES).optional().meta({
      description: 'Filtrar por severidade',
      examples: ['error'],
    }),
    dateFrom: z.iso.datetime().optional().meta({
      description: 'Data/hora inicial (ISO 8601)',
      examples: ['2026-10-01T00:00:00.000Z'],
    }),
    dateTo: z.iso.datetime().optional().meta({
      description: 'Data/hora final (ISO 8601)',
      examples: ['2026-10-31T23:59:59.999Z'],
    }),
  })
  .meta({ id: 'FindNotificationsDto' });

export class FindNotificationsDto extends createZodDto(findNotificationsSchema) {}

export type FindNotificationsDtoType = z.infer<typeof findNotificationsSchema>;
