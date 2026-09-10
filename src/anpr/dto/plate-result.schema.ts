import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const plateResultSchema = z
  .object({
    placa: z.string().meta({
      description:
        'Placa normalizada, já corrigida pelo pós-processamento (formato Mercosul `ABC1D23` ou antigo `ABC1234`)',
      examples: ['ABC1D23'],
    }),
    formato: z.string().meta({
      description: 'Formato da placa: `mercosul` (ABC1D23) ou `antiga` (ABC1234)',
      examples: ['mercosul'],
    }),
    confianca: z.number().meta({
      description: 'Score de confiança do OCR (0 a 1). Quanto maior, mais confiável a leitura',
      examples: [0.98],
    }),
    raw: z.string().meta({
      description: 'Texto bruto retornado pelo OCR, antes da normalização (pode conter erros de leitura)',
      examples: ['ABC1D23'],
    }),
    box: z
      .array(z.number())
      .optional()
      .meta({
        description:
          'Bounding box da placa no formato [x1, y1, x2, y2], em pixels da imagem de entrada. Presente quando o OCR localiza a região do texto da placa',
        examples: [[120, 240, 320, 300]],
      }),
    cameraUrlEncontrada: z.string().optional().meta({
      description:
        'URL de snapshot que retornou a imagem válida. Presente apenas no reconhecimento via câmera (ausente quando a imagem é enviada em base64)',
      examples: ['http://192.168.11.241/ISAPI/Streaming/channels/101/picture'],
    }),
    fotoPath: z.string().optional().meta({
      description: 'Caminho da imagem salva em disco pelo microserviço. Presente apenas no reconhecimento via câmera',
      examples: ['/data/imagens/20260819T180317900379.jpg'],
    }),
  })
  .meta({ id: 'PlateResultDto' });

export class PlateResultDto extends createZodDto(plateResultSchema) {}

export type PlateResultDtoType = z.infer<typeof plateResultSchema>;
