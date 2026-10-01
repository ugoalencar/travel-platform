/**
 * Shared test fixture: brings up the Lite test schema, seeds two tenants
 * with role variety, and boots the Fastify app. Each test file calls
 * createLiteFixture() in beforeAll (files run sequentially —
 * fileParallelism: false).
 */
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { buildApp } from '../../src/app';
import { createDatabase, type LiteDatabase } from '../../src/database';
import { hashPassword } from '../../src/password';
import {
  RUNTIME_URL,
  assertLocalTestDatabase,
  createTenantFixture,
  createUserFixture,
  endPools,
  resetLiteTestDatabase,
} from './lite-db';

export const FIXTURE_PASSWORD = 'correct-horse-battery-staple';

export interface LiteFixture {
  app: FastifyInstance;
  adminPool: Pool;
  runtimePool: Pool;
  database: LiteDatabase;
  tenantA: string;
  tenantB: string;
  adminA: string;
  operatorA: string;
  viewerA: string;
  operatorB: string;
  adminB: string;
  login(slug: string, email: string): Promise<string>;
  headers(token: string): Record<string, string>;
  close(): Promise<void>;
}

export async function createLiteFixture(): Promise<LiteFixture> {
  assertLocalTestDatabase();
  const pools = await resetLiteTestDatabase();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);

  const tenantA = await createTenantFixture(pools.adminPool, { slug: 'tenant-a', name: 'Tenant A' });
  const tenantB = await createTenantFixture(pools.adminPool, { slug: 'tenant-b', name: 'Tenant B' });

  const adminA = await createUserFixture(pools.adminPool, {
    tenantId: tenantA,
    name: 'Admin A',
    email: 'admin@a.test',
    passwordHash,
    role: 'ADMIN',
  });
  const operatorA = await createUserFixture(pools.adminPool, {
    tenantId: tenantA,
    name: 'Operator A',
    email: 'operator@a.test',
    passwordHash,
    role: 'OPERATOR',
  });
  const viewerA = await createUserFixture(pools.adminPool, {
    tenantId: tenantA,
    name: 'Viewer A',
    email: 'viewer@a.test',
    passwordHash,
    role: 'VIEWER',
  });
  const operatorB = await createUserFixture(pools.adminPool, {
    tenantId: tenantB,
    name: 'Operator B',
    email: 'operator@b.test',
    passwordHash,
    role: 'OPERATOR',
  });
  const adminB = await createUserFixture(pools.adminPool, {
    tenantId: tenantB,
    name: 'Admin B',
    email: 'admin@b.test',
    passwordHash,
    role: 'ADMIN',
  });

  const database = createDatabase(RUNTIME_URL);
  const app = await buildApp({ database, logger: process.env.LITE_TEST_DEBUG === '1' });

  async function login(slug: string, email: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { slug, email, password: FIXTURE_PASSWORD },
    });
    if (response.statusCode !== 200) {
      throw new Error(`fixture login failed: ${response.statusCode} ${response.body}`);
    }
    return response.json<{ sessionToken: string }>().sessionToken;
  }

  return {
    app,
    adminPool: pools.adminPool,
    runtimePool: pools.runtimePool,
    database,
    tenantA,
    tenantB,
    adminA,
    operatorA,
    viewerA,
    operatorB,
    adminB,
    login,
    headers: (token: string) => ({ authorization: `Bearer ${token}` }),
    async close() {
      await app.close();
      await database.end();
      await endPools(pools);
    },
  };
}
