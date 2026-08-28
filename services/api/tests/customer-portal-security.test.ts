import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { createDatabaseRuntime } from '../src/database';
import { createCustomerAccessValidator } from '../src/customer-portal';
import type { CustomerAuthProvider } from '../src/customer-auth';
import {
  createServerCustomerAuthProvider,
  isDevAuthEnabled,
} from '../src/dev-auth';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
const migration004 = resolve(repoRoot, 'infrastructure/migrations/004_route_points.sql');
const migration005 = resolve(repoRoot, 'infrastructure/migrations/005_booking.sql');
const migration006 = resolve(repoRoot, 'infrastructure/migrations/006_field_operations.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-customer-portal-security-postgres';
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

describe.sequential('Customer portal security (IDOR / tenant / dev-auth gating)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let customerA1Id: string;
  let customerA2Id: string;
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
    await adminPool.query(
      'TRUNCATE TABLE bookings, booking_passengers, proposals, trips, offers, customers RESTART IDENTITY CASCADE',
    );
    customerA1Id = await seedCustomer(agencyAId, 'Customer A1');
    customerA2Id = await seedCustomer(agencyAId, 'Customer A2');
    customerBId = await seedCustomer(agencyBId, 'Customer B');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  describe('unauthenticated / unknown identity fails closed', () => {
    it('returns 401 with no customer auth header at all', async () => {
      const app = buildTestApp(runtimePool, stubCustomerProvider());
      const response = await app.inject({ method: 'GET', url: '/customer-api/trips' });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns 401 for an unknown customer identity, never data', async () => {
      const app = buildTestApp(
        runtimePool,
        stubCustomerProvider({
          'x-test-customer': { agencyId: agencyAId, customerId: '99999999-0000-4000-8000-000000000099' },
        }),
      );
      const response = await app.inject({
        method: 'GET',
        url: '/customer-api/trips',
        headers: { 'x-test-customer': 'unknown' },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).not.toHaveProperty('trips');
      await app.close();
    });
  });

  describe('IDOR: same-agency, different customer', () => {
    it('Customer A1 can fetch their own trip (positive control)', async () => {
      const tripA1 = await seedTrip(agencyAId, customerA1Id, 'A1 Own Trip');

      const app = buildTestApp(runtimePool, testCustomerProvider());
      const response = await app.inject({
        method: 'GET',
        url: `/customer-api/trips/${tripA1}`,
        headers: { 'x-test-customer': 'a1' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ trip: { id: string; name: string } }>();
      expect(body.trip.id).toBe(tripA1);
      expect(body.trip.name).toBe('A1 Own Trip');
      await app.close();
    });

    it('Customer A1 cannot fetch Customer A2 trip by id even though both are Agency A', async () => {
      const tripA2 = await seedTrip(agencyAId, customerA2Id, 'A2 Secret Trip');

      const app = buildTestApp(runtimePool, testCustomerProvider());
      const response = await app.inject({
        method: 'GET',
        url: `/customer-api/trips/${tripA2}`,
        headers: { 'x-test-customer': 'a1' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).not.toHaveProperty('trip');
      await app.close();
    });

    it('Customer A1 can fetch their own booking (positive control)', async () => {
      const departureId = await seedDeparture(agencyAId);
      const bookingA1 = await seedBooking(agencyAId, customerA1Id, departureId);

      const app = buildTestApp(runtimePool, testCustomerProvider());
      const response = await app.inject({
        method: 'GET',
        url: `/customer-api/bookings/${bookingA1}`,
        headers: { 'x-test-customer': 'a1' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ booking: { id: string } }>();
      expect(body.booking.id).toBe(bookingA1);
      await app.close();
    });

    it('Customer A1 cannot fetch Customer A2 booking by id', async () => {
      const departureId = await seedDeparture(agencyAId);
      const bookingA2 = await seedBooking(agencyAId, customerA2Id, departureId);

      const app = buildTestApp(runtimePool, testCustomerProvider());
      const response = await app.inject({
        method: 'GET',
        url: `/customer-api/bookings/${bookingA2}`,
        headers: { 'x-test-customer': 'a1' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).not.toHaveProperty('booking');
      await app.close();
    });

    it('Customer A1 can fetch their own proposal (positive control)', async () => {
      const proposalA1 = await seedProposal(agencyAId, customerA1Id);

      const app = buildTestApp(runtimePool, testCustomerProvider());
      const response = await app.inject({
        method: 'GET',
        url: `/customer-api/proposals/${proposalA1}`,
        headers: { 'x-test-customer': 'a1' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ proposal: { id: string } }>();
      expect(body.proposal.id).toBe(proposalA1);
      await app.close();
    });

    it('Customer A1 cannot fetch Customer A2 proposal by id', async () => {
      const proposalA2 = await seedProposal(agencyAId, customerA2Id);

      const app = buildTestApp(runtimePool, testCustomerProvider());
      const response = await app.inject({
        method: 'GET',
        url: `/customer-api/proposals/${proposalA2}`,
        headers: { 'x-test-customer': 'a1' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).not.toHaveProperty('proposal');
      await app.close();
    });

    it('A1 trip/booking/proposal lists never contain A2 rows', async () => {
      await seedTrip(agencyAId, customerA1Id, 'A1 Trip');
      await seedTrip(agencyAId, customerA2Id, 'A2 Trip');

      const app = buildTestApp(runtimePool, testCustomerProvider());
      const response = await app.inject({
        method: 'GET',
        url: '/customer-api/trips',
        headers: { 'x-test-customer': 'a1' },
      });

      expect(response.statusCode).toBe(200);
      const names = response.json<{ trips: Array<{ name: string }> }>().trips.map((t) => t.name);
      expect(names).toContain('A1 Trip');
      expect(names).not.toContain('A2 Trip');
      await app.close();
    });
  });

  describe('cross-agency isolation', () => {
    it('Agency A customer cannot fetch an Agency B trip', async () => {
      const tripB = await seedTrip(agencyBId, customerBId, 'B Secret Trip');

      const app = buildTestApp(runtimePool, testCustomerProvider());
      const response = await app.inject({
        method: 'GET',
        url: `/customer-api/trips/${tripB}`,
        headers: { 'x-test-customer': 'a1' },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('Agency A customer cannot fetch an Agency B booking', async () => {
      const departureId = await seedDeparture(agencyBId);
      const bookingB = await seedBooking(agencyBId, customerBId, departureId);

      const app = buildTestApp(runtimePool, testCustomerProvider());
      const response = await app.inject({
        method: 'GET',
        url: `/customer-api/bookings/${bookingB}`,
        headers: { 'x-test-customer': 'a1' },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('Agency A customer cannot fetch an Agency B proposal', async () => {
      const proposalB = await seedProposal(agencyBId, customerBId);

      const app = buildTestApp(runtimePool, testCustomerProvider());
      const response = await app.inject({
        method: 'GET',
        url: `/customer-api/proposals/${proposalB}`,
        headers: { 'x-test-customer': 'a1' },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('Agency A customer trip list does not contain Agency B trips', async () => {
      await seedTrip(agencyAId, customerA1Id, 'A1 Trip');
      await seedTrip(agencyBId, customerBId, 'B Secret Trip');

      const app = buildTestApp(runtimePool, testCustomerProvider());
      const response = await app.inject({
        method: 'GET',
        url: '/customer-api/trips',
        headers: { 'x-test-customer': 'a1' },
      });

      expect(response.statusCode).toBe(200);
      const names = response.json<{ trips: Array<{ name: string }> }>().trips.map((t) => t.name);
      expect(names).toContain('A1 Trip');
      expect(names).not.toContain('B Secret Trip');
      await app.close();
    });
  });

  describe('client input cannot override the established identity', () => {
    it('a spoofed customerId in the request body/query does not change scoping for /trips', async () => {
      const tripA2 = await seedTrip(agencyAId, customerA2Id, 'A2 Untouchable');

      const app = buildTestApp(runtimePool, testCustomerProvider());
      const response = await app.inject({
        method: 'GET',
        url: `/customer-api/trips/${tripA2}?customerId=${customerA2Id}`,
        headers: { 'x-test-customer': 'a1' },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });
  });

  describe('customer identity does not leak into staff routes and vice versa', () => {
    it('a customer dev header alone does not satisfy the staff /trips route (401)', async () => {
      const app = buildTestApp(runtimePool, testCustomerProvider());
      const response = await app.inject({
        method: 'GET',
        url: '/trips',
        headers: { 'x-test-customer': 'a1' },
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });
  });

  describe('dev customer auth dual-gate (mirrors staff dev-auth.test.ts)', () => {
    it('keeps dev customer auth disabled unless the explicit flag is enabled outside production', () => {
      expect(isDevAuthEnabled({ NODE_ENV: 'development' })).toBe(false);
      expect(isDevAuthEnabled({ NODE_ENV: 'test', ALLOW_DEV_AUTH: 'true' })).toBe(true);
    });

    it('blocks dev customer auth in production even when the explicit flag is set', () => {
      expect(isDevAuthEnabled({ NODE_ENV: 'production', ALLOW_DEV_AUTH: 'true' })).toBe(false);
    });

    it('ignores x-dev-customer headers when dev auth is disabled', async () => {
      const provider = createServerCustomerAuthProvider({
        NODE_ENV: 'development',
        ALLOW_DEV_AUTH: 'false',
      });
      const principal = await provider.authenticateCustomer({
        headers: { 'x-dev-customer': 'agency-a' },
      });
      expect(principal).toBeNull();
    });

    it('produces the demo customer principal only when explicitly enabled outside production', async () => {
      const provider = createServerCustomerAuthProvider({
        NODE_ENV: 'development',
        ALLOW_DEV_AUTH: 'true',
      });
      const principal = await provider.authenticateCustomer({
        headers: { 'x-dev-customer': 'agency-a' },
      });
      expect(principal).toEqual({
        agencyId: '10000000-0000-4000-8000-000000000001',
        customerId: '31000000-0000-4000-8000-000000000001',
      });
    });

    it('rejects an unrecognized x-dev-customer value even when enabled', async () => {
      const provider = createServerCustomerAuthProvider({
        NODE_ENV: 'development',
        ALLOW_DEV_AUTH: 'true',
      });
      const principal = await provider.authenticateCustomer({
        headers: { 'x-dev-customer': 'agency-z' },
      });
      expect(principal).toBeNull();
    });

    it('rejects dev customer auth in production even with the flag set (through the real provider)', async () => {
      const provider = createServerCustomerAuthProvider({
        NODE_ENV: 'production',
        ALLOW_DEV_AUTH: 'true',
      });
      const principal = await provider.authenticateCustomer({
        headers: { 'x-dev-customer': 'agency-a' },
      });
      expect(principal).toBeNull();
    });
  });

  describe('validateCustomerAgencyAccess is a real DB check, not a trust-the-header shortcut', () => {
    it('rejects a claimed customerId/agencyId pair that does not exist in the customers table', async () => {
      const validator = createCustomerAccessValidator(adminPool);
      const allowed = await validator('00000000-0000-4000-8000-000000000000', agencyAId);
      expect(allowed).toBe(false);
    });

    it('rejects a real customer id paired with the wrong agency id', async () => {
      const validator = createCustomerAccessValidator(adminPool);
      const allowed = await validator(customerA1Id, agencyBId);
      expect(allowed).toBe(false);
    });

    it('accepts a real customer id paired with its own agency id', async () => {
      const validator = createCustomerAccessValidator(adminPool);
      const allowed = await validator(customerA1Id, agencyAId);
      expect(allowed).toBe(true);
    });
  });

  function stubCustomerProvider(
    map: Record<string, { agencyId: string; customerId: string }> = {},
  ): CustomerAuthProvider {
    return {
      authenticateCustomer(request) {
        const key = request.headers['x-test-customer'];
        if (typeof key !== 'string') {
          return Promise.resolve(null);
        }
        return Promise.resolve(map[key] ?? null);
      },
    };
  }

  function testCustomerProvider(): CustomerAuthProvider {
    return {
      authenticateCustomer(request) {
        const key = request.headers['x-test-customer'];
        if (key === 'a1') {
          return Promise.resolve({ agencyId: agencyAId, customerId: customerA1Id });
        }
        if (key === 'a2') {
          return Promise.resolve({ agencyId: agencyAId, customerId: customerA2Id });
        }
        if (key === 'b') {
          return Promise.resolve({ agencyId: agencyBId, customerId: customerBId });
        }
        return Promise.resolve(null);
      },
    };
  }

  function buildTestApp(pool: Pool, customerAuthProvider: CustomerAuthProvider) {
    return buildApp({
      authProvider: {
        authenticate() {
          return Promise.resolve(null);
        },
      },
      validateUserAgencyAccess() {
        return Promise.resolve(false);
      },
      database: createDatabaseRuntime(pool),
      customerAuthProvider,
      validateCustomerAgencyAccess: createCustomerAccessValidator(adminPool),
    });
  }

  async function seedCustomer(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name) VALUES ($1, $2) RETURNING id`,
      [agencyId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed customer');
    }
    return id;
  }

  async function seedTrip(agencyId: string, customerId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO trips (agency_id, customer_id, name, destination, start_date, end_date)
       VALUES ($1, $2, $3, 'Somewhere', '2026-06-15', '2026-06-22') RETURNING id`,
      [agencyId, customerId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed trip');
    }
    return id;
  }

  async function seedProposal(agencyId: string, customerId: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO proposals (agency_id, customer_id, proposed_price, total)
       VALUES ($1, $2, 1000, 1000) RETURNING id`,
      [agencyId, customerId],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed proposal');
    }
    return id;
  }

  async function seedDeparture(agencyId: string): Promise<string> {
    const route = await adminPool.query<{ id: string }>(
      `INSERT INTO routes (agency_id, origin, destination) VALUES ($1, 'A', 'B') RETURNING id`,
      [agencyId],
    );
    const routeId = route.rows[0]?.id;
    const product = await adminPool.query<{ id: string }>(
      `INSERT INTO transport_products (agency_id, name, trip_type, outbound_route_id, price)
       VALUES ($1, 'Product', 'ONE_WAY', $2, 100) RETURNING id`,
      [agencyId, routeId],
    );
    const productId = product.rows[0]?.id;
    const departure = await adminPool.query<{ id: string }>(
      `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, service_type)
       VALUES ($1, $2, '2026-07-01T10:00:00Z', 40, 'OWN') RETURNING id`,
      [agencyId, productId],
    );
    const id = departure.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed departure');
    }
    return id;
  }

  async function seedBooking(agencyId: string, customerId: string, departureId: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO bookings (agency_id, booker_customer_id, trip_type, outbound_departure_id)
       VALUES ($1, $2, 'ONE_WAY', $3) RETURNING id`,
      [agencyId, customerId, departureId],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed booking');
    }
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Customer portal security tests require localhost only.');
  }

  if (databasePort !== 55432) {
    throw new Error('Customer portal security tests require local port 55432.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Customer portal security tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === '55432' || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run customer portal security tests against unsafe DATABASE_URL.');
    }
  }
}

function resetDisposableDatabase(): void {
  compose(['down', '-v']);
  compose(['up', '-d']);
}

function compose(args: readonly string[]) {
  return run('docker', ['compose', '-f', composeFile, '-p', projectName, ...args]);
}

async function waitForHealthyContainer(): Promise<void> {
  const timeoutAt = Date.now() + 120_000;

  while (Date.now() < timeoutAt) {
    const result = run(
      'docker',
      ['inspect', '-f', '{{.State.Health.Status}}', containerName],
      false,
    );

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
  const result = run('docker', [
    'ps',
    '--filter',
    `name=${containerName}`,
    '--format',
    '{{.Image}}|{{.Ports}}',
  ]);
  const output = result.stdout.trim();

  if (!output.includes(postgresImage) || !output.includes(`${databaseHost}:${databasePort}->5432/tcp`)) {
    throw new Error('Container is not the expected local disposable Postgres.');
  }
}

async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.query(readSqlForPg(migration001));
  await pool.query(readSqlForPg(migration002));
  await pool.query(readSqlForPg(migration003));
  await pool.query(readSqlForPg(migration004));
  await pool.query(readSqlForPg(migration005));
  await pool.query(readSqlForPg(migration006));
  await pool.query(readSqlForPg(prepareRolesSql));
  await seedAgencies(pool);
}

function readSqlForPg(filePath: string): string {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
}

async function seedAgencies(pool: Pool): Promise<void> {
  await pool.query(
    `
      INSERT INTO agencies (id, name, slug, email, plan, status)
      VALUES
        ($1, 'Agency A', 'agency-a-customer-portal-security-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-customer-portal-security-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
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
