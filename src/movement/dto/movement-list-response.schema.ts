import { z } from 'zod';
import { createZodDto } from 'zod-nest';

const pointSummarySchema = z
  .object({
    id: z.string().uuid().meta({ description: 'UUID do ponto', examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'] }),
    name: z.string().meta({ description: 'Nome do ponto (ex.: Portão 1)', examples: ['Portão 1'] }),
    code: z.string().meta({ description: 'Código identificador do ponto', examples: ['P-001'] }),
    type: z.enum(['entry', 'exit', 'both']).meta({ description: 'Tipo do ponto: entry, exit ou both', examples: ['entry'] }),
  })
  .nullable()
  .meta({ id: 'PointSummary', description: 'Resumo do ponto (portão/entrada) vinculado ao movimento.' });

const vehicleSummarySchema = z
  .object({
    id: z.string().uuid().meta({ description: 'UUID do veículo', examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'] }),
    plate: z.string().meta({ description: 'Placa do veículo', examples: ['ABC1D23'] }),
    code: z.string().meta({ description: 'Código identificador do veículo', examples: ['VEH-001'] }),
    type: z.enum(['own', 'thirdParty', 'visitor']).meta({ description: 'Tipo: own (próprio), thirdParty (terceiro), visitor (visitante)', examples: ['own'] }),
    active: z.boolean().meta({ description: 'Se o veículo está ativo no sistema', examples: [true] }),
  })
  .nullable()
  .meta({ id: 'VehicleSummary', description: 'Resumo do veículo vinculado ao movimento. Nulo quando status = pending_review.' });

const cameraSummarySchema = z
  .object({
    id: z.string().uuid().meta({ description: 'UUID da câmera', examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'] }),
    name: z.string().meta({ description: 'Nome da câmera', examples: ['Câmera Portaria 1'] }),
    ip: z.string().meta({ description: 'Endereço IP da câmera', examples: ['192.168.1.100'] }),
  })
  .nullable()
  .meta({ id: 'CameraSummary', description: 'Resumo da câmera que capturou a observação ANPR. Nulo quando o movimento não possui observação vinculada.' });

export const movementListItemSchema = z
  .object({
    id: z.string().meta({
      description: 'UUID único do movimento',
    }),
    type: z.enum(['entry', 'exit']).meta({
      description: 'Tipo do movimento: entry = entrada, exit = saída',
    }),
    dateTime: z.string().datetime({ offset: true }).meta({
      description: 'Data/hora em que o movimento ocorreu',
    }),
    status: z.enum(['open', 'closed', 'pending_review', 'discarded']).meta({
      description: 'Status do movimento',
    }),
    purpose: z.string().nullable().meta({
      description: 'Motivo do movimento',
    }),
    driverName: z.string().nullable().meta({
      description: 'Nome do motorista/condutor',
    }),
    notes: z.string().nullable().meta({
      description: 'Observações sobre o movimento',
    }),
    recognizedPlate: z.string().nullable().meta({
      description: 'Placa reconhecida pelo OCR (pode diferir do veículo)',
    }),
    autoRegistered: z.boolean().meta({
      description: 'Se foi criado automaticamente pelo ANPR',
    }),
    recalculatedAt: z.string().datetime({ offset: true }).nullable().meta({
      description: 'Data/hora do último recálculo',
    }),
    observationId: z.string().uuid().nullable().meta({
      description: 'UUID da observação ANPR que gerou este movimento',
    }),
    companyId: z.string().uuid().meta({
      description: 'UUID da empresa',
    }),
    createdById: z.string().meta({
      description: 'UUID do usuário que criou o registro',
    }),
    updatedById: z.string().nullable().meta({
      description: 'UUID do último usuário que atualizou',
    }),
    createdAt: z.string().datetime({ offset: true }).meta({
      description: 'Data/hora da criação do registro',
    }),
    updatedAt: z.string().datetime({ offset: true }).meta({
      description: 'Data/hora da última atualização',
    }),
    point: pointSummarySchema.meta({
      description: 'Dados do ponto (portão/entrada) vinculado ao movimento',
    }),
    vehicle: vehicleSummarySchema.meta({
      description: 'Dados do veículo vinculado ao movimento (nulo quando pending_review)',
    }),
    camera: cameraSummarySchema.meta({
      description: 'Dados da câmera que capturou a observação (quando disponível)',
    }),
  })
  .meta({
    id: 'MovementListItemDto',
    description: 'Item de movimento na listagem, com dados do ponto, veículo e câmera vinculados.',
  });

export const paginatedMovementsResponseSchema = z
  .object({
    data: z.array(movementListItemSchema).meta({
      description: 'Lista de movimentos da página atual',
    }),
    meta: z
      .object({
        page: z.number().int().meta({ description: 'Página atual' }),
        limit: z.number().int().meta({ description: 'Registros por página' }),
        total: z.number().int().meta({ description: 'Total de registros encontrados' }),
        totalPages: z.number().int().meta({ description: 'Total de páginas' }),
      })
      .meta({ description: 'Metadados de paginação' }),
  })
  .meta({
    id: 'PaginatedMovementsResponse',
    description: 'Resposta paginada da listagem de movimentos com dados das entidades relacionadas.',
  });

export class MovementListItemDto extends createZodDto(movementListItemSchema) {}
export class PaginatedMovementsResponseDto extends createZodDto(paginatedMovementsResponseSchema) {}

export type MovementListItemDtoType = z.infer<typeof movementListItemSchema>;
export type PaginatedMovementsResponseDtoType = z.infer<typeof paginatedMovementsResponseSchema>;
