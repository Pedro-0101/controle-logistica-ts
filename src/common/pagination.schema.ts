import { z } from 'zod';

/**
 * Campos de paginação reutilizados pelos schemas de listagem.
 * Mantém o default (1 página, 20 itens, máx. 100) em um único lugar.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).meta({
    description: 'Número da página (começa em 1)',
    examples: [1],
  }),
  limit: z.coerce.number().int().min(1).max(100).default(20).meta({
    description: 'Quantidade de registros por página (máx. 100)',
    examples: [20],
  }),
});
