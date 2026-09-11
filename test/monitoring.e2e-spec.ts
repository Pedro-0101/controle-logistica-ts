import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Company } from '../src/company/entities/company.entity.js';
import { AdminUnity } from '../src/admin-unity/entities/admin-unity.entity.js';
import { Camera } from '../src/camera/entities/camera.entity.js';
import { Point } from '../src/point/entities/point.entity.js';
import { Vehicle } from '../src/vehicle/entities/vehicle.entity.js';
import { Movement } from '../src/movement/entities/movement.entity.js';
import { CameraObservation } from '../src/monitoring/observation.entity.js';
import { MonitoringService } from '../src/monitoring/monitoring.service.js';
import type { CurrentObservation } from '../src/monitoring/observation.schema.js';

describe('Monitoramento HTTP + PostgreSQL real', () => {
  let app: INestApplication;
  let db: DataSource;
  let python: Server;
  let company: Company;
  let other: Company;
  let unit: AdminUnity;
  let otherUnit: AdminUnity;
  let point: Point;
  let camera: Camera;
  let token: string;
  let otherToken: string;
  let state: CurrentObservation;
  const states = new Map<string, CurrentObservation>();
  const calls: string[] = [];
  const jpeg = readFileSync('anpr-service/tests/photos/tli8e44.jpg');

  beforeAll(async () => {
    python = createServer(async (req, res) => {
      const path = req.url!;
      calls.push(`${req.method} ${path}`);
      const id = path.split('/')[2];
      if (req.method === 'PUT') {
        for await (const _ of req) { /* consume camera config, never log credentials */ }
        res.setHeader('Content-Type', 'application/json');
        res.end('{}');
      } else if (req.method === 'DELETE') {
        states.delete(id); res.writeHead(204).end();
      } else if (path === '/monitors') {
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify([...states.keys()]));
      } else if (path.endsWith('/image')) {
        const current = states.get(id);
        if (current?.observationId !== path.split('/')[4]) { res.writeHead(409).end('{}'); return; }
        res.setHeader('Content-Type', 'image/jpeg'); res.end(jpeg);
      } else if (states.has(id)) {
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(states.get(id)));
      } else { res.writeHead(404).end('{}'); }
    });
    await new Promise<void>((resolve) => python.listen(0, '127.0.0.1', resolve));
    process.env.ANPR_SERVICE_URL = `http://127.0.0.1:${(python.address() as AddressInfo).port}`;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(DataSource);
    const companies = db.getRepository(Company);
    const base = { name: 'Test', companyName: 'Test Ltda', stateRegistration: 'test', address: 'Test', active: true, createdById: randomUUID() };
    company = await companies.save(companies.create({ ...base, cnpj: '99123456000111', email: 'monitor@test.com' }));
    other = await companies.save(companies.create({ ...base, cnpj: '99123456000112', email: 'other-monitor@test.com' }));
    const units = db.getRepository(AdminUnity);
    unit = await units.save(units.create({ name: 'Unit', code: randomUUID(), address: 'Test', companyId: company.id, active: true }));
    otherUnit = await units.save(units.create({ name: 'Other', code: randomUUID(), address: 'Test', companyId: other.id, active: true }));
    const jwt = app.get(JwtService);
    token = jwt.sign({ sub: randomUUID(), role: 'admin', companyId: company.id, email: 'monitor@test.com' });
    otherToken = jwt.sign({ sub: randomUUID(), role: 'admin', companyId: other.id, email: 'other@test.com' });
  });

  beforeEach(async () => {
    calls.length = 0;
    states.clear();
    const points = db.getRepository(Point);
    point = await points.save(points.create({ name: 'Entry', code: randomUUID(), type: 'entry', active: true, adminUnityId: unit.id, companyId: company.id, createdById: randomUUID() }));
    const cameras = db.getRepository(Camera);
    camera = await cameras.save(cameras.create({ name: 'Camera', ip: '127.0.0.1', port: 80,
      username: 'test', password: 'private-test', authType: 'digest', pointId: point.id,
      adminUnityId: unit.id, companyId: company.id, createdById: randomUUID() }));
    const now = Date.now();
    state = { cameraId: camera.id, status: 'confirmed', observationId: randomUUID(), placa: 'ABC1D23',
      confianca: 0.95, capturedAt: new Date(now - 100).toISOString(), lastSeenAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 5000).toISOString(), consecutiveReads: 2, box: [1, 2, 30, 40] };
    states.set(camera.id, state);
  });

  afterAll(async () => {
    await app?.close();
    if (python) { python.closeAllConnections(); await new Promise<void>((resolve) => python.close(() => resolve())); }
  });

  const current = () => request(app.getHttpServer()).get(`/camera/${camera.id}/current-observation`).set('Authorization', `Bearer ${token}`);
  const confirm = (body: object = { observationId: state.observationId }) => request(app.getHttpServer()).post('/movement/from-observation').set('Authorization', `Bearer ${token}`).send(body);

  it('consulta sem OCR, persiste uma evidência e não expõe conexão da câmera', async () => {
    const first = await current().expect(200);
    await current().expect(200);
    expect(first.body).toMatchObject({ placa: 'ABC1D23', status: 'confirmed', observationId: state.observationId });
    expect(JSON.stringify(first.body)).not.toMatch(/private-test|password|username|fotoPath/);
    expect(calls.filter((path) => path.endsWith('/image'))).toHaveLength(1);
    expect(calls.some((path) => path.includes('reconhecer'))).toBe(false);
    expect(await db.getRepository(CameraObservation).countBy({ id: state.observationId! })).toBe(1);
    const image = await request(app.getHttpServer()).get(`/camera/${camera.id}/observations/${state.observationId}/image`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(image.headers['content-type']).toContain('image/jpeg');
    expect(image.body).toEqual(jpeg);
  });

  it('confirma duas requisições simultâneas uma vez e suporta retry após expiração', async () => {
    await current().expect(200);
    const responses = await Promise.all([confirm().expect(201), confirm().expect(201)]);
    expect(responses[0].body.movement.id).toBe(responses[1].body.movement.id);
    expect(responses[0].body.movement).toMatchObject({ observationId: state.observationId, pointId: point.id, type: 'entry', companyId: company.id });
    expect(await db.getRepository(Movement).countBy({ observationId: state.observationId! })).toBe(1);
    await db.getRepository(CameraObservation).update(state.observationId!, { expiresAt: new Date(0) });
    states.delete(camera.id);
    const retry = await confirm().expect(201);
    expect(retry.body.movement.id).toBe(responses[0].body.movement.id);
  });

  it('from-camera usa a observação atual e não faz novo reconhecimento', async () => {
    const result = await request(app.getHttpServer()).post('/movement/from-camera').set('Authorization', `Bearer ${token}`).send({ cameraId: camera.id }).expect(201);
    expect(result.body.vehicle.plate).toBe(state.placa);
    expect(calls.some((path) => path.includes('reconhecer'))).toBe(false);
  });

  it.each(['candidate', 'waiting', 'stale', 'offline'] as const)('não cria movimento para estado %s', async (status) => {
    state.status = status;
    await request(app.getHttpServer()).post('/movement/from-camera').set('Authorization', `Bearer ${token}`).send({ cameraId: camera.id }).expect(409);
    expect(await db.getRepository(Movement).countBy({ pointId: point.id })).toBe(0);
  });

  it('recusa observação vencida e preserva banco sem movimentação', async () => {
    await current().expect(200);
    await db.getRepository(CameraObservation).update(state.observationId!, { expiresAt: new Date(0) });
    await confirm().expect(409);
    expect(await db.getRepository(Movement).countBy({ pointId: point.id })).toBe(0);
  });

  it.each(['offline', 'replacement'] as const)('revalida a câmera antes de confirmar: %s', async (change) => {
    await current().expect(200);
    const id = state.observationId;
    if (change === 'offline') state.status = 'offline'; else state.observationId = randomUUID();
    await confirm({ observationId: id }).expect(409);
    expect(await db.getRepository(Movement).countBy({ pointId: point.id })).toBe(0);
  });

  it('isola consultas, confirmações e evidências entre empresas', async () => {
    await current().expect(200);
    await request(app.getHttpServer()).get(`/camera/${camera.id}/current-observation`).set('Authorization', `Bearer ${otherToken}`).expect(404);
    await request(app.getHttpServer()).post('/movement/from-observation').set('Authorization', `Bearer ${otherToken}`).send({ observationId: state.observationId }).expect(404);
    await request(app.getHttpServer()).get(`/camera/${camera.id}/observations/${state.observationId}/image`).set('Authorization', `Bearer ${otherToken}`).expect(404);
    await request(app.getHttpServer()).get(`/camera/${camera.id}/current-observation`).expect(401);
    await request(app.getHttpServer()).post('/movement/from-observation').send({ observationId: state.observationId }).expect(401);
  });

  it('a mesma placa em empresas diferentes produz veículos distintos', async () => {
    const repo = db.getRepository(Vehicle);
    const foreign = await repo.save(repo.create({ plate: state.placa!, code: state.placa!, type: 'visitor', companyId: other.id, createdById: randomUUID(), active: true }));
    await current().expect(200);
    const result = await confirm().expect(201);
    expect(result.body.vehicle.companyId).toBe(company.id);
    expect(result.body.vehicle.id).not.toBe(foreign.id);
  });

  it('valida relações na câmera e não permite apontar para outra unidade', async () => {
    await request(app.getHttpServer()).post('/camera').set('Authorization', `Bearer ${token}`).send({ name: 'Bad', ip: '127.0.0.1', pointId: point.id, adminUnityId: otherUnit.id }).expect(400);
    await request(app.getHttpServer()).patch(`/camera/${camera.id}`).set('Authorization', `Bearer ${token}`).send({ pointId: randomUUID() }).expect(400);
    await request(app.getHttpServer()).post('/point').set('Authorization', `Bearer ${token}`).send({ name: 'Bad', code: randomUUID(), adminUnityId: otherUnit.id }).expect(400);
  });

  it('não confirma com unidade inativa ou sentido incompatível', async () => {
    await current().expect(200);
    await confirm({ observationId: state.observationId, type: 'exit' }).expect(400);
    await db.getRepository(AdminUnity).update(unit.id, { active: false });
    try { await confirm().expect(400); } finally { await db.getRepository(AdminUnity).update(unit.id, { active: true }); }
  });

  it('FKs e imutabilidade preservam histórico e idempotência', async () => {
    await current().expect(200);
    const result = await confirm().expect(201);
    const movementId = result.body.movement.id;
    await request(app.getHttpServer()).delete(`/movement/${movementId}`).set('Authorization', `Bearer ${token}`).expect(409);
    await request(app.getHttpServer()).patch(`/movement/${movementId}`).set('Authorization', `Bearer ${token}`).send({ type: 'exit' }).expect(409);
    await request(app.getHttpServer()).delete(`/vehicle/${result.body.vehicle.id}`).set('Authorization', `Bearer ${token}`).expect(409);
    await request(app.getHttpServer()).delete(`/camera/${camera.id}`).set('Authorization', `Bearer ${token}`).expect(409);
  });

  it('a reconciliação registra câmeras válidas e remove monitores órfãos', async () => {
    const orphan = randomUUID();
    states.set(orphan, { ...state, cameraId: orphan });
    await app.get(MonitoringService).reconcile();
    expect(calls).toContain(`PUT /monitors/${camera.id}`);
    expect(calls).toContain(`DELETE /monitors/${orphan}`);
  });
});
