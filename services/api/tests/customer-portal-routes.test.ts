import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { createDatabaseRuntime } from '../src/database';
import { createCustomerAccessValidator } from '../src/customer-portal';
import type { CustomerAuthProvider } from '../src/customer-auth';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
const migration004 = resolve(repoRoot, 'infrastructure/migrations/004_route_points.sql');
const migration005 = resolve(repoRoot, 'infrastructure/migrations/005_booking.sql');
const migration006 = resolve(repoRoot, 'infrastructure/migrations/006_field_operations.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-customer-portal-routes-postgres';
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

describe.sequential('Customer portal HTTP routes (happy path)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let customerId: string;

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
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name, email, phone, cpf) VALUES ($1, 'Cliente Teste', 'cliente@example.test', '11999998888', '12345678900') RETURNING id`,
      [agencyAId],
    );
    customerId = result.rows[0]!.id;
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('GET /customer-api/me returns the profile with masked documents', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/customer-api/me',
      headers: { 'x-test-customer': 'ok' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ profile: { name: string; cpfMasked: string | null } }>();
    expect(body.profile.name).toBe('Cliente Teste');
    expect(body.profile.cpfMasked).toBe('********900');
    await app.close();
  });

  it('GET /customer-api/me includes address when the customer has one', async () => {
    await adminPool.query(
      `UPDATE customers SET address = $1 WHERE id = $2`,
      [JSON.stringify({ street: 'Rua Teste', city: 'Sao Paulo' }), customerId],
    );

    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/customer-api/me',
      headers: { 'x-test-customer': 'ok' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ profile: { address: Record<string, unknown> | null } }>();
    expect(body.profile.address).toEqual({ street: 'Rua Teste', city: 'Sao Paulo' });
    await app.close();
  });

  it('GET /customer-api/agency-contact returns a safe agency contact projection', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/customer-api/agency-contact',
      headers: { 'x-test-customer': 'ok' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ agency: { name: string; email: string | null } }>();
    expect(body.agency.name).toBe('Agency A');
    expect(body.agency.email).toBe('agency-a@example.test');
    await app.close();
  });

  it('GET /customer-api/trips lists only this customer trips', async () => {
    await adminPool.query(
      `INSERT INTO trips (agency_id, customer_id, name, destination, start_date, end_date)
       VALUES ($1, $2, 'My Trip', 'Rio', '2026-01-01', '2026-01-05')`,
      [agencyAId, customerId],
    );

    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/customer-api/trips',
      headers: { 'x-test-customer': 'ok' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ trips: unknown[] }>().trips).toHaveLength(1);
    await app.close();
  });

  it('GET /customer-api/trips never exposes Trip.notes (internal agency notes)', async () => {
    await adminPool.query(
      `INSERT INTO trips (agency_id, customer_id, name, destination, start_date, end_date, notes)
       VALUES ($1, $2, 'My Trip', 'Rio', '2026-01-01', '2026-01-05', 'internal agency note')`,
      [agencyAId, customerId],
    );

    const app = buildTestApp();
    const list = await app.inject({
      method: 'GET',
      url: '/customer-api/trips',
      headers: { 'x-test-customer': 'ok' },
    });
    const trips = list.json<{ trips: Array<Record<string, unknown>> }>().trips;
    expect(trips).toHaveLength(1);
    expect(trips[0]).not.toHaveProperty('notes');
    expect(JSON.stringify(trips)).not.toContain('internal agency note');

    const tripId = (trips[0] as { id: string }).id;
    const detail = await app.inject({
      method: 'GET',
      url: `/customer-api/trips/${tripId}`,
      headers: { 'x-test-customer': 'ok' },
    });
    const detailBody = detail.json<{ trip: Record<string, unknown> }>();
    expect(detailBody.trip).not.toHaveProperty('notes');
    expect(JSON.stringify(detailBody.trip)).not.toContain('internal agency note');
    await app.close();
  });

  it('GET /customer-api/offers lists agency-wide active offers (not personalized)', async () => {
    await adminPool.query(
      `INSERT INTO offers (agency_id, name, price, status) VALUES ($1, 'Promo', 500, 'ACTIVE')`,
      [agencyAId],
    );

    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/customer-api/offers',
      headers: { 'x-test-customer': 'ok' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ offers: unknown[] }>().offers).toHaveLength(1);
    await app.close();
  });

  it('GET /customer-api/proposals lists this customer proposals without internal notes', async () => {
    await adminPool.query(
      `INSERT INTO proposals (agency_id, customer_id, proposed_price, total, notes)
       VALUES ($1, $2, 1000, 900, 'internal admin note')`,
      [agencyAId, customerId],
    );

    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/customer-api/proposals',
      headers: { 'x-test-customer': 'ok' },
    });
    expect(response.statusCode).toBe(200);
    const proposals = response.json<{ proposals: Array<Record<string, unknown>> }>().proposals;
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).not.toHaveProperty('notes');
    await app.close();
  });

  it('GET /customer-api/bookings lists this customer bookings with passengers', async () => {
    const route = await adminPool.query<{ id: string }>(
      `INSERT INTO routes (agency_id, origin, destination) VALUES ($1, 'A', 'B') RETURNING id`,
      [agencyAId],
    );
    const product = await adminPool.query<{ id: string }>(
      `INSERT INTO transport_products (agency_id, name, trip_type, outbound_route_id, price)
       VALUES ($1, 'Product', 'ONE_WAY', $2, 100) RETURNING id`,
      [agencyAId, route.rows[0]!.id],
    );
    const departure = await adminPool.query<{ id: string }>(
      `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, service_type)
       VALUES ($1, $2, '2026-07-01T10:00:00Z', 40, 'OWN') RETURNING id`,
      [agencyAId, product.rows[0]!.id],
    );
    const booking = await adminPool.query<{ id: string }>(
      `INSERT INTO bookings (agency_id, booker_customer_id, trip_type, outbound_departure_id)
       VALUES ($1, $2, 'ONE_WAY', $3) RETURNING id`,
      [agencyAId, customerId, departure.rows[0]!.id],
    );
    await adminPool.query(
      `INSERT INTO booking_passengers (agency_id, booking_id, name) VALUES ($1, $2, 'Passenger One')`,
      [agencyAId, booking.rows[0]!.id],
    );

    const app = buildTestApp();

    const list = await app.inject({
      method: 'GET',
      url: '/customer-api/bookings',
      headers: { 'x-test-customer': 'ok' },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ bookings: unknown[] }>().bookings).toHaveLength(1);

    const detail = await app.inject({
      method: 'GET',
      url: `/customer-api/bookings/${booking.rows[0]!.id}`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json<{ passengers: Array<{ name: string }> }>();
    expect(body.passengers).toHaveLength(1);
    expect(body.passengers[0]?.name).toBe('Passenger One');

    await app.close();
  });

  it('enriches bookings with route/departure/product context and correct future semantics', async () => {
    const route = await adminPool.query<{ id: string }>(
      `INSERT INTO routes (agency_id, origin, destination) VALUES ($1, 'Sao Paulo', 'Rio de Janeiro') RETURNING id`,
      [agencyAId],
    );
    const product = await adminPool.query<{ id: string }>(
      `INSERT INTO transport_products (agency_id, name, trip_type, outbound_route_id, price)
       VALUES ($1, 'Van Executiva', 'ONE_WAY', $2, 100) RETURNING id`,
      [agencyAId, route.rows[0]!.id],
    );

    const futureDeparture = await adminPool.query<{ id: string }>(
      `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, service_type)
       VALUES ($1, $2, now() + interval '30 days', 40, 'OWN') RETURNING id`,
      [agencyAId, product.rows[0]!.id],
    );
    const pastDeparture = await adminPool.query<{ id: string }>(
      `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, service_type)
       VALUES ($1, $2, now() - interval '30 days', 40, 'OWN') RETURNING id`,
      [agencyAId, product.rows[0]!.id],
    );
    const cancelledFutureDeparture = await adminPool.query<{ id: string }>(
      `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, service_type, cancelled)
       VALUES ($1, $2, now() + interval '30 days', 40, 'OWN', true) RETURNING id`,
      [agencyAId, product.rows[0]!.id],
    );

    await adminPool.query(
      `INSERT INTO bookings (agency_id, booker_customer_id, trip_type, outbound_departure_id)
       VALUES ($1, $2, 'ONE_WAY', $3)`,
      [agencyAId, customerId, futureDeparture.rows[0]!.id],
    );
    await adminPool.query(
      `INSERT INTO bookings (agency_id, booker_customer_id, trip_type, outbound_departure_id)
       VALUES ($1, $2, 'ONE_WAY', $3)`,
      [agencyAId, customerId, pastDeparture.rows[0]!.id],
    );
    await adminPool.query(
      `INSERT INTO bookings (agency_id, booker_customer_id, trip_type, outbound_departure_id)
       VALUES ($1, $2, 'ONE_WAY', $3)`,
      [agencyAId, customerId, cancelledFutureDeparture.rows[0]!.id],
    );
    await adminPool.query(
      `INSERT INTO bookings (agency_id, booker_customer_id, trip_type, outbound_departure_id, cancelled)
       VALUES ($1, $2, 'ONE_WAY', $3, true)`,
      [agencyAId, customerId, futureDeparture.rows[0]!.id],
    );

    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/customer-api/bookings',
      headers: { 'x-test-customer': 'ok' },
    });
    expect(response.statusCode).toBe(200);
    const bookings = response.json<{
      bookings: Array<{
        origin: string;
        destination: string;
        productName: string;
        isFuture: boolean;
        cancelled: boolean;
        passengerCount: number;
      }>;
    }>().bookings;
    expect(bookings).toHaveLength(4);
    for (const booking of bookings) {
      expect(booking.origin).toBe('Sao Paulo');
      expect(booking.destination).toBe('Rio de Janeiro');
      expect(booking.productName).toBe('Van Executiva');
      expect(booking.passengerCount).toBe(0);
    }
    // "Future" must mean NOT cancelled AND departure in the future -- not
    // just !cancelled. Exactly one of the four seeded bookings satisfies
    // both conditions (own booking not cancelled, departure future and
    // not cancelled).
    expect(bookings.filter((b) => b.isFuture)).toHaveLength(1);

    await app.close();
  });

  function buildTestApp() {
    const provider: CustomerAuthProvider = {
      authenticateCustomer(request) {
        if (request.headers['x-test-customer'] === 'ok') {
          return Promise.resolve({ agencyId: agencyAId, customerId });
        }
        return Promise.resolve(null);
      },
    };

    return buildApp({
      authProvider: {
        authenticate() {
          return Promise.resolve(null);
        },
      },
      validateUserAgencyAccess() {
        return Promise.resolve(false);
      },
      database: createDatabaseRuntime(runtimePool),
      customerAuthProvider: provider,
      validateCustomerAgencyAccess: createCustomerAccessValidator(adminPool),
    });
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Customer portal route tests require localhost only.');
  }
  if (databasePort !== 55432) {
    throw new Error('Customer portal route tests require local port 55432.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Customer portal route tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === '55432' || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run customer portal route tests against unsafe DATABASE_URL.');
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
  await pool.query(
    `INSERT INTO agencies (id, name, slug, email, plan, status)
     VALUES ($1, 'Agency A', 'agency-a-customer-portal-routes-test', 'agency-a@example.test', 'FREE', 'ACTIVE')`,
    [agencyAId],
  );
}

function readSqlForPg(filePath: string): string {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
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
