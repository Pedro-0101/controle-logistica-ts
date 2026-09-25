import { paginationMeta, paginationSkip } from './pagination.js';

describe('paginationMeta', () => {
  it('calcula totalPages arredondando para cima', () => {
    expect(paginationMeta(1, 20, 45)).toEqual({ page: 1, limit: 20, total: 45, totalPages: 3 });
  });

  it('total zero resulta em zero páginas', () => {
    expect(paginationMeta(2, 10, 0)).toEqual({ page: 2, limit: 10, total: 0, totalPages: 0 });
  });

  it('divisão exata não cria página extra', () => {
    expect(paginationMeta(1, 25, 50).totalPages).toBe(2);
  });
});

describe('paginationSkip', () => {
  it.each([
    [1, 20, 0],
    [2, 20, 20],
    [3, 15, 30],
  ])('página %i com limite %i gera skip %i', (page, limit, expected) => {
    expect(paginationSkip(page, limit)).toBe(expected);
  });
});
