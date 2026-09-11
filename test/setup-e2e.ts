import { inject } from 'vitest';

const connection = inject('testConnection');
process.env.NODE_ENV = 'test';
process.env.DB_HOST = connection.host;
process.env.DB_PORT = String(connection.port);
process.env.DB_USERNAME = connection.user;
process.env.DB_PASSWORD = connection.password;
process.env.DB_DATABASE = connection.database;
process.env.DB_SYNCHRONIZE = 'true';
process.env.MONITORING_ENABLED = 'false';
process.env.JWT_SECRET = 'isolated-e2e-signing-secret';
process.env.ANPR_SERVICE_URL = 'http://127.0.0.1:1';
