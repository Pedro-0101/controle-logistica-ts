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
