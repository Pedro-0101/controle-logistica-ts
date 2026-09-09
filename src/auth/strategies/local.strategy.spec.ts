import { UnauthorizedException } from '@nestjs/common';
import { LocalStrategy } from './local.strategy.js';
import { AuthService } from '../auth.service.js';

describe('LocalStrategy', () => {
  let strategy: LocalStrategy;
  const authService = { validateUser: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    strategy = new LocalStrategy(authService as unknown as AuthService);
  });

  it('retorna o usuário quando as credenciais são válidas', async () => {
    const user = { id: 'user-1', email: 'joao@empresa.com' };
    authService.validateUser.mockResolvedValue(user);

    await expect(strategy.validate('joao@empresa.com', 'senha123')).resolves.toBe(
      user,
    );
  });

  it('lança 401 quando as credenciais são inválidas', async () => {
    authService.validateUser.mockResolvedValue(null);

    await expect(strategy.validate('joao@empresa.com', 'errada')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
