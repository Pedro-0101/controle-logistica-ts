import { z } from 'zod';
import { createZodDto } from 'zod-nest';

const rangeSchema = z
  .object({
    dateFrom: z.iso.datetime().meta({ examples: ['2026-09-01T00:00:00.000Z'] }),
    dateTo: z.iso.datetime().meta({ examples: ['2026-09-08T00:00:00.000Z'] }),
  })
  .meta({ description: 'Período analisado.' });

const vehicleRefSchema = z
  .object({
    id: z.string().meta({ examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'] }),
    plate: z.string().meta({ examples: ['ABC1D23'] }),
    code: z.string().meta({ examples: ['VEH-001'] }),
    type: z.string().meta({ examples: ['own'] }),
  })
  .meta({ description: 'Veículo da frota própria.' });

const routeBaselineSchema = z
  .object({
    avgMinutes: z.number().int(),
    p95Minutes: z.number().int(),
    sampleCount: z.number().int(),
  })
  .meta({ description: 'Baseline histórico da rota (média/p95 em minutos).' });

const dwellSegmentSchema = z.object({
  kind: z.literal('dwell'),
  unitId: z.string(),
  unitName: z.string().nullable(),
  entryMovementId: z.string(),
  entryPointId: z.string().nullable(),
  entryPointName: z.string().nullable(),
  entryAt: z.iso.datetime(),
  exitMovementId: z.string().nullable(),
  exitPointId: z.string().nullable(),
  exitPointName: z.string().nullable(),
  exitAt: z.iso.datetime().nullable(),
  minutes: z.number().int().nullable(),
  ongoing: z.boolean(),
  inJourneyWindow: z.boolean(),
  anomaly: z.enum(['missing_exit']).nullable(),
});

const transitSegmentSchema = z.object({
  kind: z.literal('transit'),
  originUnitId: z.string(),
  originUnitName: z.string().nullable(),
  destinationUnitId: z.string().nullable(),
  destinationUnitName: z.string().nullable(),
  departedMovementId: z.string(),
  departedAt: z.iso.datetime(),
  arrivedMovementId: z.string().nullable(),
  arrivedAt: z.iso.datetime().nullable(),
  minutes: z.number().int().nullable(),
  ongoing: z.boolean(),
  inJourneyWindow: z.boolean(),
  overnight: z.boolean(),
  anomaly: z.enum(['missing_arrival']).nullable(),
  baseline: routeBaselineSchema.nullable(),
  deviationPct: z.number().int().nullable(),
});

const vehicleTimelineSchema = z.object({
  vehicle: vehicleRefSchema,
  segments: z.array(z.union([dwellSegmentSchema, transitSegmentSchema])),
  summary: z.object({
    dwellCount: z.number().int(),
    transitCount: z.number().int(),
    totalDwellMinutes: z.number().int(),
    totalTransitMinutes: z.number().int(),
    currentState: z.enum(['at_unit', 'in_transit', 'unknown']),
    currentUnitId: z.string().nullable(),
    currentSince: z.iso.datetime().nullable(),
    currentMinutes: z.number().int().nullable(),
  }),
});

export const vehicleTimelineResponseSchema = z
  .object({
    range: rangeSchema,
    vehicles: z.array(vehicleTimelineSchema),
  })
  .meta({ id: 'VehicleTimelineResponseDto' });

export const fleetStatusResponseSchema = z
  .object({
    generatedAt: z.iso.datetime(),
    atUnits: z.array(
      z.object({
        unitId: z.string(),
        unitName: z.string().nullable(),
        vehicles: z.array(
          z.object({
            vehicle: vehicleRefSchema,
            entryMovementId: z.string().nullable(),
            since: z.iso.datetime().nullable(),
            dwellMinutes: z.number().int().nullable(),
            inJourneyWindow: z.boolean(),
          }),
        ),
      }),
    ),
    inTransit: z.array(
      z.object({
        vehicle: vehicleRefSchema,
        since: z.iso.datetime().nullable(),
        minutes: z.number().int().nullable(),
      }),
    ),
    unknown: z.array(z.object({ vehicle: vehicleRefSchema })),
  })
  .meta({ id: 'FleetStatusResponseDto' });

const durationStatsSchema = z.object({
  visits: z.number().int(),
  completed: z.number().int(),
  avgMinutes: z.number().int(),
  medianMinutes: z.number().int(),
  p95Minutes: z.number().int(),
  minMinutes: z.number().int(),
  maxMinutes: z.number().int(),
});

export const dwellReportResponseSchema = z
  .object({
    range: rangeSchema,
    byVehicle: z.array(
      z.object({ vehicle: vehicleRefSchema }).and(durationStatsSchema),
    ),
    byUnit: z.array(
      z
        .object({ unitId: z.string(), unitName: z.string().nullable() })
        .and(durationStatsSchema),
    ),
  })
  .meta({ id: 'DwellReportResponseDto' });

export const transitReportResponseSchema = z
  .object({
    range: rangeSchema,
    routes: z.array(
      z
        .object({
          originUnitId: z.string(),
          originUnitName: z.string().nullable(),
          destinationUnitId: z.string().nullable(),
          destinationUnitName: z.string().nullable(),
        })
        .and(durationStatsSchema),
    ),
  })
  .meta({ id: 'TransitReportResponseDto' });

export const utilizationReportResponseSchema = z
  .object({
    range: rangeSchema,
    totals: z.object({
      rangeMinutes: z.number().int(),
      dwellMinutes: z.number().int(),
      transitMinutes: z.number().int(),
    }),
    byVehicle: z.array(
      z.object({
        vehicle: vehicleRefSchema,
        rangeMinutes: z.number().int(),
        dwellMinutes: z.number().int(),
        transitMinutes: z.number().int(),
        unaccountedMinutes: z.number().int(),
        dwellPct: z.number().int(),
        transitPct: z.number().int(),
      }),
    ),
  })
  .meta({ id: 'UtilizationReportResponseDto' });

const dwellExceptionSchema = z.object({
  vehicle: vehicleRefSchema.nullable(),
  anomaly: z.enum(['open_too_long', 'missing_exit']),
  unitId: z.string(),
  unitName: z.string().nullable(),
  entryMovementId: z.string(),
  entryAt: z.iso.datetime(),
  exitMovementId: z.string().nullable(),
  minutes: z.number().int().nullable(),
  ongoing: z.boolean(),
});

const transitExceptionSchema = z.object({
  vehicle: vehicleRefSchema.nullable(),
  anomaly: z.enum(['missing_arrival', 'above_p95', 'overnight']),
  originUnitId: z.string(),
  originUnitName: z.string().nullable(),
  destinationUnitId: z.string().nullable(),
  destinationUnitName: z.string().nullable(),
  departedMovementId: z.string(),
  departedAt: z.iso.datetime(),
  minutes: z.number().int().nullable(),
  baseline: routeBaselineSchema.nullable(),
  deviationPct: z.number().int().nullable(),
  ongoing: z.boolean(),
});

export const exceptionsResponseSchema = z
  .object({
    range: rangeSchema,
    summary: z.object({
      openTooLong: z.number().int(),
      missingExit: z.number().int(),
      missingArrival: z.number().int(),
      aboveBaseline: z.number().int(),
      overnight: z.number().int(),
    }),
    openTooLong: z.array(dwellExceptionSchema),
    missingExit: z.array(dwellExceptionSchema),
    missingArrival: z.array(transitExceptionSchema),
    aboveBaseline: z.array(transitExceptionSchema),
    overnight: z.array(transitExceptionSchema),
  })
  .meta({ id: 'ExceptionsResponseDto' });

export const movementBookResponseSchema = z
  .object({
    range: rangeSchema,
    data: z.array(
      z.object({
        movementId: z.string(),
        dateTime: z.iso.datetime(),
        vehicleId: z.string(),
        vehiclePlate: z.string(),
        vehicleCode: z.string(),
        type: z.enum(['entry', 'exit']),
        unitId: z.string(),
        unitName: z.string().nullable(),
        pointId: z.string().nullable(),
        pointName: z.string().nullable(),
        driverName: z.string().nullable(),
        purpose: z.string().nullable(),
        status: z.string(),
        kind: z.enum(['dwell', 'transit']).nullable(),
        minutes: z.number().int().nullable(),
        ongoing: z.boolean(),
        originUnitName: z.string().nullable(),
        destinationUnitName: z.string().nullable(),
        anomaly: z.string().nullable(),
      }),
    ),
    summary: z.object({
      movements: z.number().int(),
      dwellMinutes: z.number().int(),
      transitMinutes: z.number().int(),
      anomalies: z.number().int(),
    }),
  })
  .meta({ id: 'MovementBookResponseDto' });

export class VehicleTimelineResponseDto extends createZodDto(vehicleTimelineResponseSchema) {}
export class FleetStatusResponseDto extends createZodDto(fleetStatusResponseSchema) {}
export class DwellReportResponseDto extends createZodDto(dwellReportResponseSchema) {}
export class TransitReportResponseDto extends createZodDto(transitReportResponseSchema) {}
export class UtilizationReportResponseDto extends createZodDto(utilizationReportResponseSchema) {}
export class ExceptionsResponseDto extends createZodDto(exceptionsResponseSchema) {}
export class MovementBookResponseDto extends createZodDto(movementBookResponseSchema) {}
