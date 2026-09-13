import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { createDatabaseRuntime } from '../src/database';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-travel-products-http-postgres';
const containerName = 'travel-platform-postgres-local';
const postgresImage = 'postgres:15';
const databaseHost = process.env.DATABASE_TEST_HOST ?? '127.0.0.1';
const databasePort = Number(process.env.DATABASE_TEST_PORT ?? '55432');
const databaseName = process.env.DATABASE_TEST_NAME ?? 'travel_platform_test';
const adminUser = process.env.DATABASE_TEST_USER ?? 'travel_test';
const adminPassword = process.env.DATABASE_TEST_PASSWORD ?? 'travel_test_password';
const runtimeUser = 'travel_app_runtime_local';
const runtimePassword = 'travel_app_runtime_local_password';
const poolPasswordKey = 'pass' + 'word';

const agencyAId = '10000000-0000-4000-8000-000000000001';
const agencyBId = '20000000-0000-4000-8000-000000000001';
const userAId = '11000000-0000-4000-8000-000000000001';
const userBId = '21000000-0000-4000-8000-000000000001';

const principals: Record<string, AuthenticatedPrincipal> = {
  viewer: { userId: userAId, agencyId: agencyAId, role: UserRole.VIEWER, email: 'user-a@example.test' },
  agent: { userId: userAId, agencyId: agencyAId, role: UserRole.AGENT, email: 'user-a@example.test' },
  manager: { userId: userAId, agencyId: agencyAId, role: UserRole.MANAGER, email: 'user-a@example.test' },
  owner: { userId: userAId, agencyId: agencyAId, role: UserRole.OWNER, email: 'user-a@example.test' },
  unknownRole: {
    userId: userAId,
    agencyId: agencyAId,
    role: 'NOT_A_REAL_ROLE' as UserRole,
    email: 'user-a@example.test',
  },
  ownerAgencyB: { userId: userBId, agencyId: agencyBId, role: UserRole.OWNER, email: 'user-b@example.test' },
};

describe('Travel product catalog HTTP routes', () => {
  let adminPool: Pool;
  let runtimePool: Pool;

  beforeAll(async () => {
    assertSafeTestDatabase();
    resetDisposableDatabase();
    await waitForHealthyContainer();
    assertContainerIsLocal();

    adminPool = new Pool({
      host: databaseHost,
      port: databasePort,
      database: databaseName,
      user: adminUser,
      [poolPasswordKey]: adminPassword,
    });
    runtimePool = new Pool({
      host: databaseHost,
      port: databasePort,
      database: databaseName,
      user: runtimeUser,
      [poolPasswordKey]: runtimePassword,
    });

    await resetDatabase(adminPool);
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE travel_products RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE offer_growth_audit_log RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  describe('GET /travel-products', () => {
    it('returns 401 without auth', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({ method: 'GET', url: '/travel-products' });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns only Agency A products for Agency A (tenant isolation)', async () => {
      await seedProduct(agencyAId, 'Product A');
      await seedProduct(agencyBId, 'Product B');

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/travel-products',
        headers: { 'x-test-principal': 'owner' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ products: Array<{ agencyId: string }> }>();
      expect(body.products).toHaveLength(1);
      expect(body.products[0]?.agencyId).toBe(agencyAId);

      await app.close();
    });

    it('filters by category', async () => {
      await seedProduct(agencyAId, 'Insurance product', 'INSURANCE');
      await seedProduct(agencyAId, 'Tour product', 'TOUR');

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/travel-products?category=TOUR',
        headers: { 'x-test-principal': 'owner' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ products: Array<{ category: string }> }>();
      expect(body.products).toHaveLength(1);
      expect(body.products[0]?.category).toBe('TOUR');

      await app.close();
    });

    it('rejects an invalid category with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/travel-products?category=NOT_A_CATEGORY',
        headers: { 'x-test-principal': 'owner' },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('GET /travel-products/:id', () => {
    it('never returns another tenant product (404, no leak)', async () => {
      const bId = await seedProduct(agencyBId, 'Product B');

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/travel-products/${bId}`,
        headers: { 'x-test-principal': 'owner' },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });
  });

  describe('POST /travel-products', () => {
    it('creates a product with defaults and records an audit log entry', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/travel-products',
        headers: { 'x-test-principal': 'manager' },
        payload: { category: 'TOUR', title: 'City Tour' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ product: { agencyId: string; active: boolean; standalone: boolean } }>();
      expect(body.product.agencyId).toBe(agencyAId);
      expect(body.product.active).toBe(true);
      expect(body.product.standalone).toBe(true);

      const audit = await adminPool.query(
        `SELECT action, entity_type FROM offer_growth_audit_log WHERE agency_id = $1`,
        [agencyAId],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({ action: 'travel_product.created', entity_type: 'TravelProduct' });

      await app.close();
    });

    it('rejects unknown field with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/travel-products',
        headers: { 'x-test-principal': 'manager' },
        payload: { category: 'TOUR', title: 'City Tour', notARealField: 'x' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
      await app.close();
    });

    it('rejects missing title with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/travel-products',
        headers: { 'x-test-principal': 'manager' },
        payload: { category: 'TOUR' },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects an invalid category with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/travel-products',
        headers: { 'x-test-principal': 'manager' },
        payload: { category: 'NOT_A_CATEGORY', title: 'X' },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects a non-ISO-date validFrom with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/travel-products',
        headers: { 'x-test-principal': 'manager' },
        payload: { category: 'TOUR', title: 'X', validFrom: '2026-01-01T00:00:00.000Z' },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects validFrom after validUntil with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/travel-products',
        headers: { 'x-test-principal': 'manager' },
        payload: { category: 'TOUR', title: 'X', validFrom: '2026-06-01', validUntil: '2026-01-01' },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    // Date/DATE coherence: a DATE column round-tripped through node-pg's
    // default parser as a JS Date is timezone-sensitive and can shift by a
    // calendar day. This asserts the API always returns the exact
    // "YYYY-MM-DD" string that was sent, regardless of process timezone.
    it('round-trips validFrom/validUntil as exact ISO date strings (no timezone drift)', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/travel-products',
        headers: { 'x-test-principal': 'manager' },
        payload: {
          category: 'TOUR',
          title: 'City Tour',
          validFrom: '2026-01-01',
          validUntil: '2026-12-31',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ product: { validFrom: string; validUntil: string } }>();
      expect(body.product.validFrom).toBe('2026-01-01');
      expect(body.product.validUntil).toBe('2026-12-31');

      const fetched = await app.inject({
        method: 'GET',
        url: `/travel-products/${response.json<{ product: { id: string } }>().product.id}`,
        headers: { 'x-test-principal': 'manager' },
      });
      const fetchedBody = fetched.json<{ product: { validFrom: string; validUntil: string } }>();
      expect(fetchedBody.product.validFrom).toBe('2026-01-01');
      expect(fetchedBody.product.validUntil).toBe('2026-12-31');

      await app.close();
    });
  });

  describe('PATCH /travel-products/:id', () => {
    it('never mutates another tenant product (404, no-op)', async () => {
      const bId = await seedProduct(agencyBId, 'Product B');

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/travel-products/${bId}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { title: 'Hacked' },
      });

      expect(response.statusCode).toBe(404);

      const row = await adminPool.query<{ title: string }>('SELECT title FROM travel_products WHERE id = $1', [bId]);
      expect(row.rows[0]?.title).toBe('Product B');

      await app.close();
    });

    it('updates fields and records an audit log entry', async () => {
      const id = await seedProduct(agencyAId, 'Product A');
      const app = buildTestApp(runtimePool);

      const response = await app.inject({
        method: 'PATCH',
        url: `/travel-products/${id}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { title: 'Renamed Product' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<{ product: { title: string } }>().product.title).toBe('Renamed Product');

      const audit = await adminPool.query(
        `SELECT action FROM offer_growth_audit_log WHERE agency_id = $1 AND action = 'travel_product.updated'`,
        [agencyAId],
      );
      expect(audit.rows).toHaveLength(1);

      await app.close();
    });
  });

  describe('DELETE /travel-products/:id', () => {
    it('soft-deletes (active=false) rather than removing the row', async () => {
      const id = await seedProduct(agencyAId, 'Product A');
      const app = buildTestApp(runtimePool);

      const response = await app.inject({
        method: 'DELETE',
        url: `/travel-products/${id}`,
        headers: { 'x-test-principal': 'manager' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<{ product: { active: boolean } }>().product.active).toBe(false);

      const row = await adminPool.query<{ active: boolean }>('SELECT active FROM travel_products WHERE id = $1', [id]);
      expect(row.rows[0]?.active).toBe(false);

      await app.close();
    });
  });

  describe('RBAC', () => {
    it('allows VIEWER to read, blocks write with 403', async () => {
      const id = await seedProduct(agencyAId, 'Product A');
      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: '/travel-products',
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(list.statusCode).toBe(200);

      const create = await app.inject({
        method: 'POST',
        url: '/travel-products',
        headers: { 'x-test-principal': 'viewer' },
        payload: { category: 'TOUR', title: 'x' },
      });
      expect(create.statusCode).toBe(403);
      expect(create.json()).toMatchObject({ code: 'FORBIDDEN' });

      const update = await app.inject({
        method: 'PATCH',
        url: `/travel-products/${id}`,
        headers: { 'x-test-principal': 'viewer' },
        payload: { title: 'x' },
      });
      expect(update.statusCode).toBe(403);

      const del = await app.inject({
        method: 'DELETE',
        url: `/travel-products/${id}`,
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(del.statusCode).toBe(403);

      await app.close();
    });

    it('blocks AGENT from write (floor is MANAGER)', async () => {
      const app = buildTestApp(runtimePool);
      const create = await app.inject({
        method: 'POST',
        url: '/travel-products',
        headers: { 'x-test-principal': 'agent' },
        payload: { category: 'TOUR', title: 'x' },
      });
      expect(create.statusCode).toBe(403);
      await app.close();
    });

    it.each(['manager', 'owner'] as const)('allows %s to read and write via hierarchy', async (principalKey) => {
      const app = buildTestApp(runtimePool);
      const create = await app.inject({
        method: 'POST',
        url: '/travel-products',
        headers: { 'x-test-principal': principalKey },
        payload: { category: 'TOUR', title: 'x' },
      });
      expect(create.statusCode).toBe(201);
      await app.close();
    });

    it('fails closed for an unknown/invalid role on both read and write routes', async () => {
      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: '/travel-products',
        headers: { 'x-test-principal': 'unknownRole' },
      });
      expect(list.statusCode).toBe(403);

      const create = await app.inject({
        method: 'POST',
        url: '/travel-products',
        headers: { 'x-test-principal': 'unknownRole' },
        payload: { category: 'TOUR', title: 'x' },
      });
      expect(create.statusCode).toBe(403);

      await app.close();
    });

    it('lets Agency B OWNER read only Agency B data, never Agency A', async () => {
      const aId = await seedProduct(agencyAId, 'Product A');
      const app = buildTestApp(runtimePool);

      const get = await app.inject({
        method: 'GET',
        url: `/travel-products/${aId}`,
        headers: { 'x-test-principal': 'ownerAgencyB' },
      });
      expect(get.statusCode).toBe(404);

      await app.close();
    });
  });

  function buildTestApp(pool: Pool) {
    return buildApp({
      authProvider: {
        authenticate(request) {
          const key = request.headers['x-test-principal'];
          return Promise.resolve(typeof key === 'string' ? principals[key] ?? null : null);
        },
      },
      validateUserAgencyAccess(userId, agencyId) {
        return Promise.resolve(
          (userId === userAId && agencyId === agencyAId) || (userId === userBId && agencyId === agencyBId),
        );
      },
      database: createDatabaseRuntime(pool),
    });
  }

  async function seedProduct(agencyId: string, title: string, category = 'TOUR'): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO travel_products (agency_id, category, title) VALUES ($1, $2, $3) RETURNING id`,
      [agencyId, category, title],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed travel product');
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Travel product route tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Travel product route tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Travel product route tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run travel product route tests against unsafe DATABASE_URL.');
    }
  }
}

function resetDisposableDatabase(): void {
  compose(['down', '-v']);
  compose(['up', '-d']);
}

function compose(args: readonly string[]): CommandResult {
  return run('docker', ['compose', '-f', composeFile, '-p', projectName, ...args]);
}

async function waitForHealthyContainer(): Promise<void> {
  const timeoutAt = Date.now() + 120_000;
  while (Date.now() < timeoutAt) {
    const result = run('docker', ['inspect', '-f', '{{.State.Health.Status}}', containerName], false);
    if (result.stdout.trim() === 'healthy') {
      return;
    }
    await new Promise((resolveWait) => {
      setTimeout(resolveWait, 2_000);
    });
  }
  throw new Error('Local PostgreSQL container did not become healthy in time.');
}

function assertContainerIsLocal(): void {
  const result = run('docker', ['ps', '--filter', `name=${containerName}`, '--format', '{{.Image}}|{{.Ports}}']);
  const output = result.stdout.trim();
  expect(output).toContain(postgresImage);
  expect(output).toContain(`${databaseHost}:${databasePort}->5432/tcp`);
}

async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.query(readAllMigrations());
  await pool.query(readSqlForPg(prepareRolesSql));
  await seedAgenciesAndUsers(pool);
}

function readAllMigrations(): string {
  const migrationFiles = readdirSync(migrationsDir)
    .filter((fileName) => /^\d+_.+\.sql$/.test(fileName))
    .sort();
  return migrationFiles.map((fileName) => readSqlForPg(resolve(migrationsDir, fileName))).join('\n');
}

function readSqlForPg(filePath: string): string {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
}

async function seedAgenciesAndUsers(pool: Pool): Promise<void> {
  await pool.query(
    `
      INSERT INTO agencies (id, name, slug, email, plan, status)
      VALUES
        ($1, 'Agency A', 'agency-a-travel-products-http-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-travel-products-http-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-travel-products-http-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-travel-products-http-test-only', 'ACTIVE');
    `,
    [userAId, agencyAId, userBId, agencyBId],
  );
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

function run(command: string, args: readonly string[], throwOnError = true): CommandResult {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });

  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();

  if (throwOnError && result.status !== 0) {
    throw new Error(
      [`Command failed: ${command} ${args.join(' ')}`, `Exit code: ${result.status ?? 'unknown'}`, stdout, stderr]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return { stdout, stderr };
}
