import { z } from 'zod';
import { createZodDto } from 'zod-nest';

export const linkPointsSchema = z.object({
  pointIds: z.array(z.string().min(1, 'Point ID is required')).min(1, 'At least one point ID is required').meta({
    description: 'Lista de IDs dos pontos a serem vinculados ao usuário',
    examples: [['a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'b2c3d4e5-f6a7-8901-bcde-f12345678901']],
  }),
}).meta({ id: 'LinkPointsDto' });

export class LinkPointsDto extends createZodDto(linkPointsSchema) {}

export type LinkPointsDtoType = z.infer<typeof linkPointsSchema>;
