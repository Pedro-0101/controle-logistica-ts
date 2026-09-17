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
    inheritCompanyConfig: z.boolean().default(true).optional().meta({
      description: 'Herda configurações ANPR da empresa. Se true, ignora os campos ANPR abaixo.',
      examples: [true],
      default: true,
    }),
    anprAutoRegister: z.boolean().nullable().default(null).optional().meta({
      description: 'Habilitar registro automático de movimentação por ANPR neste ponto (usado quando inheritCompanyConfig = false)',
      examples: [true],
      default: null,
    }),
    anprSaveUnrecognizedPhotos: z.boolean().nullable().default(null).optional().meta({
      description: 'Salvar foto quando placa não reconhecida neste ponto (usado quando inheritCompanyConfig = false)',
      examples: [true],
      default: null,
    }),
    anprAutoRegisterCooldownSeconds: z.number().int().min(0).nullable().default(null).optional().meta({
      description: 'Intervalo mínimo em segundos entre registros automáticos do mesmo veículo neste ponto (usado quando inheritCompanyConfig = false)',
      examples: [30],
      default: null,
    }),
    anprConfidenceThreshold: z.number().min(0).max(1).nullable().default(null).optional().meta({
      description: 'Confiança mínima (0-1) para aceitar leitura ANPR neste ponto (usado quando inheritCompanyConfig = false)',
      examples: [0.85],
      default: null,
    }),
    anprMatchTimeoutSeconds: z.number().int().min(1).nullable().default(null).optional().meta({
      description: 'Timeout em segundos para confirmar leitura de placa neste ponto (usado quando inheritCompanyConfig = false)',
      examples: [5],
      default: null,
    }),
    anprConfirmationReads: z.number().int().min(1).nullable().default(null).optional().meta({
      description: 'Número de leituras consecutivas para confirmar placa neste ponto (usado quando inheritCompanyConfig = false)',
      examples: [2],
      default: null,
    }),
    anprStaleAfterSeconds: z.number().int().min(1).nullable().default(null).optional().meta({
      description: 'Tempo em segundos para considerar observação expirada neste ponto (usado quando inheritCompanyConfig = false)',
      examples: [5],
      default: null,
    }),
    anprRecognitionMode: z.enum(['local', 'verified', 'external']).nullable().default(null).optional().meta({
      description: 'Modo de reconhecimento ANPR neste ponto (usado quando inheritCompanyConfig = false)',
      examples: ['verified'],
      default: null,
    }),
    anprExternalProvider: z.enum(['google_vision']).nullable().default(null).optional().meta({
      description: 'Provider externo de reconhecimento de placas neste ponto (usado quando inheritCompanyConfig = false)',
      examples: ['google_vision'],
      default: null,
    }),
    anprExternalMinConfidence: z.number().min(0).max(1).nullable().default(null).optional().meta({
      description: 'Confiança mínima para aceitar a placa da API externa neste ponto (usado quando inheritCompanyConfig = false)',
      examples: [0.7],
      default: null,
    }),
    anprExternalTimeoutMs: z.number().int().min(100).nullable().default(null).optional().meta({
      description: 'Timeout em milissegundos da API externa neste ponto (usado quando inheritCompanyConfig = false)',
      examples: [8000],
      default: null,
    }),
    anprExternalFallbackToLocal: z.boolean().nullable().default(null).optional().meta({
      description: 'Usar leitura local quando a API externa falhar neste ponto (usado quando inheritCompanyConfig = false)',
      examples: [true],
      default: null,
    }),
    anprExternalTrigger: z.enum(['after_confirmation', 'after_single_read']).nullable().default(null).optional().meta({
      description: 'Momento de acionamento da API externa neste ponto: after_confirmation ou after_single_read (usado quando inheritCompanyConfig = false)',
      examples: ['after_confirmation'],
      default: null,
    }),
    anprTrustRegisteredVehicle: z.boolean().nullable().default(null).optional().meta({
      description: 'Confirmar placa de veículo cadastrado sem consultar a API externa neste ponto (usado quando inheritCompanyConfig = false)',
      examples: [false],
      default: null,
    }),
    anprRegisterOnFirstRead: z.boolean().nullable().default(null).optional().meta({
      description: 'Registrar movimento na primeira leitura quando a placa tiver veículo cadastrado neste ponto (usado quando inheritCompanyConfig = false)',
      examples: [false],
      default: null,
    }),
    anprFirstReadMinConfidence: z.number().min(0).max(1).nullable().default(null).optional().meta({
      description: 'Confiança mínima para o atalho de placa cadastrada na primeira leitura neste ponto (usado quando inheritCompanyConfig = false)',
      examples: [0.85],
      default: null,
    }),
  })
  .meta({ id: 'CreatePointDto' });

export class CreatePointDto extends createZodDto(createPointSchema) {}

export type CreatePointDtoType = z.infer<typeof createPointSchema>;
