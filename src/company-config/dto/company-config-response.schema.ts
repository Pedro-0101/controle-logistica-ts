import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const companyConfigResponseSchema = z
  .object({
    id: z.string().meta({
      description: 'UUID único da configuração',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    companyId: z.string().meta({
      description: 'ID da empresa vinculada à configuração',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    timezone: z.string().meta({
      description: 'Fuso horário da empresa',
      examples: ['America/Sao_Paulo'],
    }),
    language: z.string().meta({
      description: 'Idioma do sistema',
      examples: ['pt-BR'],
    }),
    cameraDefaultProtocol: z.enum(['http', 'https']).meta({
      description: 'Protocolo padrão para câmeras',
      examples: ['http'],
    }),
    cameraDefaultPort: z.number().int().meta({
      description: 'Porta padrão para câmeras',
      examples: [80],
    }),
    cameraDefaultAuthType: z.enum(['digest', 'basic']).meta({
      description: 'Tipo de autenticação padrão para câmeras',
      examples: ['digest'],
    }),
    cameraSnapshotIntervalMs: z.number().int().meta({
      description: 'Intervalo de snapshot das câmeras em milissegundos',
      examples: [1000],
    }),
    anprConfidenceThreshold: z.number().meta({
      description: 'Confiança mínima para reconhecimento ANPR (0-1)',
      examples: [0.85],
    }),
    anprMatchTimeoutSeconds: z.number().int().meta({
      description: 'Timeout para match de placa em segundos',
      examples: [5],
    }),
    anprConfirmationReads: z.number().int().meta({
      description: 'Número de leituras para confirmar placa',
      examples: [2],
    }),
    anprStaleAfterSeconds: z.number().int().meta({
      description: 'Tempo para considerar observação stale em segundos',
      examples: [5],
    }),
    anprAutoRegister: z.boolean().meta({
      description: 'Habilitar registro automático de movimentação por ANPR. Quando true, o sistema cria movimentos automaticamente ao detectar placas confirmadas, sem intervenção do porteiro.',
      examples: [false],
    }),
    anprSaveUnrecognizedPhotos: z.boolean().meta({
      description: 'Salvar foto quando placa não é reconhecida na base de dados. A foto fica disponível no campo photoPath do movimento pending_review.',
      examples: [true],
    }),
    anprAutoRegisterCooldownSeconds: z.number().int().meta({
      description: 'Intervalo mínimo em segundos entre movimentos automáticos do mesmo veículo no mesmo ponto. Evita registros duplicados.',
      examples: [30],
    }),
    anprRecognitionMode: z.enum(['local', 'verified', 'external']).meta({
      description: 'Modo de reconhecimento: local, verified ou external.',
      examples: ['verified'],
    }),
    anprExternalProvider: z.enum(['google_vision']).meta({
      description: 'Provider externo de reconhecimento de placas.',
      examples: ['google_vision'],
    }),
    anprExternalMinConfidence: z.number().meta({
      description: 'Confiança mínima (0-1) para aceitar a placa retornada pela API externa.',
      examples: [0.7],
    }),
    anprExternalTimeoutMs: z.number().int().meta({
      description: 'Timeout em milissegundos para a chamada à API externa.',
      examples: [8000],
    }),
    anprExternalFallbackToLocal: z.boolean().meta({
      description: 'Usar leitura local quando a API externa não retornar placa válida.',
      examples: [true],
    }),
    anprExternalTrigger: z.enum(['after_confirmation', 'after_single_read']).meta({
      description: 'Momento de acionamento da API externa: after_confirmation ou after_single_read.',
      examples: ['after_confirmation'],
    }),
    anprTrustRegisteredVehicle: z.boolean().meta({
      description: 'Confirmar placa de veículo cadastrado sem consultar a API externa.',
      examples: [false],
    }),
    anprRegisterOnFirstRead: z.boolean().meta({
      description: 'Registrar movimento na primeira leitura quando a placa tiver veículo cadastrado.',
      examples: [false],
    }),
    anprFirstReadMinConfidence: z.number().meta({
      description: 'Confiança mínima (0-1) da leitura local para o atalho de placa cadastrada na primeira leitura.',
      examples: [0.85],
    }),
    movementAutoCloseMinutes: z.number().int().meta({
      description: 'Minutos para auto-fechar movimento',
      examples: [60],
    }),
    requireDriverName: z.boolean().meta({
      description: 'Exigir nome do motorista na movimentação',
      examples: [false],
    }),
    requirePurpose: z.boolean().meta({
      description: 'Exigir motivo na movimentação',
      examples: [false],
    }),
    journeyWindowStart: z.string().meta({
      description: 'Início da janela de jornada (HH:MM)',
      examples: ['06:00'],
    }),
    journeyWindowEnd: z.string().meta({
      description: 'Fim da janela de jornada (HH:MM)',
      examples: ['22:00'],
    }),
    journeyWindowDays: z.string().meta({
      description: 'Dias da semana da jornada em CSV (1=segunda ... 7=domingo)',
      examples: ['1,2,3,4,5'],
    }),
    createdById: z.string().meta({
      description: 'ID do usuário que criou o registro',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    updatedById: z.string().nullish().meta({
      description: 'ID do último usuário que atualizou o registro',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    createdAt: z.iso.datetime().meta({
      description: 'Data e hora da criação do registro',
      examples: ['2026-08-29T12:00:00.000Z'],
    }),
    updatedAt: z.iso.datetime().meta({
      description: 'Data e hora da última atualização do registro',
      examples: ['2026-08-29T12:00:00.000Z'],
    }),
  })
  .meta({ id: 'CompanyConfigResponseDto' });

export class CompanyConfigResponseDto extends createZodDto(companyConfigResponseSchema) {}

export type CompanyConfigResponseDtoType = z.infer<typeof companyConfigResponseSchema>;
