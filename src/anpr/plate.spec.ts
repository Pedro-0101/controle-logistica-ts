import { normalizarPlaca } from './plate.js';

describe('normalizarPlaca', () => {
  it('deve normalizar placa Mercosul válida', () => {
    expect(normalizarPlaca('ABC1D23')).toEqual({ valor: 'ABC1D23', formato: 'mercosul' });
  });

  it('deve normalizar placa antiga válida', () => {
    expect(normalizarPlaca('ABC1234')).toEqual({ valor: 'ABC1234', formato: 'antiga' });
  });

  it('deve ignorar letras minúsculas e separadores', () => {
    expect(normalizarPlaca('abc-1234')).toEqual({ valor: 'ABC1234', formato: 'antiga' });
  });

  it('deve corrigir confusões de OCR (dígito no lugar de letra)', () => {
    expect(normalizarPlaca('4BC1234')).toEqual({ valor: 'ABC1Z34', formato: 'mercosul' });
  });

  it('deve encontrar placa dentro de texto com espaços', () => {
    expect(normalizarPlaca('veículo ABC1D23 passando')).toEqual({
      valor: 'ABC1D23',
      formato: 'mercosul',
    });
  });

  it('deve retornar null para texto vazio', () => {
    expect(normalizarPlaca('')).toBeNull();
  });

  it('deve retornar null para palavra longa sem formato de placa', () => {
    expect(normalizarPlaca('TERRAPLENAGEM')).toBeNull();
  });

  it('deve retornar null para texto sem placa', () => {
    expect(normalizarPlaca('sem placa aqui')).toBeNull();
  });
});
