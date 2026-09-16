import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const externalInteractionSchema = z
  .object({
    id: z.string().meta({
      description: 'UUID da interação',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    companyId: z.string().meta({
      description: 'UUID da empresa',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    cameraId: z.string().nullable().meta({
      description: 'UUID da câmera que disparou a chamada',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    pointId: z.string().nullable().meta({
      description: 'UUID do ponto associado',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    observationId: z.string().nullable().meta({
      description: 'UUID da observação ANPR',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    movementId: z.string().nullable().meta({
      description: 'UUID do movimento gerado (quando houver)',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    provider: z.string().meta({
      description: 'Provider externo utilizado',
      examples: ['google_vision'],
    }),
    mode: z.enum(['local', 'verified', 'external']).meta({
      description: 'Modo de reconhecimento vigente',
      examples: ['verified'],
    }),
    localPlate: z.string().nullable().meta({
      description: 'Placa lida pelo OCR local',
      examples: ['ABC1D23'],
    }),
    externalPlate: z.string().nullable().meta({
      description: 'Placa retornada pela API externa',
      examples: ['ABC1D23'],
    }),
    finalPlate: z.string().nullable().meta({
      description: 'Placa usada para criar o movimento',
      examples: ['ABC1D23'],
    }),
    finalSource: z.enum(['external', 'local', 'local_fallback', 'none']).nullable().meta({
      description: 'Origem da placa final',
      examples: ['external'],
    }),
    outcome: z.enum(['success', 'no_plate', 'low_confidence', 'timeout', 'error', 'rate_limited']).meta({
      description: 'Resultado da chamada',
      examples: ['success'],
    }),
    httpStatus: z.number().int().nullable().meta({
      description: 'Status HTTP retornado pela API externa',
      examples: [200],
    }),
    errorMessage: z.string().nullable().meta({
      description: 'Detalhe do erro (quando houver)',
      examples: ['Tempo de resposta da API externa excedido'],
    }),
    startedAt: z.iso.datetime().meta({
      description: 'Início da chamada',
      examples: ['2026-08-29T12:00:00.000Z'],
    }),
    finishedAt: z.iso.datetime().nullable().meta({
      description: 'Fim da chamada',
      examples: ['2026-08-29T12:00:01.000Z'],
    }),
    latencyMs: z.number().int().nullable().meta({
      description: 'Tempo total de resposta em milissegundos',
      examples: [850],
    }),
    billableUnits: z.number().int().meta({
      description: 'Unidades cobráveis da chamada (ex.: imagens)',
      examples: [1],
    }),
    unitCost: z.number().nullable().meta({
      description: 'Custo estimado por unidade',
      examples: [0.0015],
    }),
    costAmount: z.number().nullable().meta({
      description: 'Custo estimado total da chamada',
      examples: [0.0015],
    }),
    costCurrency: z.string().meta({
      description: 'Moeda do custo',
      examples: ['USD'],
    }),
    requestBytes: z.number().int().nullable().meta({
      description: 'Tamanho do corpo enviado',
      examples: [2048],
    }),
    responseBytes: z.number().int().nullable().meta({
      description: 'Tamanho da resposta recebida',
      examples: [512],
    }),
    createdAt: z.iso.datetime().meta({
      description: 'Data/hora do registro',
      examples: ['2026-08-29T12:00:01.000Z'],
    }),
  })
  .meta({ id: 'ExternalInteractionDto' });

export class ExternalInteractionDto extends createZodDto(externalInteractionSchema) {}

export const externalInteractionSummarySchema = z
  .object({
    calls: z.number().int().meta({ description: 'Total de chamadas no período', examples: [120] }),
    success: z.number().int().meta({ description: 'Chamadas com placa aceita', examples: [110] }),
    noPlate: z.number().int().meta({ description: 'Chamadas sem placa ou abaixo do mínimo', examples: [5] }),
    failures: z.number().int().meta({ description: 'Chamadas com timeout/erro', examples: [5] }),
    externalUsed: z.number().int().meta({ description: 'Movimentos com placa final externa', examples: [108] }),
    avgLatencyMs: z.number().nullable().meta({ description: 'Latência média (ms)', examples: [820] }),
    p95LatencyMs: z.number().nullable().meta({ description: 'Latência p95 (ms)', examples: [1500] }),
    totalCost: z.number().nullable().meta({ description: 'Custo total estimado', examples: [0.18] }),
    costCurrency: z.string().meta({ description: 'Moeda do custo', examples: ['USD'] }),
  })
  .meta({ id: 'ExternalInteractionSummaryDto' });

export class ExternalInteractionSummaryDto extends createZodDto(externalInteractionSummarySchema) {}

export const paginatedExternalInteractionsSchema = z
  .object({
    data: z.array(externalInteractionSchema),
    meta: z.object({
      page: z.number().int(),
      limit: z.number().int(),
      total: z.number().int(),
      totalPages: z.number().int(),
    }),
    summary: externalInteractionSummarySchema,
  })
  .meta({ id: 'PaginatedExternalInteractionsDto' });

export class PaginatedExternalInteractionsDto extends createZodDto(
  paginatedExternalInteractionsSchema,
) {}

export const companyUsageSchema = z
  .object({
    companyId: z.string().meta({
      description: 'UUID da empresa',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    companyName: z.string().nullable().meta({
      description: 'Nome fantasia da empresa',
      examples: ['Empresa XYZ Ltda'],
    }),
    calls: z.number().int().meta({ description: 'Total de chamadas', examples: [120] }),
    success: z.number().int().meta({ description: 'Chamadas com placa aceita', examples: [110] }),
    noPlate: z.number().int().meta({ description: 'Chamadas sem placa ou abaixo do mínimo', examples: [5] }),
    failures: z.number().int().meta({ description: 'Chamadas com timeout/erro', examples: [5] }),
    avgLatencyMs: z.number().nullable().meta({ description: 'Latência média (ms)', examples: [820] }),
    totalCost: z.number().nullable().meta({ description: 'Custo total estimado', examples: [0.18] }),
  })
  .meta({ id: 'CompanyUsageDto' });

export const externalInteractionUsageSchema = z
  .object({
    data: z.array(externalInteractionSchema).meta({
      description: 'Interações da página atual (todas as empresas)',
    }),
    meta: z.object({
      page: z.number().int(),
      limit: z.number().int(),
      total: z.number().int(),
      totalPages: z.number().int(),
    }),
    summary: externalInteractionSummarySchema,
    byCompany: z.array(companyUsageSchema).meta({
      description: 'Agregado por empresa, ordenado por volume de chamadas',
    }),
  })
  .meta({ id: 'ExternalInteractionUsageDto' });

export class ExternalInteractionUsageDto extends createZodDto(
  externalInteractionUsageSchema,
) {}
