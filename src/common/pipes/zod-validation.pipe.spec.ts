import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  let pipe: ZodValidationPipe;

  beforeEach(() => {
    pipe = new ZodValidationPipe(schema);
  });

  it('deve retornar os dados parseados quando válidos', () => {
    const result = pipe.transform({ name: 'João', age: 30 });
    expect(result).toEqual({ name: 'João', age: 30 });
  });

  it('deve lançar BadRequestException quando inválido', () => {
    expect(() => pipe.transform({ name: '', age: 30 })).toThrow(
      BadRequestException,
    );
  });

  it('deve expor os erros de campo no corpo da exceção', () => {
    try {
      pipe.transform({ name: '', age: -1 });
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response).toHaveProperty('name');
      expect(response).toHaveProperty('age');
    }
  });
});
