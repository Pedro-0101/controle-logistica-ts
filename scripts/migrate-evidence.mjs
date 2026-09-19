import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client as MinioClient } from 'minio';
import { Pool } from 'pg';

/**
 * Migra as fotos de evidência do disco local para o MinIO e corrige o
 * `photoPath` das observações no banco.
 *
 * Uso:
 *   node --env-file=.env scripts/migrate-evidence.mjs [--dry-run] [--delete]
 *
 * --dry-run  apenas lista o que seria feito, sem enviar nem apagar nada
 * --delete   remove os arquivos locais migrados com sucesso (após upload)
 *
 * As chaves no storage seguem `evidence/{companyId}/{data}/{observacaoId}.jpg`,
 * equivalente ao caminho relativo dentro de `storage/`.
 */

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const STORAGE_DIR = join(ROOT, 'storage');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const DELETE_LOCAL = args.has('--delete');

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

async function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.jpg')) yield full;
  }
}

const bucket = required('STORAGE_BUCKET', 'controle-logistica');
const client = new MinioClient({
  endPoint: required('STORAGE_ENDPOINT', '127.0.0.1'),
  port: Number(process.env.STORAGE_PORT ?? 9000),
  useSSL: process.env.STORAGE_USE_SSL === 'true',
  accessKey: required('STORAGE_ACCESS_KEY', 'minioadmin'),
  secretKey: required('STORAGE_SECRET_KEY', 'minioadmin'),
});

function localToKey(filePath) {
  // storage/evidence/... -> evidence/...
  const rel = relative(STORAGE_DIR, filePath).split(sep).join('/');
  return rel;
}

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'controle_logistica',
});

async function main() {
  if (!existsSync(STORAGE_DIR)) {
    console.log(`Nada a migrar: ${STORAGE_DIR} não existe.`);
    return;
  }
  const evidenceDir = join(STORAGE_DIR, 'evidence');
  if (!existsSync(evidenceDir)) {
    console.log('Nada a migrar: pasta storage/evidence não existe.');
    return;
  }

  console.log(`Bucket: ${bucket}`);
  console.log(`Diretório local: ${evidenceDir}`);
  console.log(`Modo: ${DRY_RUN ? 'dry-run' : 'execução'}${DELETE_LOCAL ? ' (+ apagar local)' : ''}`);

  if (!DRY_RUN) {
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      await client.makeBucket(bucket);
      console.log(`Bucket "${bucket}" criado.`);
    }
  }

  let total = 0;
  let uploaded = 0;
  let skipped = 0;
  let deleted = 0;
  const failures = [];
  const uploadedKeys = new Set();

  for await (const filePath of walk(evidenceDir)) {
    total += 1;
    const key = localToKey(filePath);
    try {
      if (DRY_RUN) {
        console.log(`[dry-run] ${key}`);
        continue;
      }
      const data = readFileSync(filePath);
      const exists = await client.statObject(bucket, key).then(() => true).catch(() => false);
      if (exists) {
        skipped += 1;
      } else {
        await client.putObject(bucket, key, data, data.length, { 'Content-Type': 'image/jpeg' });
        uploaded += 1;
      }
      uploadedKeys.add(key);

      // Corrige o photoPath da observação cujo id é o nome do arquivo.
      const observationId = key.split('/').pop().replace(/\.jpg$/i, '');
      const result = await pool.query(
        'UPDATE camera_observations SET "photoPath" = $1 WHERE id = $2 AND ("photoPath" IS NULL OR "photoPath" <> $1)',
        [key, observationId],
      );
      if (result.rowCount > 0) {
        console.log(`  banco: observação ${observationId} -> ${key}`);
      }

      if (DELETE_LOCAL) {
        const size = statSync(filePath).size;
        if (size > 0) {
          const { unlinkSync } = await import('node:fs');
          unlinkSync(filePath);
          deleted += 1;
        }
      }
    } catch (error) {
      failures.push({ key, error: String(error?.message ?? error) });
    }
  }

  console.log('');
  console.log(`Total encontrado: ${total}`);
  console.log(`Enviados: ${uploaded}`);
  console.log(`Já existiam (ignorados): ${skipped}`);
  if (DELETE_LOCAL) console.log(`Arquivos locais removidos: ${deleted}`);
  if (failures.length > 0) {
    console.log(`Falhas: ${failures.length}`);
    for (const failure of failures) console.log(`  ${failure.key}: ${failure.error}`);
  }

  if (!DRY_RUN) {
    // Corrige o photoPath antigo (formato Windows ``storage\evidence\...``)
    // para a chave canônica ``evidence/...`` usada pelo StorageService.
    // Feito em JS para não depender do escape de backslash no SQL.
    const legacy = await pool.query(
      `SELECT id, "photoPath" FROM camera_observations WHERE "photoPath" LIKE 'storage%'`,
    );
    for (const row of legacy.rows) {
      const key = row.photoPath.replace(/^storage[\\/]/, '').split(/[\\/]/).join('/');
      await pool.query('UPDATE camera_observations SET "photoPath" = $1 WHERE id = $2', [key, row.id]);
    }
    if (legacy.rowCount > 0) {
      console.log(`photoPath antigos normalizados: ${legacy.rowCount}`);
    }
    const updated = await pool.query(
      'UPDATE camera_observations SET "photoPath" = \'evidence/\' || "companyId" || \'/\' || to_char("capturedAt", \'YYYY-MM-DD\') || \'/\' || id || \'.jpg\' WHERE "photoPath" IS NULL AND EXISTS (SELECT 1 FROM movements WHERE movements."observationId" = camera_observations.id)',
    );
    if (updated.rowCount > 0) {
      console.log(`Observações sem photoPath preenchidas pelo padrão: ${updated.rowCount}`);
    }
    console.log(`Chaves confirmadas no storage: ${uploadedKeys.size}`);
  }
}

try {
  await main();
} finally {
  await pool.end();
}
