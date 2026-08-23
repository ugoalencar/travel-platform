import { Pool } from 'pg';
import { buildApp } from './app';
import { createCustomerAccessValidator } from './customer-portal';
import { createDatabaseRuntime } from './database';
import {
  createServerAccessValidator,
  createServerAuthProvider,
  createServerCustomerAuthProvider,
} from './dev-auth';

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
