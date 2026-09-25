import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client as MinioClient } from 'minio';
import { Pool } from 'pg';

/**
 * Remove as fotos de evidência de movimentos JÁ CONFIRMADOS.
 *
 * Contexto
 * --------
 * As fotos de evidência do ANPR só são necessárias enquanto a leitura aguarda
 * revisão (`movements.status = 'pending_review'`). Quando o operador confirma o
 * movimento (status vira `open`/`closed`) ou descarta a leitura, a foto deixa de
 * ser útil. A aplicação já apaga a foto automaticamente nesses fluxos
 * (`POST /movement/:id/recalculate` e `POST /movement/discard`), porém movimentos
 * resolvidos ANTES dessa rotina continuam com a imagem salva no storage e o
 * `photoPath` preenchido na observação.
 *
 * Este script faz a limpeza retroativa desse legado:
 *   1. localiza observações cujo movimento vinculado NÃO está mais aguardando
 *      revisão (`open`, `closed` ou `discarded`) e que ainda possuem `photoPath`;
 *   2. remove o objeto correspondente do storage (MinIO/S3 ou disco local);
 *   3. zera o `photoPath` da observação no banco.
 *
 * Somente `pending_review` é preservado — são as leituras que o operador ainda
 * precisa validar visualmente. A operação é idempotente: rodar novamente não
 * encontra nada para apagar.
 *
 * Uso
 * ---
 *   node --env-file=.env scripts/purge-confirmed-evidence.mjs [opções]
 *
 * Opções:
 *   --dry-run   não apaga nada; apenas lista o que seria removido
 *   --batch=N   tamanho do lote de deleção no MinIO (padrão: 200)
 *
 * Variáveis de ambiente (as mesmas do backend):
 *   STORAGE_DRIVER=minio|local   (padrão: local)
 *   STORAGE_BUCKET               bucket do MinIO (padrão: controle-logistica)
 *   STORAGE_ENDPOINT, STORAGE_PORT, STORAGE_USE_SSL,
 *   STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY
 *   STORAGE_LOCAL_ROOT           raiz do driver local (padrão: cwd do projeto)
 *   DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE
 */

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const BATCH_SIZE = (() => {
  const raw = [...args].find((arg) => arg.startsWith('--batch='));
  const value = raw ? Number(raw.split('=')[1]) : 200;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 200;
})();

/**
 * Status de movimento que já não precisam da foto de evidência.
 * Apenas `pending_review` é preservado.
 */
const STATUSES = ['open', 'closed', 'discarded'];

const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
const bucket = process.env.STORAGE_BUCKET ?? 'controle-logistica';
const localRoot = process.env.STORAGE_LOCAL_ROOT ?? ROOT;

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'controle_logistica',
});

/** Cliente MinIO, criado sob demanda apenas no driver `minio`. */
const minio = driver === 'minio'
  ? new MinioClient({
      endPoint: process.env.STORAGE_ENDPOINT ?? '127.0.0.1',
      port: Number(process.env.STORAGE_PORT ?? 9000),
      useSSL: process.env.STORAGE_USE_SSL === 'true',
      accessKey: process.env.STORAGE_ACCESS_KEY ?? 'minioadmin',
      secretKey: process.env.STORAGE_SECRET_KEY ?? 'minioadmin',
    })
  : null;

/**
 * Resolve o caminho absoluto de uma chave no driver local, espelhando
 * `StorageService.localPath`: `storage/<chave sem o prefixo storage/>`.
 */
function localPathFor(key) {
  const normalized = key.replace(/^storage[\\/]/, '');
  return join(localRoot, 'storage', normalized);
}

/** Remove uma ou mais chaves do storage conforme o driver configurado. */
async function removeKeys(keys) {
  if (keys.length === 0) return;
  if (minio) {
    await minio.removeObjects(bucket, keys);
    return;
  }
  for (const key of keys) {
    try {
      rmSync(localPathFor(key), { force: true });
    } catch {
      /* objeto já ausente */
    }
  }
}

/** Observações com foto cujo movimento já está confirmado (ou descartado). */
async function findConfirmedEvidence() {
  const { rows } = await pool.query(
    `SELECT DISTINCT o.id, o."photoPath"
       FROM camera_observations o
       JOIN movements m ON m."observationId" = o.id
      WHERE o."photoPath" IS NOT NULL
        AND o."photoPath" <> ''
        AND m.status = ANY($1)
      ORDER BY o.id`,
    [STATUSES],
  );
  return rows;
}

async function main() {
  console.log('=== Purge de fotos de evidência de movimentos confirmados ===');
  console.log(`Driver de storage: ${driver}`);
  if (minio) console.log(`Bucket: ${bucket}`);
  console.log(`Status alvo: ${STATUSES.join(', ')}`);
  console.log(`Modo: ${DRY_RUN ? 'dry-run (nada será alterado)' : 'execução'}`);

  const rows = await findConfirmedEvidence();
  console.log(`Observações com foto a limpar: ${rows.length}`);
  if (rows.length === 0) return;

  if (DRY_RUN) {
    for (const row of rows) console.log(`[dry-run] ${row.id} -> ${row.photoPath}`);
    return;
  }

  let removed = 0;
  let cleared = 0;
  const failures = [];

  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const keys = batch.map((row) => row.photoPath);

    try {
      await removeKeys(keys);
      removed += keys.length;
    } catch (error) {
      // Tenta uma a uma para isolar a falha sem perder o lote inteiro.
      for (const row of batch) {
        try {
          await removeKeys([row.photoPath]);
          removed += 1;
        } catch (individual) {
          failures.push({ id: row.id, key: row.photoPath, error: String(individual?.message ?? individual) });
        }
      }
    }

    const clearedIds = batch
      .filter((row) => !failures.some((failure) => failure.id === row.id))
      .map((row) => row.id);

    if (clearedIds.length > 0) {
      const result = await pool.query(
        'UPDATE camera_observations SET "photoPath" = NULL WHERE id = ANY($1)',
        [clearedIds],
      );
      cleared += result.rowCount ?? 0;
    }

    console.log(`Progresso: ${Math.min(offset + batch.length, rows.length)}/${rows.length}`);
  }

  console.log('');
  console.log(`Fotos removidas do storage: ${removed}`);
  console.log(`Observações com photoPath limpo: ${cleared}`);
  if (failures.length > 0) {
    console.log(`Falhas: ${failures.length}`);
    for (const failure of failures) {
      console.log(`  ${failure.id} (${failure.key}): ${failure.error}`);
    }
  }
}

try {
  await main();
} finally {
  await pool.end();
}
