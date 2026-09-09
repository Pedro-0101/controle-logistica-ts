import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { extractBearerToken, getTokenData } from './token.utils.js';

describe('extractBearerToken', () => {
  it('retorna o token após o prefixo Bearer', () => {
    const request = {
      headers: { authorization: 'Bearer abc.def.ghi' },
    } as Request;
    expect(extractBearerToken(request)).toBe('abc.def.ghi');
  });

  it('lança 401 quando o header de autorização não existe', () => {
    const request = { headers: {} } as Request;
    expect(() => extractBearerToken(request)).toThrow(UnauthorizedException);
  });

  it('lança 401 quando o header não é Bearer', () => {
    const request = {
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    } as Request;
    expect(() => extractBearerToken(request)).toThrow(UnauthorizedException);
  });

  it('lança 401 quando o token está vazio', () => {
    const request = { headers: { authorization: 'Bearer ' } } as Request;
    expect(() => extractBearerToken(request)).toThrow(UnauthorizedException);
  });
});

describe('getTokenData', () => {
  it('retorna o usuário autenticado da requisição', () => {
    const user = { userId: 'user-1', email: 'a@b.com', role: 'admin', companyId: null };
    const request = { user } as Request;
    expect(getTokenData(request)).toBe(user);
  });

  it('lança 401 quando não há usuário autenticado', () => {
    const request = {} as Request;
    expect(() => getTokenData(request)).toThrow(UnauthorizedException);
  });
});
