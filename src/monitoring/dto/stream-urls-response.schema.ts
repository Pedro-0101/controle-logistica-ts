import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const streamUrlsResponseSchema = z
  .object({
    cameraId: z.string().uuid().meta({
      description: 'UUID da câmera',
      examples: ['d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    hlsUrl: z.string().url().meta({
      description:
        'URL do stream HLS (.m3u8). Compatível com todos os navegadores.\n' +
        'Recomendado para compatibilidade geral. Latência de ~2-5s.\n' +
        'Use com hls.js ou elemento <video> nativo.',
      examples: ['http://localhost:8888/camera-d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b/index.m3u8'],
    }),
    webrtcUrl: z.string().url().meta({
      description:
        'URL do stream WebRTC (WHEP). Baixa latência (~200ms).\n' +
        'Recomentado para tempo real. Requer suporte WebRTC no navegador.\n' +
        'Use com biblioteca amber-sfu ou similar.',
      examples: ['http://localhost:8889/camera-d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
    rtspUrl: z.string().meta({
      description:
        'URL RTSP direta. Para clientes desktop (VLC, ffplay, ffmpeg).\n' +
        'Não funciona em navegadores diretamente.',
      examples: ['rtsp://localhost:8554/camera-d3f2a1b0-4c5e-4d6f-8a7b-9c0d1e2f3a4b'],
    }),
  })
  .meta({
    id: 'StreamUrlsDto',
    description:
      'URLs de streaming disponíveis para a câmera.\n\n' +
      'O sistema MediaMTX converte o sinal RTSP da câmera IP em protocolos ' +
      'compatíveis com navegadores (HLS e WebRTC).\n\n' +
      '**Uso no frontend:**\n' +
      '1. Chame GET /camera/:id/stream para obter as URLs\n' +
      '2. Use HLS para compatibilidade geral (hls.js ou <video> nativo)\n' +
      '3. Use WebRTC para baixa latência em aplicações em tempo real\n' +
      '4. O streaming é sob demanda — o MediaMTX só conecta à câmera quando há espectadores',
  });

export class StreamUrlsDto extends createZodDto(streamUrlsResponseSchema) {}
