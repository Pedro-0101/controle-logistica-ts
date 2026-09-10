import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './strategies/jwt.strategy.js';

describe('AuthController', () => {
  let controller: AuthController;
  const authService = { login: vi.fn(), me: vi.fn() };

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

  it('login delega ao authService com req.user', async () => {
    const req = { user: { id: 'user-1', email: 'a@b.com' } };
    authService.login.mockResolvedValue({ access_token: 'token-xyz' });

    await expect(controller.login({} as never, req as never)).resolves.toEqual({
      access_token: 'token-xyz',
    });
    expect(authService.login).toHaveBeenCalledWith(req.user);
  });

  it('me delega ao authService.me com o usuário autenticado', async () => {
    const user: AuthenticatedUser = {
      userId: 'user-1',
      email: 'joao@empresa.com',
      role: 'admin',
      companyId: 'company-1',
    };
    authService.me.mockResolvedValue({ ...user, company: null });

    await expect(controller.me(user)).resolves.toEqual({ ...user, company: null });
    expect(authService.me).toHaveBeenCalledWith(user);
  });
});
