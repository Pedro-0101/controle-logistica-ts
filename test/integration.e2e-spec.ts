import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Pool } from 'pg';
import { DataSource } from 'typeorm';
import bcrypt from 'bcryptjs';
import { AppModule } from './../src/app.module.js';
import { User } from './../src/user/entities/user.entity.js';

const TEST_DB = 'controle_logistica_test';
const ROOT_EMAIL = 'e2e-root@test.com';
const ROOT_PASSWORD = 'root123';

describe('Integração (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminPool: Pool;

  let rootToken: string;
  let companyId: string;
  let companyAdminEmail = 'admin.empresa@test.com';
  let companyAdminPassword = 'senha123';
  let companyToken: string;

  beforeAll(async () => {
    adminPool = new Pool({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5434),
      user: process.env.DB_USERNAME ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: 'postgres',
    });

    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB}`);
    process.env.DB_DATABASE = TEST_DB;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    const userRepository = dataSource.getRepository(User);
    await userRepository.save(
      userRepository.create({
        name: 'Root E2E',
        email: ROOT_EMAIL,
        password: await bcrypt.hash(ROOT_PASSWORD, 10),
        role: 'admin',
        companyId: null,
      }),
    );
  });

  afterAll(async () => {
    await app.close();
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await adminPool.end();
  });

  it('root deve autenticar e receber um token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ROOT_EMAIL, password: ROOT_PASSWORD })
      .expect(200);

    expect(res.body.access_token).toBeDefined();
    expect(res.body.user).toMatchObject({ email: ROOT_EMAIL, companyId: null });
    rootToken = res.body.access_token;
  });

  it('root deve criar empresa e seu administrador', async () => {
    const res = await request(app.getHttpServer())
      .post('/company')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({
        name: 'Empresa E2E',
        companyName: 'Empresa E2E Ltda',
        cnpj: '12.345.678/0001-99',
        stateRegistration: '123.456.789',
        address: 'Rua Teste, 123',
        email: 'contato@empresa.test.com',
        admin: {
          name: 'Admin Empresa',
          email: companyAdminEmail,
          password: companyAdminPassword,
        },
      })
      .expect(201);

    expect(res.body.company).toHaveProperty('id');
    expect(res.body.admin).toMatchObject({ email: companyAdminEmail });
    expect(res.body.admin).not.toHaveProperty('password');
    companyId = res.body.company.id;
  });

  it('administrador da empresa deve autenticar com companyId vinculado', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: companyAdminEmail, password: companyAdminPassword })
      .expect(200);

    expect(res.body.user).toMatchObject({ companyId });
    companyToken = res.body.access_token;
  });

  it('administrador da empresa deve listar apenas a própria empresa', async () => {
    const res = await request(app.getHttpServer())
      .get('/company')
      .set('Authorization', `Bearer ${companyToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(companyId);
  });

  it('administrador da empresa deve cadastrar uma câmera', async () => {
    const pointRes = await request(app.getHttpServer())
      .post('/point')
      .set('Authorization', `Bearer ${companyToken}`)
      .send({
        name: 'Portão 1',
        code: 'P-001',
        type: 'entry',
        adminUnityId: 'unidade-e2e',
        companyId,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/camera')
      .set('Authorization', `Bearer ${companyToken}`)
      .send({
        adminUnityId: 'unidade-e2e',
        pointId: pointRes.body.id,
        name: 'Câmera Portaria',
        ip: '192.168.11.241',
        port: 80,
        username: 'admin',
        password: 'senha',
        authType: 'digest',
        companyId,
      })
      .expect(201);

    expect(res.body).toMatchObject({ name: 'Câmera Portaria', companyId });
  });

  it('administrador da empresa deve listar as câmeras da própria empresa', async () => {
    const res = await request(app.getHttpServer())
      .get('/camera')
      .set('Authorization', `Bearer ${companyToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].companyId).toBe(companyId);
  });

  it('rota protegida sem token deve retornar 401', async () => {
    await request(app.getHttpServer()).get('/camera').expect(401);
  });
});
