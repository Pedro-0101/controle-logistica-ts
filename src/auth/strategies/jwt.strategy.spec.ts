import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    const configService = { getOrThrow: vi.fn(() => 'test-secret') };
    strategy = new JwtStrategy(configService as unknown as ConfigService);
  });

  it('deve mapear o payload do token para AuthenticatedUser', async () => {
    const user = await strategy.validate({
      sub: 'user-1',
      name: 'João',
      email: 'joao@empresa.com',
      role: 'admin',
      companyId: 'company-1',
    });

    expect(user).toEqual({
      userId: 'user-1',
      name: 'João',
      email: 'joao@empresa.com',
      role: 'admin',
      companyId: 'company-1',
    });
  });
});
