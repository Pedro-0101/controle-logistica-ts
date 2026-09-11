import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { Pool } from 'pg';
import type { TestProject } from 'vitest/node';

export default async function setup(project: TestProject) {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const connection = {
    host: process.env.TEST_DB_HOST ?? process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.TEST_DB_PORT ?? process.env.DB_PORT ?? 5434),
    user: process.env.TEST_DB_USERNAME ?? process.env.DB_USERNAME ?? 'postgres',
    password: process.env.TEST_DB_PASSWORD ?? process.env.DB_PASSWORD ?? 'postgres',
  };
  // Never reuse or drop a pre-existing database, including a configured dev DB.
  const database = `logistica_e2e_${randomUUID().replaceAll('-', '')}`;
  const pool = new Pool({ ...connection, database: 'postgres' });
  try {
    await pool.query(`CREATE DATABASE "${database}"`);
  } catch (error) {
    await pool.end();
    throw error;
  }
  project.provide('testConnection', { ...connection, database });
  return async () => {
    try {
      if (!/^logistica_e2e_[a-f0-9]{32}$/.test(database)) {
        throw new Error('Refusing to drop a database outside this test run');
      }
      await pool.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    } finally {
      await pool.end();
    }
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    testConnection: {
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
    };
  }
}
