import { z } from 'zod';
import { createZodDto } from 'zod-nest';

const statusDescription = {
  waiting: 'Nenhum veículo detectado na imagem da câmera no momento.',
  candidate: 'Placa foi lida pelo OCR mas ainda não atingiu o número mínimo de leituras consecutivas para ser considerada confiável. Aguarde.',
  confirmed: 'Placa confirmada com leituras consecutivas suficientes. Esta observação pode ser confirmada pelo porteiro para gerar um movimento.',
  stale: 'Veículo saiu da imagem da câmera ou a observação expirou (sem leitura nos últimos ~5s). A placa ainda pode ser consultada para referência, mas não deve ser confirmada.',
  offline: 'Câmera sem conexão ou falha ao capturar imagem. Verifique a câmera.',
};

export const currentObservationResponseSchema = z.object({
  cameraId: z.string().uuid().meta({
    description: 'UUID da câmera que gerou esta observação',
    examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
  }),
  status: z.enum(['waiting', 'candidate', 'confirmed', 'stale', 'offline']).meta({
    description:
      'Estado atual da câmera na máquina de estados contínua.\n\n' +
      '**Fluxo típico:** waiting → candidate → confirmed → (stale quando o veículo sai)\n\n' +
      `waiting: ${statusDescription.waiting}\n` +
      `candidate: ${statusDescription.candidate}\n` +
      `confirmed: ${statusDescription.confirmed}\n` +
      `stale: ${statusDescription.stale}\n` +
      `offline: ${statusDescription.offline}`,
    examples: ['confirmed'],
  }),
  observationId: z.string().uuid().nullable().meta({
    description:
      'UUID da observação confirmada. Usado no POST /movement/from-observation para confirmar o atendimento.\n' +
      'Nulo quando status é waiting, stale ou offline.',
    examples: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
  }),
  placa: z.string().nullable().meta({
    description:
      'Placa reconhecida no formato Mercosul (ABC1D23) ou antigo (ABC1234).\n' +
      'Nulo quando nenhum veículo foi detectado ou a câmera está offline.',
    examples: ['ABC1D23'],
  }),
  confianca: z.number().min(0).max(1).nullable().meta({
    description:
      'Score de confiança do OCR (0.0 a 1.0). Valores acima de 0.8 geralmente indicam leitura confiável.\n' +
      'Nulo quando não há placa detectada.',
    examples: [0.95],
  }),
  capturedAt: z.string().datetime({ offset: true }).nullable().meta({
    description:
      'Data/hora em que a primeira imagem desta observação foi capturada (ISO 8601 com offset).\n' +
      'Usado para identificar quando o veículo chegou na câmera.',
    examples: ['2026-08-29T12:00:00.000Z'],
  }),
  lastSeenAt: z.string().datetime({ offset: true }).nullable().meta({
    description:
      'Data/hora da última leitura bem-sucedida desta placa.\n' +
      'Se a diferença entre agora e lastSeenAt ultrapassar stale_after_seconds (~5s), o status muda para stale.',
    examples: ['2026-08-29T12:00:02.000Z'],
  }),
  expiresAt: z.string().datetime({ offset: true }).nullable().meta({
    description:
      'Data/hora em que a observação expira (lastSeenAt + stale_after_seconds).\n' +
      'Após essa data, o POST /movement/from-observation rejeitará a confirmação com 409.',
    examples: ['2026-08-29T12:00:07.000Z'],
  }),
  consecutiveReads: z.number().int().nonnegative().meta({
    description:
      'Número de leituras consecutivas da mesma placa desde a última troca de veículo.\n' +
      'Quando atinge confirmation_reads (padrão: 2), o status muda de candidate para confirmed.',
    examples: [3],
  }),
  box: z.array(z.number()).length(4).nullable().meta({
    description:
      'Bounding box da placa na imagem [x1, y1, x2, y2] em pixels.\n' +
      'Útil para desenhar um retângulo sobre a placa na imagem exibida ao porteiro.',
    examples: [[120, 240, 320, 300]],
  }),
}).meta({
  id: 'CurrentObservationDto',
  description:
    'Estado atual da câmera no monitoramento contínuo.\n\n' +
    'O monitoramento é feito em background pelo microserviço Python: a cada ~1s, uma imagem é capturada ' +
    'da câmera IP, o OCR é executado e o resultado é armazenado em memória.\n\n' +
    'O front deve consultar este endpoint periodicamente (polling a cada 2s é recomendado) para exibir ' +
    'ao porteiro a placa do veículo que está na câmera.\n\n' +
    '**Fluxo completo:**\n' +
    '1. Front chama GET /camera/:id/current-observation periodicamente\n' +
    '2. Quando status = "confirmed", exibir placa, confiança e botão "Confirmar"\n' +
    '3. Porteiro clica "Confirmar" → front chama POST /movement/from-observation\n' +
    '4. Backend registra o movimento e retorna veículo identificado\n' +
    '5. A observação permanece available até expirar ou ser substituída por novo veículo',
});

export class CurrentObservationDto extends createZodDto(currentObservationResponseSchema) {}
