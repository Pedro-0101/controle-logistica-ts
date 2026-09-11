import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { parse } from 'yaml';

// Keeps the existing two hardcoded MediaMTX sources as the pilot's source of truth.
// No credentials are printed, duplicated in the repository or returned to the UI.
export async function seedCameras(pool, configPath, unitId) {
  const config = parse(await readFile(configPath, 'utf8'));
  const definitions = [['camera-entrada', 'entry'], ['camera-saida', 'exit']].map(([name, type]) => {
    const source = config?.paths?.[name]?.source;
    if (typeof source !== 'string') throw new Error(`Fonte ausente para ${name}`);
    const url = new URL(source);
    if (url.protocol !== 'rtsp:' || !url.hostname) throw new Error(`Fonte inválida para ${name}`);
    return { name, type, host: url.hostname, username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) };
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('logistica-pilot-cameras'))");
    const units = await client.query('SELECT id, "companyId" FROM admin_unities WHERE active = true' + (unitId ? ' AND id = $1' : ''), unitId ? [unitId] : []);
    if (units.rows.length !== 1) throw new Error('Informe --unit-id de uma unidade ativa; a seleção automática exige exatamente uma');
    const unit = units.rows[0];
    const admins = await client.query('SELECT id FROM users WHERE "companyId" = $1 AND role = $2', [unit.companyId, 'admin']);
    if (admins.rows.length !== 1) throw new Error('A unidade precisa de um administrador da empresa');
    const actorId = admins.rows[0].id;
    const result = [];
    for (const camera of definitions) {
      const code = `PILOT-${unit.id}-${camera.type}`;
      await client.query(`INSERT INTO points (name, code, type, "adminUnityId", "companyId", "createdById")
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (code) DO NOTHING`,
      [camera.name, code, camera.type, unit.id, unit.companyId, actorId]);
      const points = await client.query('SELECT id, type, "adminUnityId", "companyId" FROM points WHERE code = $1', [code]);
      const point = points.rows[0];
      if (!point || point.type !== camera.type || point.adminUnityId !== unit.id || point.companyId !== unit.companyId) {
        throw new Error('Ponto piloto existente tem contexto incompatível');
      }
      const existing = await client.query('SELECT id FROM cameras WHERE "pointId" = $1', [point.id]);
      if (existing.rows.length > 1) throw new Error('Mais de uma câmera no ponto piloto; revise o cadastro');
      let cameraId = existing.rows[0]?.id;
      if (!cameraId) {
        const inserted = await client.query(`INSERT INTO cameras
          (name, ip, port, username, password, "authType", "adminUnityId", "pointId", "companyId", "createdById")
          VALUES ($1,$2,80,$3,$4,'digest',$5,$6,$7,$8) RETURNING id`,
        [camera.name, camera.host, camera.username, camera.password, unit.id, point.id, unit.companyId, actorId]);
        cameraId = inserted.rows[0].id;
      }
      result.push({ cameraId, pointId: point.id, name: camera.name });
    }
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (key) => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; };
  const pool = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 5434),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE });
  try {
    console.log(JSON.stringify(await seedCameras(pool, value('--config') ?? new URL('../mediamtx.yml', import.meta.url), value('--unit-id'))));
  } catch {
    console.error('Cadastro piloto não concluído. Confira configuração, unidade, administrador e migração do banco. Nenhuma alteração parcial foi mantida.');
    process.exitCode = 1;
  } finally { await pool.end(); }
}
