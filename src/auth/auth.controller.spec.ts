import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './strategies/jwt.strategy.js';

describe('AuthController', () => {
  let controller: AuthController;
  const authService = { login: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('login delega ao authService com req.user', () => {
    const req = { user: { id: 'user-1', email: 'a@b.com' } };
    authService.login.mockReturnValue({ access_token: 'token-xyz' });

    expect(controller.login({} as never, req as never)).toEqual({
      access_token: 'token-xyz',
    });
    expect(authService.login).toHaveBeenCalledWith(req.user);
  });

  it('me retorna o usuário autenticado', () => {
    const user: AuthenticatedUser = {
      userId: 'user-1',
      email: 'joao@empresa.com',
      role: 'admin',
      companyId: 'company-1',
    };

    expect(controller.me(user)).toBe(user);
  });
});
