import { z } from 'zod';
import { createZodDto } from 'zod-nest';

/**
 * ## RecalculateMovementDto
 *
 * Schema de entrada para o endpoint `POST /movement/:id/recalculate`.
 *
 * **Antes de enviar este payload, o frontend deve:**
 * 1. Identificar se a placa lida estava errada ou se é um veículo novo
 * 2. Se o veículo NÃO existe: cadastrar via `POST /vehicle` e usar `vehicleId`
 * 3. Se o veículo existe com placa corrigida: usar `plate`
 *
 * **Regras:**
 * - Pelo menos um dos campos `plate` ou `vehicleId` deve ser informado
 * - Se ambos forem informados, `vehicleId` tem prioridade
 * - A placa deve estar no formato normalizado (ABC1D23 ou ABC1234, sem hífen)
 */
export const recalculateMovementSchema = z
  .object({
    plate: z.string().optional().meta({
      description: 'Placa corrigida do veículo (normalizada, sem hífen). O backend busca o veículo pelo DB. Se não encontrar, retorna 404.',
      examples: ['ABC1D23'],
    }),
    vehicleId: z.string().uuid().optional().meta({
      description: 'UUID do veículo já cadastrado na base de dados. Usar quando o veículo foi cadastrado recentemente via POST /vehicle.',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
  })
  .refine((data) => data.plate || data.vehicleId, {
    message: 'Informe a placa (plate) ou o ID do veículo (vehicleId) para recálculo',
  })
  .meta({
    id: 'RecalculateMovementDto',
    description:
      'Payload para recálculo de movimento pendente de revisão.\n\n' +
      'Duas opções de uso:\n\n' +
      '**Opção 1 — Correção de placa (veículo já existe):**\n' +
      '```json\n' +
      '{ "plate": "ABC1D24" }\n' +
      '```\n\n' +
      '**Opção 2 — Veículo recém-cadastrado:**\n' +
      '```json\n' +
      '{ "vehicleId": "d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b" }\n' +
      '```\n\n' +
      '**Requisito prévio:** O veículo com a placa correta ou o vehicleId informado devem existir e estar ativos no DB.',
  });

export class RecalculateMovementDto extends createZodDto(recalculateMovementSchema) {}
