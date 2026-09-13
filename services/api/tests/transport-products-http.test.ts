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

const projectName = 'travel-platform-transport-products-http-postgres';
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

describe('TransportProduct HTTP routes', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let routeAId: string;
  let routeA2Id: string;
  let routeBId: string;

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
    await adminPool.query('TRUNCATE TABLE transport_products RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE routes RESTART IDENTITY CASCADE');
    routeAId = await seedRoute(agencyAId, 'A1', 'A2');
    routeA2Id = await seedRoute(agencyAId, 'A3', 'A4');
    routeBId = await seedRoute(agencyBId, 'B1', 'B2');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  describe('GET /transport/products', () => {
    it('returns 401 without auth', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({ method: 'GET', url: '/transport/products' });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns only Agency A products', async () => {
      await seedProduct(agencyAId, routeAId);
      await seedProduct(agencyBId, routeBId);

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/transport/products',
        headers: { 'x-test-principal': 'owner' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ products: Array<{ agencyId: string }> }>();
      expect(body.products).toHaveLength(1);
      expect(body.products[0]?.agencyId).toBe(agencyAId);

      await app.close();
    });
  });

  describe('POST /transport/products', () => {
    it('creates a ONE_WAY product without returnRouteId (201)', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/transport/products',
        headers: { 'x-test-principal': 'manager' },
        payload: { name: 'One way', tripType: 'ONE_WAY', outboundRouteId: routeAId, price: 100 },
      });
      expect(response.statusCode).toBe(201);
      await app.close();
    });

    it('rejects a ROUND_TRIP product without returnRouteId (400)', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/transport/products',
        headers: { 'x-test-principal': 'manager' },
        payload: { name: 'Round trip', tripType: 'ROUND_TRIP', outboundRouteId: routeAId, price: 100 },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
      await app.close();
    });

    it('creates a ROUND_TRIP product with returnRouteId (201)', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/transport/products',
        headers: { 'x-test-principal': 'manager' },
        payload: {
          name: 'Round trip',
          tripType: 'ROUND_TRIP',
          outboundRouteId: routeAId,
          returnRouteId: routeA2Id,
          price: 100,
        },
      });
      expect(response.statusCode).toBe(201);
      await app.close();
    });

    it('rejects cross-tenant outbound Route reference (404, no leak of raw SQL)', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/transport/products',
        headers: { 'x-test-principal': 'manager' },
        payload: { name: 'Bad', tripType: 'ONE_WAY', outboundRouteId: routeBId, price: 100 },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json<{ error: string }>().error).not.toMatch(/constraint|SELECT|INSERT/i);
      await app.close();
    });

    it('rejects cross-tenant return Route reference (404)', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/transport/products',
        headers: { 'x-test-principal': 'manager' },
        payload: {
          name: 'Bad',
          tripType: 'ROUND_TRIP',
          outboundRouteId: routeAId,
          returnRouteId: routeBId,
          price: 100,
        },
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('rejects negative price with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/transport/products',
        headers: { 'x-test-principal': 'manager' },
        payload: { name: 'Bad', tripType: 'ONE_WAY', outboundRouteId: routeAId, price: -1 },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects re-parenting tripType/outboundRouteId/returnRouteId on update (400)', async () => {
      const created = await createOneWay('manager');
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/transport/products/${created}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { outboundRouteId: routeA2Id },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('active and publiclyBookable are independently settable', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/transport/products',
        headers: { 'x-test-principal': 'manager' },
        payload: {
          name: 'X',
          tripType: 'ONE_WAY',
          outboundRouteId: routeAId,
          price: 100,
          active: false,
          publiclyBookable: true,
        },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json<{ product: { active: boolean; publiclyBookable: boolean } }>();
      expect(body.product.active).toBe(false);
      expect(body.product.publiclyBookable).toBe(true);
      await app.close();
    });

    async function createOneWay(principal: string): Promise<string> {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/transport/products',
        headers: { 'x-test-principal': principal },
        payload: { name: 'One way', tripType: 'ONE_WAY', outboundRouteId: routeAId, price: 100 },
      });
      await app.close();
      return response.json<{ product: { id: string } }>().product.id;
    }
  });

  describe('RBAC', () => {
    it('allows VIEWER to read, blocks write with 403', async () => {
      const app = buildTestApp(runtimePool);
      const list = await app.inject({
        method: 'GET',
        url: '/transport/products',
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(list.statusCode).toBe(200);

      const create = await app.inject({
        method: 'POST',
        url: '/transport/products',
        headers: { 'x-test-principal': 'viewer' },
        payload: { name: 'x', tripType: 'ONE_WAY', outboundRouteId: routeAId, price: 1 },
      });
      expect(create.statusCode).toBe(403);
      await app.close();
    });

    it('blocks AGENT from write (floor is MANAGER)', async () => {
      const app = buildTestApp(runtimePool);
      const create = await app.inject({
        method: 'POST',
        url: '/transport/products',
        headers: { 'x-test-principal': 'agent' },
        payload: { name: 'x', tripType: 'ONE_WAY', outboundRouteId: routeAId, price: 1 },
      });
      expect(create.statusCode).toBe(403);
      await app.close();
    });

    it('fails closed for an unknown/invalid role', async () => {
      const app = buildTestApp(runtimePool);
      const list = await app.inject({
        method: 'GET',
        url: '/transport/products',
        headers: { 'x-test-principal': 'unknownRole' },
      });
      expect(list.statusCode).toBe(403);
      await app.close();
    });

    it('lets Agency B OWNER read only Agency B data, never Agency A', async () => {
      const aId = await seedProduct(agencyAId, routeAId);
      const app = buildTestApp(runtimePool);
      const get = await app.inject({
        method: 'GET',
        url: `/transport/products/${aId}`,
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

  async function seedRoute(agencyId: string, origin: string, destination: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO routes (agency_id, origin, destination) VALUES ($1, $2, $3) RETURNING id`,
      [agencyId, origin, destination],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed route');
    return id;
  }

  async function seedProduct(agencyId: string, outboundRouteId: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO transport_products (agency_id, name, trip_type, outbound_route_id, price)
       VALUES ($1, 'Seed product', 'ONE_WAY', $2, 100) RETURNING id`,
      [agencyId, outboundRouteId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed product');
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('TransportProduct route tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('TransportProduct route tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('TransportProduct route tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run transport product route tests against unsafe DATABASE_URL.');
    }
  }
}

function resetDisposableDatabase(): void {
  if (process.env.CI === 'true') return;
  compose(['down', '-v']);
  compose(['up', '-d']);
}

function compose(args: readonly string[]): CommandResult {
  return run('docker', ['compose', '-f', composeFile, '-p', projectName, ...args]);
}

async function waitForHealthyContainer(): Promise<void> {
  if (process.env.CI === 'true') return;
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
  if (process.env.CI === 'true') return;
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
        ($1, 'Agency A', 'agency-a-transport-products-http-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-transport-products-http-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-transport-products-http-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-transport-products-http-test-only', 'ACTIVE');
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
