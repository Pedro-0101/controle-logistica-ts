import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service.js';
import { UserService } from '../user/user.service.js';

const user = {
  id: 'user-1',
  name: 'João',
  email: 'joao@empresa.com',
  role: 'admin',
  companyId: 'company-1',
  password: 'hashed-password',
};

describe('AuthService', () => {
  let service: AuthService;
  const userService = { findByEmail: vi.fn() };
  const jwtService = { sign: vi.fn(), verify: vi.fn() };
  let compareSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    compareSpy = vi.spyOn(bcrypt, 'compare');
    service = new AuthService(
      userService as unknown as UserService,
      jwtService as unknown as JwtService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateUser', () => {
    it('retorna usuário sem senha quando credenciais são válidas', async () => {
      userService.findByEmail.mockResolvedValue(user);
      compareSpy.mockResolvedValue(true);

      const result = await service.validateUser('joao@empresa.com', 'senha123');

      expect(userService.findByEmail).toHaveBeenCalledWith('joao@empresa.com');
      expect(bcrypt.compare).toHaveBeenCalledWith('senha123', 'hashed-password');
      expect(result).not.toHaveProperty('password');
      expect(result).toMatchObject({
        id: 'user-1',
        name: 'João',
        email: 'joao@empresa.com',
        role: 'admin',
        companyId: 'company-1',
      });
    });

    it('retorna null quando a senha não confere', async () => {
      userService.findByEmail.mockResolvedValue(user);
      compareSpy.mockResolvedValue(false);

      await expect(
        service.validateUser('joao@empresa.com', 'senha-errada'),
      ).resolves.toBeNull();
    });

    it('retorna null quando o usuário não existe', async () => {
      userService.findByEmail.mockResolvedValue(null);

      await expect(
        service.validateUser('nada@empresa.com', 'senha123'),
      ).resolves.toBeNull();
      expect(compareSpy).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('assina o token com as claims do usuário e retorna dados seguros', () => {
      jwtService.sign.mockReturnValue('token-xyz');

      const result = service.login(user);

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'joao@empresa.com',
        role: 'admin',
        companyId: 'company-1',
      });
      expect(result).toEqual({
        access_token: 'token-xyz',
        user: {
          id: 'user-1',
          name: 'João',
          email: 'joao@empresa.com',
          role: 'admin',
          companyId: 'company-1',
        },
      });
    });
  });

  describe('getClaimsFromToken', () => {
    it('verifica e devolve o payload do token', () => {
      const payload = {
        sub: 'user-1',
        email: 'joao@empresa.com',
        role: 'admin',
        companyId: 'company-1',
      };
      jwtService.verify.mockReturnValue(payload);

      const result = service.getClaimsFromToken('token-xyz');

      expect(jwtService.verify).toHaveBeenCalledWith('token-xyz');
      expect(result).toEqual(payload);
    });
  });
});
