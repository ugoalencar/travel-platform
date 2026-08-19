import { Pool } from 'pg';
import { buildApp } from './app';
import { createDatabaseRuntime } from './database';
import { createServerAccessValidator, createServerAuthProvider } from './dev-auth';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const app = buildApp({
  authProvider: createServerAuthProvider(),
  validateUserAgencyAccess: createServerAccessValidator(),
  database: createDatabaseRuntime(pool),
});

async function main(): Promise<void> {
  try {
    await app.listen({ port, host });
    app.log.info({ host, port, service: 'api' }, 'service started');
  } catch (error: unknown) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

void main();
