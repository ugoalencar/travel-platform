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
  staffA: string;
  viewerA: string;
  staffB: string;
  adminB: string;
  masterA: string;
  sellerUserA1: string;
  sellerUserA2: string;
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
  const staffA = await createUserFixture(pools.adminPool, {
    tenantId: tenantA,
    name: 'Staff A',
    email: 'staff@a.test',
    passwordHash,
    role: 'MANAGER',
  });
  const viewerA = await createUserFixture(pools.adminPool, {
    tenantId: tenantA,
    name: 'Viewer A',
    email: 'viewer@a.test',
    passwordHash,
    role: 'VIEWER',
  });
  const staffB = await createUserFixture(pools.adminPool, {
    tenantId: tenantB,
    name: 'Staff B',
    email: 'staff@b.test',
    passwordHash,
    role: 'MANAGER',
  });
  const masterA = await createUserFixture(pools.adminPool, {
    tenantId: tenantA,
    name: 'Master A',
    email: 'master@a.test',
    passwordHash,
    role: 'MASTER',
  });
  // SELLER logins; tests that need them link them to sellers explicitly.
  const sellerUserA1 = await createUserFixture(pools.adminPool, {
    tenantId: tenantA,
    name: 'Seller One',
    email: 'seller1@a.test',
    passwordHash,
    role: 'SELLER',
  });
  const sellerUserA2 = await createUserFixture(pools.adminPool, {
    tenantId: tenantA,
    name: 'Seller Two',
    email: 'seller2@a.test',
    passwordHash,
    role: 'SELLER',
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
    staffA,
    viewerA,
    staffB,
    adminB,
    masterA,
    sellerUserA1,
    sellerUserA2,
    login,
    headers: (token: string) => ({ authorization: `Bearer ${token}` }),
    async close() {
      await app.close();
      await database.end();
      await endPools(pools);
    },
  };
}
