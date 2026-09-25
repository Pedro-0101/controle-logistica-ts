import type { ExternalOutcome, FinalSource } from './entities/external-interaction.entity.js';

export interface RecordExternalInteractionInput {
  companyId: string;
  cameraId?: string | null;
  pointId?: string | null;
  observationId?: string | null;
  movementId?: string | null;
  provider: string;
  mode: string;
  outcome: ExternalOutcome;
  localPlate?: string | null;
  externalPlate?: string | null;
  finalPlate?: string | null;
  finalSource?: FinalSource | null;
  httpStatus?: number | null;
  errorMessage?: string | null;
  startedAt: Date;
  finishedAt?: Date | null;
  latencyMs?: number | null;
  requestBytes?: number | null;
  responseBytes?: number | null;
  billableUnits?: number;
}

export interface ExternalInteractionSummary {
  calls: number;
  success: number;
  noPlate: number;
  failures: number;
  externalUsed: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  totalCost: number | null;
  costCurrency: string;
}

export interface CompanyUsage {
  companyId: string;
  companyName: string | null;
  calls: number;
  success: number;
  noPlate: number;
  failures: number;
  avgLatencyMs: number | null;
  totalCost: number | null;
}
