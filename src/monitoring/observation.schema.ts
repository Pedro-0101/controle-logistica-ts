import { z } from 'zod';
export const plateSchema = z.string().regex(/^[A-Z]{3}\d[A-Z0-9]\d{2}$/);
export const observationSchema = z.object({
  cameraId: z.string().uuid(),
  status: z.enum(['waiting', 'candidate', 'confirmed', 'stale', 'offline']),
  observationId: z.string().uuid().nullable(),
  placa: plateSchema.nullable(),
  confianca: z.number().min(0).max(1).nullable(),
  capturedAt: z.iso.datetime({ offset: true }).nullable(),
  lastSeenAt: z.iso.datetime({ offset: true }).nullable(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  consecutiveReads: z.number().int().nonnegative(),
  box: z.array(z.number().finite()).length(4).nullable(),
}).superRefine((v, ctx) => {
  if (v.status === 'confirmed' && (!v.observationId || !v.placa || v.confianca === null ||
    !v.capturedAt || !v.lastSeenAt || !v.expiresAt || v.consecutiveReads < 1 ||
    Date.parse(v.expiresAt) <= Date.parse(v.lastSeenAt))) {
    ctx.addIssue({ code: 'custom', message: 'Observação confirmada incompleta' });
  }
});
export type CurrentObservation = z.infer<typeof observationSchema>;
