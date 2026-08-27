import { Pool } from 'pg';
import { buildApp } from './app';
import { createCustomerAccessValidator } from './customer-portal';
import { createDatabaseRuntime } from './database';
import {
  createServerAccessValidator,
  createServerAuthProvider,
  createServerCustomerAuthProvider,
} from './dev-auth';
import { assertSafeDatabaseRole, validateProductionEnvironment } from './env';

// Fail-closed production startup gate: throws synchronously if required
// config is missing/malformed, or if a prohibited flag (ALLOW_DEV_AUTH) is
// set in production. No-op outside NODE_ENV=production, so this never
// affects local dev or test runs.
validateProductionEnvironment();

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const app = buildApp({
  authProvider: createServerAuthProvider(),
  validateUserAgencyAccess: createServerAccessValidator(),
  database: createDatabaseRuntime(pool),
  // Customer portal: identity comes only from createServerCustomerAuthProvider()
  // (dev-only, dual-gated -- see dev-auth.ts). validateCustomerAgencyAccess is
  // NOT dev-only -- it is a real DB query (customers table) run regardless of
  // ALLOW_DEV_AUTH, so a misconfigured dev header can never grant access to a
  // customer who does not actually belong to the resolved agency.
  customerAuthProvider: createServerCustomerAuthProvider(),
  validateCustomerAgencyAccess: createCustomerAccessValidator(pool),
  readinessCheck: async () => {
    await pool.query('SELECT 1');
  },
});

async function main(): Promise<void> {
  try {
    // DB runtime role guard (production only): refuses to start if the
    // connected role is superuser or BYPASSRLS, since either would silently
    // defeat RLS tenant isolation. Does not modify role/RLS architecture --
    // it only reads the already-configured role's existing privileges.
    await assertSafeDatabaseRole(pool);
    await app.listen({ port, host });
    app.log.info({ host, port, service: 'api' }, 'service started');
  } catch (error: unknown) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

void main();
