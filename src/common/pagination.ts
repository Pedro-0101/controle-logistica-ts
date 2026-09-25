export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Monta os metadados de paginação padronizados retornados pelas listagens.
 */
export function paginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Offset (`skip`) correspondente a uma página 1-based.
 */
export function paginationSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}
