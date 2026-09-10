import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { AuthController } from './../src/auth/auth.controller.js';
import { AuthService } from './../src/auth/auth.service.js';
import { LocalStrategy } from './../src/auth/strategies/local.strategy.js';
import { JwtStrategy } from './../src/auth/strategies/jwt.strategy.js';
import { JwtAuthGuard } from './../src/auth/guards/jwt-auth.guard.js';
import { UserService } from './../src/user/user.service.js';
import { CompanyService } from './../src/company/company.service.js';

@Controller()
class ProtectedController {
  @Get('protected')
  getProtected() {
    return 'ok';
  }
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const findByEmail = vi.fn();

  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash('senha123', 10);
    findByEmail.mockResolvedValue({
      id: 'user-1',
      name: 'João',
      email: 'joao@empresa.com',
      role: 'admin',
      companyId: 'company-1',
      password: hashedPassword,
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1d' },
        }),
      ],
      controllers: [AuthController, ProtectedController],
      providers: [
        AuthService,
        LocalStrategy,
        JwtStrategy,
        { provide: UserService, useValue: { findByEmail } },
        { provide: CompanyService, useValue: { findById: vi.fn() } },
        {
          provide: ConfigService,
          useValue: { getOrThrow: vi.fn(() => 'test-secret') },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /auth/login retorna 200 com access_token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'joao@empresa.com', password: 'senha123' })
      .expect(200);

    expect(res.body.access_token).toBeDefined();
    expect(res.body.user).toMatchObject({
      id: 'user-1',
      email: 'joao@empresa.com',
    });
  });

  it('POST /auth/login retorna 401 para credenciais inválidas', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'joao@empresa.com', password: 'senha-errada' })
      .expect(401);
  });

  it('rota protegida sem token retorna 401', async () => {
    await request(app.getHttpServer()).get('/protected').expect(401);
  });

  it('rota protegida com token válido retorna 200', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'joao@empresa.com', password: 'senha123' })
      .expect(200);

    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .expect(200);
  });
});
