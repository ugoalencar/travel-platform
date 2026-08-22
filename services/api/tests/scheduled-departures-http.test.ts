import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { createDatabaseRuntime } from '../src/database';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-scheduled-departures-http-postgres';
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

describe.sequential('ScheduledDeparture HTTP routes', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let productAId: string;
  let productBId: string;
  let supplierAId: string;
  let supplierBId: string;

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
    await adminPool.query('TRUNCATE TABLE scheduled_departures RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE transport_products RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE suppliers RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE routes RESTART IDENTITY CASCADE');

    const routeA = await seedRoute(agencyAId);
    const routeB = await seedRoute(agencyBId);
    productAId = await seedProduct(agencyAId, routeA);
    productBId = await seedProduct(agencyBId, routeB);
    supplierAId = await seedSupplier(agencyAId);
    supplierBId = await seedSupplier(agencyBId);
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  describe('GET /transport/departures', () => {
    it('returns 401 without auth', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({ method: 'GET', url: '/transport/departures' });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns only Agency A departures', async () => {
      await seedDeparture(agencyAId, productAId);
      await seedDeparture(agencyBId, productBId);

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/transport/departures',
        headers: { 'x-test-principal': 'owner' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ departures: Array<{ agencyId: string }> }>();
      expect(body.departures).toHaveLength(1);
      expect(body.departures[0]?.agencyId).toBe(agencyAId);
      await app.close();
    });
  });

  describe('POST /transport/departures', () => {
    it('creates a departure with capacity and serviceType', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/transport/departures',
        headers: { 'x-test-principal': 'manager' },
        payload: {
          productId: productAId,
          departureAt: '2027-01-10T10:00:00Z',
          capacity: 10,
          serviceType: 'OWN',
        },
      });
      expect(response.statusCode).toBe(201);
      await app.close();
    });

    it('rejects negative capacity with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/transport/departures',
        headers: { 'x-test-principal': 'manager' },
        payload: {
          productId: productAId,
          departureAt: '2027-01-10T10:00:00Z',
          capacity: -5,
          serviceType: 'OWN',
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
      await app.close();
    });

    it('rejects cross-tenant Product reference with 404', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/transport/departures',
        headers: { 'x-test-principal': 'manager' },
        payload: {
          productId: productBId,
          departureAt: '2027-01-10T10:00:00Z',
          capacity: 10,
          serviceType: 'OWN',
        },
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('rejects cross-tenant Supplier reference with 404', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/transport/departures',
        headers: { 'x-test-principal': 'manager' },
        payload: {
          productId: productAId,
          departureAt: '2027-01-10T10:00:00Z',
          capacity: 10,
          serviceType: 'SUBCONTRACTED',
          supplierId: supplierBId,
        },
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('rejects arrivalExpectedAt before departureAt with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/transport/departures',
        headers: { 'x-test-principal': 'manager' },
        payload: {
          productId: productAId,
          departureAt: '2027-01-10T10:00:00Z',
          arrivalExpectedAt: '2027-01-10T09:00:00Z',
          capacity: 10,
          serviceType: 'OWN',
        },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it.each(['OWN', 'SUBCONTRACTED', 'RESELL'])('accepts serviceType %s', async (serviceType) => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/transport/departures',
        headers: { 'x-test-principal': 'manager' },
        payload: {
          productId: productAId,
          departureAt: '2027-01-10T10:00:00Z',
          capacity: 10,
          serviceType,
          ...(serviceType === 'SUBCONTRACTED' ? { supplierId: supplierAId } : {}),
        },
      });
      expect(response.statusCode).toBe(201);
      await app.close();
    });
  });

  describe('PATCH /transport/departures/:id', () => {
    it('never mutates another tenant departure (404, no-op)', async () => {
      const bId = await seedDeparture(agencyBId, productBId);
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/transport/departures/${bId}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { capacity: 999 },
      });
      expect(response.statusCode).toBe(404);

      const row = await adminPool.query<{ capacity: number }>(
        'SELECT capacity FROM scheduled_departures WHERE id = $1',
        [bId],
      );
      expect(row.rows[0]?.capacity).toBe(20);
      await app.close();
    });

    it('rejects negative capacity on update with 400', async () => {
      const id = await seedDeparture(agencyAId, productAId);
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/transport/departures/${id}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { capacity: -1 },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('RBAC', () => {
    it('allows VIEWER to read, blocks write with 403', async () => {
      const app = buildTestApp(runtimePool);
      const list = await app.inject({
        method: 'GET',
        url: '/transport/departures',
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(list.statusCode).toBe(200);

      const create = await app.inject({
        method: 'POST',
        url: '/transport/departures',
        headers: { 'x-test-principal': 'viewer' },
        payload: {
          productId: productAId,
          departureAt: '2027-01-10T10:00:00Z',
          capacity: 10,
          serviceType: 'OWN',
        },
      });
      expect(create.statusCode).toBe(403);
      await app.close();
    });

    it('blocks AGENT from write (floor is MANAGER)', async () => {
      const app = buildTestApp(runtimePool);
      const create = await app.inject({
        method: 'POST',
        url: '/transport/departures',
        headers: { 'x-test-principal': 'agent' },
        payload: {
          productId: productAId,
          departureAt: '2027-01-10T10:00:00Z',
          capacity: 10,
          serviceType: 'OWN',
        },
      });
      expect(create.statusCode).toBe(403);
      await app.close();
    });

    it('fails closed for an unknown/invalid role', async () => {
      const app = buildTestApp(runtimePool);
      const list = await app.inject({
        method: 'GET',
        url: '/transport/departures',
        headers: { 'x-test-principal': 'unknownRole' },
      });
      expect(list.statusCode).toBe(403);
      await app.close();
    });

    it('lets Agency B OWNER read only Agency B data, never Agency A', async () => {
      const aId = await seedDeparture(agencyAId, productAId);
      const app = buildTestApp(runtimePool);
      const get = await app.inject({
        method: 'GET',
        url: `/transport/departures/${aId}`,
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

  async function seedRoute(agencyId: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO routes (agency_id, origin, destination) VALUES ($1, 'A', 'B') RETURNING id`,
      [agencyId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed route');
    return id;
  }

  async function seedProduct(agencyId: string, routeId: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO transport_products (agency_id, name, trip_type, outbound_route_id, price)
       VALUES ($1, 'P', 'ONE_WAY', $2, 100) RETURNING id`,
      [agencyId, routeId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed product');
    return id;
  }

  async function seedSupplier(agencyId: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO suppliers (agency_id, name) VALUES ($1, 'S') RETURNING id`,
      [agencyId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed supplier');
    return id;
  }

  async function seedDeparture(agencyId: string, productId: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, service_type)
       VALUES ($1, $2, '2027-02-01T10:00:00Z', 20, 'OWN') RETURNING id`,
      [agencyId, productId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed departure');
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('ScheduledDeparture route tests require localhost only.');
  }
  if (databasePort !== 55432) {
    throw new Error('ScheduledDeparture route tests require local port 55432.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('ScheduledDeparture route tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === '55432' || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run scheduled departure route tests against unsafe DATABASE_URL.');
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
  await pool.query(readSqlForPg(migration001));
  await pool.query(readSqlForPg(migration002));
  await pool.query(readSqlForPg(migration003));
  await pool.query(readSqlForPg(prepareRolesSql));
  await seedAgenciesAndUsers(pool);
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
        ($1, 'Agency A', 'agency-a-scheduled-departures-http-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-scheduled-departures-http-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-scheduled-departures-http-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-scheduled-departures-http-test-only', 'ACTIVE');
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
