import type { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator.js';

interface RouteArgEntry {
  index: number;
  factory: (data: unknown, context: ExecutionContext) => unknown;
  data: unknown;
}

function getRouteArgEntry(data?: unknown): RouteArgEntry {
  class TestClass {
    method() {}
  }
  const paramDecorator = CurrentUser(data);
  paramDecorator(TestClass.prototype, 'method', 0);

  const metadata = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    TestClass,
    'method',
  ) as Record<string, RouteArgEntry>;

  return Object.values(metadata)[0];
}

function makeContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('CurrentUser', () => {
  const user = {
    userId: 'user-1',
    email: 'joao@empresa.com',
    role: 'admin',
    companyId: 'company-1',
  };

  it('retorna o usuário completo quando nenhum campo é informado', () => {
    const entry = getRouteArgEntry();

    expect(entry.factory(entry.data, makeContext(user))).toEqual(user);
  });

  it('retorna apenas o campo solicitado', () => {
    const entry = getRouteArgEntry('email');

    expect(entry.factory(entry.data, makeContext(user))).toBe('joao@empresa.com');
  });

  it('retorna undefined quando não há usuário na requisição', () => {
    const entry = getRouteArgEntry();

    expect(entry.factory(entry.data, makeContext(undefined))).toBeUndefined();
  });
});
