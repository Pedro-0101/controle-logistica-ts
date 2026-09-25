import { z } from 'zod';
import { createZodDto } from 'zod-nest';

/**
 * ## PendingReviewMovementDto
 *
 * Schema de resposta para movimentos pendentes de revisão.
 *
 * **Contexto:** Quando o ANPR detecta uma placa que não existe na base de dados
 * de veículos, o sistema cria um movimento com status `pending_review`. Este DTO
 * define a estrutura retornada pelo endpoint `GET /movement/pending-review`.
 *
 * **Uso no frontend:**
 * - Exibir `recognizedPlate` ao operador (pode ter erros de OCR)
 * - Exibir `photoPath` como evidência visual (se disponível)
 * - Usar `id` para chamar `POST /movement/:id/recalculate` após correção
 * - Filtrar por `type` para mostrar se é entrada ou saída
 */
export const pendingReviewMovementSchema = z.object({
  id: z.string().meta({
    description:
      'UUID único do movimento.\n\n' +
      '- `POST /movement/:id/recalculate` — reprocessar após correção/cadastro do veículo\n' +
      '- `GET /movement/:id/evidence` — foto de evidência (JPEG) para validação visual',
    examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
  }),
  observationId: z.string().nullable().meta({
    description: 'UUID da observação ANPR vinculada. Referência interna — para a foto use GET /movement/:id/evidence com o id do movimento.',
  }),
  pointId: z.string().nullable().meta({
    description: 'UUID do ponto (portão) onde a câmera está instalada. Usar para identificar qual portão o veículo passou.',
  }),
  vehicleId: z.string().nullable().meta({
    description: 'UUID do veículo (nulo quando não reconhecido — placa não cadastrada no DB).',
  }),
  recognizedPlate: z.string().nullable().meta({
    description: 'Placa que o OCR leu da imagem. Pode conter erros de leitura (ex: B trocado com 8). O operador deve validar visualmente com a foto.',
    examples: ['ABC1D23'],
  }),
  type: z.enum(['entry', 'exit']).meta({
    description: 'Tipo do movimento: entry = entrada na unidade, exit = saída da unidade.',
    examples: ['entry'],
  }),
  dateTime: z.string().datetime({ offset: true }).meta({
    description: 'Data e hora em que o veículo foi detectado pela câmera (ISO 8601 com offset). Usar para exibir ao operador quando o veículo passou.',
    examples: ['2026-08-29T12:00:00.000Z'],
  }),
  status: z.enum(['open', 'closed', 'pending_review']).meta({
    description: 'Status do movimento. Sempre pending_review para itens retornados por este endpoint.',
  }),
  companyId: z.string().meta({
    description: 'UUID da empresa à qual o movimento pertence.',
  }),
  autoRegistered: z.boolean().meta({
    description: 'Indica que o movimento foi criado automaticamente pelo sistema ANPR (true) ou manualmente pelo operador (false).',
  }),
  photoPath: z.string().nullable().meta({
    description:
      'Chave da foto de evidência no storage (MinIO/S3 ou disco local). Disponível quando anprSaveUnrecognizedPhotos=true na config da empresa. Pode ser null se a foto não pôde ser salva.\n\n' +
      'Para exibir a imagem, prefira buscar pelo ID do movimento: `GET /movement/:id/evidence` (retorna o JPEG com o mesmo escopo de empresa). A foto é removida do storage quando a ocorrência é confirmada ou descartada.',
    examples: ['evidence/a1b2c3d4/2026-08-29/d3f2a1b0.jpg'],
  }),
  createdAt: z.string().datetime({ offset: true }).meta({
    description: 'Data e hora em que o registro foi criado no banco de dados.',
    examples: ['2026-08-29T12:00:00.000Z'],
  }),
}).meta({
  id: 'PendingReviewMovementDto',
  description:
    'Movimento pendente de revisão — placa não reconhecida na base de dados.\n\n' +
    'Retornado por GET /movement/pending-review. Cada item representa um veículo ' +
    'que passou em uma câmera ANPR mas cuja placa não foi encontrada no cadastro de veículos.\n\n' +
    'O operador deve validar a placa (comparando com a foto) e então chamar ' +
    'POST /movement/:id/recalculate para reprocessar o movimento.',
});

export class PendingReviewMovementDto extends createZodDto(pendingReviewMovementSchema) {}
