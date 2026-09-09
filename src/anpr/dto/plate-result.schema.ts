import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const plateResultSchema = z
  .object({
    placa: z.string().meta({
      description: 'Placa normalizada (ex: ABC1D23)',
      examples: ['ABC1D23'],
    }),
    formato: z.string().meta({
      description: 'Formato da placa: mercosul ou antiga',
      examples: ['mercosul'],
    }),
    confianca: z.number().meta({
      description: 'Score de confiança do OCR (0-1)',
      examples: [0.98],
    }),
    raw: z.string().meta({
      description: 'Texto bruto capturado pelo OCR',
      examples: ['ABC1D23'],
    }),
    cameraUrlEncontrada: z.string().optional().meta({
      description: 'URL de snapshot que retornou imagem válida',
      examples: ['http://192.168.11.241/ISAPI/Streaming/channels/101/picture'],
    }),
    fotoPath: z.string().optional().meta({
      description: 'Caminho da imagem salva em disco',
      examples: ['/data/imagens/20260819T180317900379.jpg'],
    }),
  })
  .meta({ id: 'PlateResultDto' });

export class PlateResultDto extends createZodDto(plateResultSchema) {}

export type PlateResultDtoType = z.infer<typeof plateResultSchema>;
