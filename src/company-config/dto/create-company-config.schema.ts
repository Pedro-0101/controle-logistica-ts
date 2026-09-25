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
    anprExternalTrigger: z.enum(['after_confirmation', 'after_single_read']).default('after_confirmation').meta({
      description: 'Momento de acionamento da API externa: after_confirmation (após N leituras confirmarem a placa) ou after_single_read (na primeira leitura; se a externa não vier com confiança suficiente, nenhum movimento é criado). Ignorado no modo local.',
      examples: ['after_confirmation'],
      default: 'after_confirmation',
    }),
    anprTrustRegisteredVehicle: z.boolean().default(false).meta({
      description: 'Quando true, uma placa que corresponde a um veículo já cadastrado é confirmada sem consultar a API externa (aguarda as N leituras).',
      examples: [false],
      default: false,
    }),
    anprRegisterOnFirstRead: z.boolean().default(false).meta({
      description: 'Quando true, se a primeira leitura identificar uma placa de veículo já cadastrado (com confiança >= anprFirstReadMinConfidence), o movimento é registrado imediatamente, sem aguardar as N leituras e sem consultar a API externa.',
      examples: [false],
      default: false,
    }),
    anprFirstReadMinConfidence: z.number().min(0).max(1).default(0.85).meta({
      description: 'Confiança mínima (0-1) da leitura local para confiar no atalho de placa cadastrada na primeira leitura (anprRegisterOnFirstRead).',
      examples: [0.85],
      default: 0.85,
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
    journeyWindowStart: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM')
      .default('00:00')
      .meta({
        description:
          'Início da janela de jornada (HH:MM). Trânsito/permanência que cruza fora da janela é marcado como atípico e fica fora das estatísticas de tempo.',
        examples: ['06:00'],
        default: '00:00',
      }),
    journeyWindowEnd: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM')
      .default('23:59')
      .meta({
        description: 'Fim da janela de jornada (HH:MM).',
        examples: ['22:00'],
        default: '23:59',
      }),
    journeyWindowDays: z
      .string()
      .regex(/^[1-7](,[1-7])*$/, 'Use CSV de 1 a 7 (ISO: 1=segunda ... 7=domingo)')
      .default('1,2,3,4,5,6,7')
      .meta({
        description: 'Dias da semana da jornada em CSV (1=segunda ... 7=domingo).',
        examples: ['1,2,3,4,5'],
        default: '1,2,3,4,5,6,7',
      }),
  })
  .meta({ id: 'CreateCompanyConfigDto' });

export class CreateCompanyConfigDto extends createZodDto(createCompanyConfigSchema) {}

export type CreateCompanyConfigDtoType = z.infer<typeof createCompanyConfigSchema>;
