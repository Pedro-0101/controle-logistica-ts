import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const pointResponseSchema = z
  .object({
    id: z.string().meta({
      description: 'UUID único do ponto',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    name: z.string().meta({
      description: 'Nome de exibição do ponto (ex.: Portão Principal)',
      examples: ['Portão Principal'],
    }),
    code: z.string().meta({
      description: 'Código único identificador do ponto na empresa',
      examples: ['P-001'],
    }),
    type: z.enum(['entry', 'exit', 'both']).meta({
      description: 'Tipo do ponto: entry (entrada), exit (saída) ou both (ambos)',
      examples: ['entry'],
    }),
    adminUnityId: z.string().meta({
      description: 'UUID da unidade administrativa vinculada ao ponto',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    companyId: z.string().meta({
      description: 'UUID da empresa proprietária do ponto',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    active: z.boolean().meta({
      description: 'Se o ponto está ativo (pontos inativos não recebem monitoramento)',
      examples: [true],
    }),
    anprAutoRegister: z.boolean().nullable().meta({
      description: 'Registro automático habilitado neste ponto (null = herda da empresa)',
      examples: [true],
    }),
    anprSaveUnrecognizedPhotos: z.boolean().nullable().meta({
      description: 'Salvar foto quando placa não reconhecida (null = herda da empresa)',
      examples: [true],
    }),
    anprAutoRegisterCooldownSeconds: z.number().int().nullable().meta({
      description: 'Cooldown em segundos entre registros automáticos do mesmo veículo (null = herda da empresa)',
      examples: [30],
    }),
    anprConfidenceThreshold: z.number().nullable().meta({
      description: 'Confiança mínima (0-1) para aceitar leitura ANPR (null = herda da empresa)',
      examples: [0.85],
    }),
    anprMatchTimeoutSeconds: z.number().int().nullable().meta({
      description: 'Timeout em segundos para confirmar leitura de placa (null = herda da empresa)',
      examples: [5],
    }),
    anprConfirmationReads: z.number().int().nullable().meta({
      description: 'Número de leituras consecutivas para confirmar placa (null = herda da empresa)',
      examples: [2],
    }),
    anprStaleAfterSeconds: z.number().int().nullable().meta({
      description: 'Tempo em segundos para considerar observação expirada (null = herda da empresa)',
      examples: [5],
    }),
    createdById: z.string().meta({
      description: 'UUID do usuário que criou o registro',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    updatedById: z.string().nullish().meta({
      description: 'UUID do último usuário que atualizou o registro',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    createdAt: z.iso.datetime().meta({
      description: 'Data e hora da criação do registro (ISO 8601)',
      examples: ['2026-08-29T12:00:00.000Z'],
    }),
    updatedAt: z.iso.datetime().meta({
      description: 'Data e hora da última atualização do registro (ISO 8601)',
      examples: ['2026-08-29T12:00:00.000Z'],
    }),
  })
  .meta({ id: 'PointResponseDto' });

export class PointResponseDto extends createZodDto(pointResponseSchema) {}

export type PointResponseDtoType = z.infer<typeof pointResponseSchema>;
