import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const createCompanyConfigSchema = z
  .object({
    timezone: z.string().default('America/Sao_Paulo').meta({
      description: 'Fuso horário da empresa',
      examples: ['America/Sao_Paulo'],
      default: 'America/Sao_Paulo',
    }),
    language: z.string().default('pt-BR').meta({
      description: 'Idioma do sistema',
      examples: ['pt-BR'],
      default: 'pt-BR',
    }),
    cameraDefaultProtocol: z.enum(['http', 'https']).default('http').meta({
      description: 'Protocolo padrão para câmeras',
      examples: ['http'],
      default: 'http',
    }),
    cameraDefaultPort: z.number().int().default(80).meta({
      description: 'Porta padrão para câmeras',
      examples: [80],
      default: 80,
    }),
    cameraDefaultAuthType: z.enum(['digest', 'basic']).default('digest').meta({
      description: 'Tipo de autenticação padrão para câmeras',
      examples: ['digest'],
      default: 'digest',
    }),
    cameraSnapshotIntervalMs: z.number().int().default(1000).meta({
      description: 'Intervalo de snapshot das câmeras em milissegundos',
      examples: [1000],
      default: 1000,
    }),
    anprConfidenceThreshold: z.number().min(0).max(1).default(0.85).meta({
      description: 'Confiança mínima para reconhecimento ANPR (0-1)',
      examples: [0.85],
      default: 0.85,
    }),
    anprMatchTimeoutSeconds: z.number().int().default(5).meta({
      description: 'Timeout para match de placa em segundos',
      examples: [5],
      default: 5,
    }),
    anprConfirmationReads: z.number().int().default(2).meta({
      description: 'Número de leituras para confirmar placa',
      examples: [2],
      default: 2,
    }),
    anprStaleAfterSeconds: z.number().int().default(5).meta({
      description: 'Tempo para considerar observação stale em segundos',
      examples: [5],
      default: 5,
    }),
    anprAutoRegister: z.boolean().default(true).meta({
      description: 'Habilitar registro automático de movimentação por ANPR. Quando true, o sistema cria movimentos automaticamente ao detectar placas confirmadas pelas câmeras, sem intervenção do porteiro. Placas não reconhecidas ficam com status pending_review.',
      examples: [true],
      default: true,
    }),
    anprSaveUnrecognizedPhotos: z.boolean().default(true).meta({
      description: 'Salvar foto quando placa não é reconhecida na base de dados. A foto fica disponível no campo photoPath do movimento pending_review e pode ser exibida ao operador para validação visual.',
      examples: [true],
      default: true,
    }),
    anprAutoRegisterCooldownSeconds: z.number().int().default(30).meta({
      description: 'Intervalo mínimo em segundos entre movimentos automáticos do mesmo veículo no mesmo ponto. Evita registros duplicados quando um caminhão passa lentamente pela câmera.',
      examples: [30],
      default: 30,
    }),
    anprRecognitionMode: z.enum(['local', 'verified', 'external']).default('local').meta({
      description: 'Modo de reconhecimento: local (apenas OCR local), verified (OCR local + verificação em API externa; a placa externa vence quando válida) ou external (a API externa é autoritativa).',
      examples: ['verified'],
      default: 'local',
    }),
    anprExternalProvider: z.enum(['google_vision']).default('google_vision').meta({
      description: 'Provider externo de reconhecimento de placas. As credenciais são lidas de variáveis de ambiente.',
      examples: ['google_vision'],
      default: 'google_vision',
    }),
    anprExternalMinConfidence: z.number().min(0).max(1).default(0.7).meta({
      description: 'Confiança mínima (0-1) para aceitar a placa retornada pela API externa.',
      examples: [0.7],
      default: 0.7,
    }),
    anprExternalTimeoutMs: z.number().int().min(100).default(8000).meta({
      description: 'Timeout em milissegundos para a chamada à API externa.',
      examples: [8000],
      default: 8000,
    }),
    anprExternalFallbackToLocal: z.boolean().default(true).meta({
      description: 'Quando true e a API externa não retornar placa válida, usa a leitura local. Quando false (modo external), o movimento não é criado.',
      examples: [true],
      default: true,
    }),
    movementAutoCloseMinutes: z.number().int().default(60).meta({
      description: 'Minutos para auto-fechar movimento',
      examples: [60],
      default: 60,
    }),
    requireDriverName: z.boolean().default(false).meta({
      description: 'Exigir nome do motorista na movimentação',
      examples: [false],
      default: false,
    }),
    requirePurpose: z.boolean().default(false).meta({
      description: 'Exigir motivo na movimentação',
      examples: [false],
      default: false,
    }),
  })
  .meta({ id: 'CreateCompanyConfigDto' });

export class CreateCompanyConfigDto extends createZodDto(createCompanyConfigSchema) {}

export type CreateCompanyConfigDtoType = z.infer<typeof createCompanyConfigSchema>;
