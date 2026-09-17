import { z } from 'zod';
import { createZodDto } from 'zod-nest';

/**
 * ## MovementResponseDto
 *
 * Schema de resposta padrão para movimentos.
 *
 * **Novos campos (Auto Registration):**
 * - `recognizedPlate`: A placa que o OCR leu. Presente quando o movimento foi criado
 *   automaticamente e a placa não estava cadastrada. Limpo (nulo) após recálculo.
 * - `autoRegistered`: true se o movimento foi criado pelo sistema ANPR sem intervenção humana.
 * - `recalculatedAt`: data/hora do último recálculo (quando um pending_review virou open).
 * - `status`: pode ser `pending_review` ou `discarded` além de `open` e `closed`.
 * - `vehicleId`: pode ser null quando status é `pending_review`.
 */
export const movementResponseSchema = z
  .object({
    observationId: z.string().uuid().nullish().meta({
      description: 'UUID da observação ANPR que gerou este movimento. Nulo para movimentos criados manualmente.',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    id: z.string().meta({
      description: 'UUID único do movimento',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    pointId: z.string().nullish().meta({
      description: 'UUID do ponto (portão) vinculado ao movimento',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    vehicleId: z.string().nullable().meta({
      description: 'UUID do veículo vinculado ao movimento. Nulo quando status=pending_review (placa não reconhecida no DB). Após recálculo, este campo é preenchido.',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    type: z.enum(['entry', 'exit']).meta({
      description: 'Tipo do movimento: entry = entrada na unidade, exit = saída da unidade',
      examples: ['entry'],
    }),
    dateTime: z.iso.datetime().meta({
      description: 'Data e hora em que o movimento ocorreu (ISO 8601)',
      examples: ['2026-08-29T12:00:00.000Z'],
    }),
    status: z.enum(['open', 'closed', 'pending_review', 'discarded']).meta({
      description:
        'Status do movimento:\n' +
        '- `open`: Movimento confirmado e ativo (veículo dentro da unidade)\n' +
        '- `closed`: Movimento finalizado (veículo saiu)\n' +
        '- `pending_review`: Placa não reconhecida no DB, aguardando correção do operador\n' +
        '- `discarded`: Descartado pelo operador como incorreto (falso positivo do OCR)',
      examples: ['open'],
    }),
    companyId: z.string().meta({
      description: 'UUID da empresa à qual o movimento pertence',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    recognizedPlate: z.string().nullable().meta({
      description:
        'Placa que o OCR leu da imagem (formato normalizado, sem hífen).\n' +
        'Preenchido quando o movimento é criado automaticamente e a placa não está no DB.\n' +
        'Nulo após recálculo (os dados completos ficam no veículo vinculado).\n' +
        'Pode conter erros de leitura — o operador deve validar visualmente com a foto.',
      examples: ['ABC1D23'],
    }),
    autoRegistered: z.boolean().meta({
      description:
        'Indica se o movimento foi criado automaticamente pelo sistema ANPR.\n' +
        '- `true`: Criado pelo worker de auto-registro (sem intervenção humana)\n' +
        '- `false`: Criado manualmente pelo operador (via POST /movement ou POST /movement/from-observation)',
      examples: [false],
    }),
    recalculatedAt: z.string().datetime({ offset: true }).nullable().meta({
      description:
        'Data e hora do último recálculo deste movimento.\n' +
        'Preenchido quando um pending_review é processado via POST /movement/:id/recalculate.\n' +
        'Nulo se o movimento nunca foi recalculado.',
      examples: ['2026-08-29T12:00:00.000Z'],
    }),
    purpose: z.string().nullish().meta({
      description: 'Motivo do movimento (ex: "Entrega de mercadoria")',
      examples: ['Entrega de mercadoria'],
    }),
    driverName: z.string().nullish().meta({
      description: 'Nome do motorista/condutor do veículo',
      examples: ['João Silva'],
    }),
    notes: z.string().nullish().meta({
      description: 'Observações adicionais sobre o movimento',
      examples: ['Cliente aguardando no portão 2'],
    }),
    createdById: z.string().meta({
      description: 'UUID do usuário que criou o registro. Para movimentos auto-registrados, é o admin da empresa.',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    updatedById: z.string().nullish().meta({
      description: 'UUID do último usuário que atualizou o registro',
      examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    }),
    createdAt: z.iso.datetime().meta({
      description: 'Data e hora da criação do registro no banco (ISO 8601)',
      examples: ['2026-08-29T12:00:00.000Z'],
    }),
    updatedAt: z.iso.datetime().meta({
      description: 'Data e hora da última atualização do registro no banco (ISO 8601)',
      examples: ['2026-08-29T12:00:00.000Z'],
    }),
  })
  .meta({
    id: 'MovementResponseDto',
    description:
      'Resposta padrão de um movimento.\n\n' +
      '**Campos do Auto Registration:**\n' +
      '- `recognizedPlate`: placa lida pelo OCR (preenchido quando pending_review)\n' +
      '- `autoRegistered`: true se criado automaticamente pelo ANPR\n' +
      '- `recalculatedAt`: data do último recálculo\n' +
      '- `status`: pode ser pending_review (placa não reconhecida)\n' +
      '- `vehicleId`: nulo quando pending_review',
  });

export class MovementResponseDto extends createZodDto(movementResponseSchema) {}

export type MovementResponseDtoType = z.infer<typeof movementResponseSchema>;
