import { Pool } from 'pg';
import { buildApp } from './app';
import { createDatabaseRuntime } from './database';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const app = buildApp({
  authProvider: {
    authenticate() {
      return Promise.resolve(null);
    },
  },
  validateUserAgencyAccess() {
    return Promise.resolve(false);
  },
  database: createDatabaseRuntime(pool),
});

try {
  await app.listen({ port, host });
} catch (error: unknown) {
  app.log.error(error);
  process.exitCode = 1;
}
