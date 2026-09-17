import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service.js';
import { UserService } from '../user/user.service.js';
import { CompanyService } from '../company/company.service.js';

const user = {
  id: 'user-1',
  name: 'João',
  email: 'joao@empresa.com',
  role: 'admin',
  companyId: 'company-1',
  password: 'hashed-password',
  points: [],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const company = {
  id: 'company-1',
  name: 'Empresa XYZ',
  companyName: 'XYZ Comércio e Serviços Ltda',
  cnpj: '12.345.678/0001-99',
  stateRegistration: '123.456.789.012',
  address: 'Rua Example, 123',
  email: 'contato@empresa.com.br',
  active: true,
};

describe('AuthService', () => {
  let service: AuthService;
  const userService = { findByEmail: vi.fn() };
  const companyService = { findById: vi.fn() };
  const jwtService = { sign: vi.fn(), verify: vi.fn() };
  let compareSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    compareSpy = vi.spyOn(bcrypt, 'compare');
    service = new AuthService(
      userService as unknown as UserService,
      companyService as unknown as CompanyService,
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
    it('assina o token com as claims do usuário e retorna dados seguros', async () => {
      jwtService.sign.mockReturnValue('token-xyz');
      companyService.findById.mockResolvedValue(company);

      const result = await service.login(user);

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        name: 'João',
        email: 'joao@empresa.com',
        role: 'admin',
        companyId: 'company-1',
      });
      expect(companyService.findById).toHaveBeenCalledWith('company-1');
      expect(result).toEqual({
        access_token: 'token-xyz',
        user: {
          id: 'user-1',
          name: 'João',
          email: 'joao@empresa.com',
          role: 'admin',
          companyId: 'company-1',
        },
        company,
      });
    });

    it('retorna company null quando o usuário não tem empresa', async () => {
      jwtService.sign.mockReturnValue('token-xyz');

      const result = await service.login({ ...user, companyId: null });

      expect(companyService.findById).not.toHaveBeenCalled();
      expect(result.company).toBeNull();
    });
  });

  describe('me', () => {
    it('retorna o usuário autenticado com a empresa vinculada', async () => {
      companyService.findById.mockResolvedValue(company);

      const result = await service.me({
        userId: 'user-1',
        email: 'joao@empresa.com',
        role: 'admin',
        companyId: 'company-1',
      });

      expect(companyService.findById).toHaveBeenCalledWith('company-1');
      expect(result).toEqual({
        userId: 'user-1',
        email: 'joao@empresa.com',
        role: 'admin',
        companyId: 'company-1',
        company,
      });
    });

    it('retorna company null quando não há empresa vinculada', async () => {
      const result = await service.me({
        userId: 'user-1',
        email: 'joao@empresa.com',
        role: 'admin',
        companyId: null,
      });

      expect(companyService.findById).not.toHaveBeenCalled();
      expect(result.company).toBeNull();
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
