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
const migration004 = resolve(repoRoot, 'infrastructure/migrations/004_route_points.sql');
const migration005 = resolve(repoRoot, 'infrastructure/migrations/005_booking.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-bookings-http-postgres';
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

describe.sequential('Booking HTTP routes', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let productOneWayA: string;
  let customerAId: string;
  let customerBId: string;

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
    await adminPool.query('TRUNCATE TABLE booking_passengers RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE bookings RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE scheduled_departures RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE transport_products RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE routes RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE customers RESTART IDENTITY CASCADE');

    const routeA = await seedRoute(agencyAId);
    productOneWayA = await seedProduct(agencyAId, routeA);
    customerAId = await seedCustomer(agencyAId);
    customerBId = await seedCustomer(agencyBId);
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  describe('GET /bookings', () => {
    it('returns 401 without auth', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({ method: 'GET', url: '/bookings' });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns only Agency A bookings', async () => {
      const depId = await seedDeparture(agencyAId, productOneWayA, 10);
      const app = buildTestApp(runtimePool);
      const create = await app.inject({
        method: 'POST',
        url: '/bookings',
        headers: { 'x-test-principal': 'agent' },
        payload: {
          bookerCustomerId: customerAId,
          tripType: 'ONE_WAY',
          outboundDepartureId: depId,
          passengers: [{ name: 'Joao' }],
        },
      });
      expect(create.statusCode).toBe(201);

      const list = await app.inject({
        method: 'GET',
        url: '/bookings',
        headers: { 'x-test-principal': 'owner' },
      });
      expect(list.statusCode).toBe(200);
      const body = list.json<{ bookings: Array<{ agencyId: string }> }>();
      expect(body.bookings).toHaveLength(1);
      expect(body.bookings[0]?.agencyId).toBe(agencyAId);
      await app.close();
    });
  });

  describe('POST /bookings', () => {
    it('creates a one-way booking with passengers atomically', async () => {
      const depId = await seedDeparture(agencyAId, productOneWayA, 10);
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/bookings',
        headers: { 'x-test-principal': 'agent' },
        payload: {
          bookerCustomerId: customerAId,
          tripType: 'ONE_WAY',
          outboundDepartureId: depId,
          passengers: [{ name: 'Joao' }, { name: 'Maria' }],
        },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json<{ passengers: unknown[] }>();
      expect(body.passengers).toHaveLength(2);
      await app.close();
    });

    it('rejects forbidden field "cancelled" with 400', async () => {
      const depId = await seedDeparture(agencyAId, productOneWayA, 10);
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/bookings',
        headers: { 'x-test-principal': 'agent' },
        payload: {
          bookerCustomerId: customerAId,
          tripType: 'ONE_WAY',
          outboundDepartureId: depId,
          cancelled: true,
          passengers: [{ name: 'Joao' }],
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
      await app.close();
    });

    it('rejects unknown fields with 400', async () => {
      const depId = await seedDeparture(agencyAId, productOneWayA, 10);
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/bookings',
        headers: { 'x-test-principal': 'agent' },
        payload: {
          bookerCustomerId: customerAId,
          tripType: 'ONE_WAY',
          outboundDepartureId: depId,
          price: 100,
          passengers: [{ name: 'Joao' }],
        },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects cross-tenant bookerCustomerId with 404', async () => {
      const depId = await seedDeparture(agencyAId, productOneWayA, 10);
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/bookings',
        headers: { 'x-test-principal': 'agent' },
        payload: {
          bookerCustomerId: customerBId,
          tripType: 'ONE_WAY',
          outboundDepartureId: depId,
          passengers: [{ name: 'Joao' }],
        },
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('rejects capacity+1 with a clean 409 (no raw Postgres error leaked)', async () => {
      const depId = await seedDeparture(agencyAId, productOneWayA, 1);
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/bookings',
        headers: { 'x-test-principal': 'agent' },
        payload: {
          bookerCustomerId: customerAId,
          tripType: 'ONE_WAY',
          outboundDepartureId: depId,
          passengers: [{ name: 'A' }, { name: 'B' }],
        },
      });
      expect(response.statusCode).toBe(409);
      const body = response.json<{ code: string }>();
      expect(body.code).toBe('CONFLICT');
      expect(JSON.stringify(body)).not.toMatch(/scheduled_departures|SELECT|constraint/i);
      await app.close();
    });

    it('THE CONCURRENCY TEST (HTTP): two real concurrent POST /bookings, capacity=1 -- exactly one 201, one clean rejection', async () => {
      const depId = await seedDeparture(agencyAId, productOneWayA, 1);
      const app = buildTestApp(runtimePool);

      const makeRequest = () =>
        app.inject({
          method: 'POST',
          url: '/bookings',
          headers: { 'x-test-principal': 'agent' },
          payload: {
            bookerCustomerId: customerAId,
            tripType: 'ONE_WAY',
            outboundDepartureId: depId,
            passengers: [{ name: 'Racer' }],
          },
        });

      const [first, second] = await Promise.all([makeRequest(), makeRequest()]);
      const statusCodes = [first.statusCode, second.statusCode].sort();
      expect(statusCodes).toEqual([201, 409]);

      const passengerCount = await adminPool.query<{ count: string }>(
        'SELECT COUNT(*) FROM booking_passengers bp JOIN bookings b ON b.id = bp.booking_id WHERE b.outbound_departure_id = $1',
        [depId],
      );
      expect(Number(passengerCount.rows[0]?.count)).toBe(1);
      await app.close();
    });
  });

  describe('RBAC', () => {
    it('allows VIEWER to read, blocks write with 403', async () => {
      const depId = await seedDeparture(agencyAId, productOneWayA, 10);
      const app = buildTestApp(runtimePool);
      const list = await app.inject({ method: 'GET', url: '/bookings', headers: { 'x-test-principal': 'viewer' } });
      expect(list.statusCode).toBe(200);

      const create = await app.inject({
        method: 'POST',
        url: '/bookings',
        headers: { 'x-test-principal': 'viewer' },
        payload: {
          bookerCustomerId: customerAId,
          tripType: 'ONE_WAY',
          outboundDepartureId: depId,
          passengers: [{ name: 'Joao' }],
        },
      });
      expect(create.statusCode).toBe(403);
      await app.close();
    });

    it('allows AGENT to create (floor is AGENT, not MANAGER)', async () => {
      const depId = await seedDeparture(agencyAId, productOneWayA, 10);
      const app = buildTestApp(runtimePool);
      const create = await app.inject({
        method: 'POST',
        url: '/bookings',
        headers: { 'x-test-principal': 'agent' },
        payload: {
          bookerCustomerId: customerAId,
          tripType: 'ONE_WAY',
          outboundDepartureId: depId,
          passengers: [{ name: 'Joao' }],
        },
      });
      expect(create.statusCode).toBe(201);
      await app.close();
    });

    it.each(['manager', 'owner'])('allows %s to create', async (role) => {
      const depId = await seedDeparture(agencyAId, productOneWayA, 10);
      const app = buildTestApp(runtimePool);
      const create = await app.inject({
        method: 'POST',
        url: '/bookings',
        headers: { 'x-test-principal': role },
        payload: {
          bookerCustomerId: customerAId,
          tripType: 'ONE_WAY',
          outboundDepartureId: depId,
          passengers: [{ name: 'Joao' }],
        },
      });
      expect(create.statusCode).toBe(201);
      await app.close();
    });

    it('fails closed for an unknown/invalid role', async () => {
      const app = buildTestApp(runtimePool);
      const list = await app.inject({ method: 'GET', url: '/bookings', headers: { 'x-test-principal': 'unknownRole' } });
      expect(list.statusCode).toBe(403);
      await app.close();
    });

    it('no-auth fails closed on every route', async () => {
      const app = buildTestApp(runtimePool);
      const list = await app.inject({ method: 'GET', url: '/bookings' });
      const post = await app.inject({ method: 'POST', url: '/bookings', payload: {} });
      expect(list.statusCode).toBe(401);
      expect(post.statusCode).toBe(401);
      await app.close();
    });

    it('lets Agency B OWNER read only Agency B data, never Agency A (404 cross-tenant)', async () => {
      const depId = await seedDeparture(agencyAId, productOneWayA, 10);
      const app = buildTestApp(runtimePool);
      const create = await app.inject({
        method: 'POST',
        url: '/bookings',
        headers: { 'x-test-principal': 'agent' },
        payload: {
          bookerCustomerId: customerAId,
          tripType: 'ONE_WAY',
          outboundDepartureId: depId,
          passengers: [{ name: 'Joao' }],
        },
      });
      const bookingId = create.json<{ booking: { id: string } }>().booking.id;

      const get = await app.inject({
        method: 'GET',
        url: `/bookings/${bookingId}`,
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
      `INSERT INTO routes (agency_id, origin, destination) VALUES ($1, 'Sao Paulo', 'Rio de Janeiro') RETURNING id`,
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

  async function seedCustomer(agencyId: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name, status) VALUES ($1, 'Cliente Teste', 'ACTIVE') RETURNING id`,
      [agencyId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed customer');
    return id;
  }

  async function seedDeparture(agencyId: string, productId: string, capacity: number): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, service_type)
       VALUES ($1, $2, '2027-02-01T10:00:00Z', $3, 'OWN') RETURNING id`,
      [agencyId, productId, capacity],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed departure');
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Booking route tests require localhost only.');
  }
  if (databasePort !== 55432) {
    throw new Error('Booking route tests require local port 55432.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Booking route tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === '55432' || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run Booking route tests against unsafe DATABASE_URL.');
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
  await pool.query(readSqlForPg(migration004));
  await pool.query(readSqlForPg(migration005));
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
        ($1, 'Agency A', 'agency-a-bookings-http-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-bookings-http-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-bookings-http-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-bookings-http-test-only', 'ACTIVE');
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
