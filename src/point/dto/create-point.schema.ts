import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const createPointSchema = z
  .object({
    name: z.string().min(1, 'Name is required').meta({
      description: 'Nome de exibição do ponto (ex.: Portão Principal, Cancelheira Sul)',
      examples: ['Portão Principal'],
    }),
    code: z.string().min(1, 'Code is required').meta({
      description: 'Código único identificador do ponto na empresa (ex.: P-001, PORTAO-01)',
      examples: ['P-001'],
    }),
    type: z.enum(['entry', 'exit', 'both']).default('both').meta({
      description: 'Tipo do ponto: entry (entrada), exit (saída) ou both (ambos)',
      examples: ['entry'],
      default: 'both',
    }),
    adminUnityId: z.string().min(1, 'Admin unity ID is required').meta({
      description: 'UUID da unidade administrativa vinculada ao ponto',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    active: z.boolean().default(true).meta({
      description: 'Indica se o ponto está ativo (pontos inativos não recebem monitoramento)',
      examples: [true],
      default: 'true',
    }),
    anprAutoRegister: z.boolean().nullable().default(null).optional().meta({
      description: 'Habilitar registro automático de movimentação por ANPR neste ponto. Null = herda da empresa.',
      examples: [true],
      default: null,
    }),
    anprSaveUnrecognizedPhotos: z.boolean().nullable().default(null).optional().meta({
      description: 'Salvar foto quando placa não reconhecida neste ponto. Null = herda da empresa.',
      examples: [true],
      default: null,
    }),
    anprAutoRegisterCooldownSeconds: z.number().int().min(0).nullable().default(null).optional().meta({
      description: 'Intervalo mínimo em segundos entre registros automáticos do mesmo veículo neste ponto. Null = herda da empresa.',
      examples: [30],
      default: null,
    }),
    anprConfidenceThreshold: z.number().min(0).max(1).nullable().default(null).optional().meta({
      description: 'Confiança mínima (0-1) para aceitar leitura ANPR neste ponto. Null = herda da empresa.',
      examples: [0.85],
      default: null,
    }),
    anprMatchTimeoutSeconds: z.number().int().min(1).nullable().default(null).optional().meta({
      description: 'Timeout em segundos para confirmar leitura de placa neste ponto. Null = herda da empresa.',
      examples: [5],
      default: null,
    }),
    anprConfirmationReads: z.number().int().min(1).nullable().default(null).optional().meta({
      description: 'Número de leituras consecutivas para confirmar placa neste ponto. Null = herda da empresa.',
      examples: [2],
      default: null,
    }),
    anprStaleAfterSeconds: z.number().int().min(1).nullable().default(null).optional().meta({
      description: 'Tempo em segundos para considerar observação expirada neste ponto. Null = herda da empresa.',
      examples: [5],
      default: null,
    }),
  })
  .meta({ id: 'CreatePointDto' });

export class CreatePointDto extends createZodDto(createPointSchema) {}

export type CreatePointDtoType = z.infer<typeof createPointSchema>;
