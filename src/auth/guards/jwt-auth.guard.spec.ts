import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

describe('JwtAuthGuard', () => {
  const reflector = { getAllAndOverride: vi.fn() };
  let guard: JwtAuthGuard;

  const handler = vi.fn();
  const classRef = vi.fn();
  const context = {
    getHandler: () => handler,
    getClass: () => classRef,
  } as unknown as ExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new JwtAuthGuard(reflector as unknown as Reflector);
  });

  it('libera o acesso para rotas públicas sem passar pelo passport', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    expect(guard.canActivate(context)).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      handler,
      classRef,
    ]);
  });

  it('delega a autenticação ao passport para rotas protegidas', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const superCanActivate = vi
      .spyOn(
        Object.getPrototypeOf(JwtAuthGuard.prototype) as {
          canActivate: (context: ExecutionContext) => unknown;
        },
        'canActivate',
      )
      .mockResolvedValue(true);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(superCanActivate).toHaveBeenCalledWith(context);

    superCanActivate.mockRestore();
  });
});
