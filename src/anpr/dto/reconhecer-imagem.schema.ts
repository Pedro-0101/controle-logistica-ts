import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const reconhecerImagemSchema = z
  .object({
    imagemBase64: z.string().min(1, 'imagemBase64 is required').meta({
      description: 'Imagem (JPEG/PNG) codificada em base64, sem o prefixo `data:image/...;base64,`',
      examples: ['/9j/4AAQSkZJRg...'],
    }),
  })
  .meta({ id: 'ReconhecerImagemDto' });

export class ReconhecerImagemDto extends createZodDto(reconhecerImagemSchema) {}

export type ReconhecerImagemDtoType = z.infer<typeof reconhecerImagemSchema>;
