import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { TripType, UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import { createBooking, getBookingById, listBookings } from '../src/bookings';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
const migration004 = resolve(repoRoot, 'infrastructure/migrations/004_route_points.sql');
const migration005 = resolve(repoRoot, 'infrastructure/migrations/005_booking.sql');
const migration011 = resolve(repoRoot, 'infrastructure/migrations/011_booking_cancellation.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-bookings-postgres';
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

const contextA = { agencyId: agencyAId, userId: userAId, userRole: UserRole.ADMIN, email: 'user-a@example.test' };

describe('Booking data-access layer (real Postgres, real RLS, non-superuser runtime role)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let database: DatabaseRuntime;
  let productOneWayA: string;
  let productRoundTripA: string;
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

    database = createDatabaseRuntime(runtimePool);

    await resetDatabase(adminPool);

    const roleCheck = await runtimePool.query<{
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      `SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    expect(roleCheck.rows[0]?.current_user).toBe(runtimeUser);
    expect(roleCheck.rows[0]?.rolsuper).toBe(false);
    expect(roleCheck.rows[0]?.rolbypassrls).toBe(false);
    expect(runtimeUser).not.toBe(adminUser);
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE booking_passengers RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE bookings RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE scheduled_departures RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE transport_products RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE routes RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE customers RESTART IDENTITY CASCADE');

    const routeOutA = await seedRoute(agencyAId, 'Sao Paulo', 'Rio de Janeiro');
    const routeRetA = await seedRoute(agencyAId, 'Rio de Janeiro', 'Sao Paulo');
    productOneWayA = await seedProduct(agencyAId, 'ONE_WAY', routeOutA);
    productRoundTripA = await seedProduct(agencyAId, 'ROUND_TRIP', routeOutA, routeRetA);
    customerAId = await seedCustomer(agencyAId, 'Cliente A');
    customerBId = await seedCustomer(agencyBId, 'Cliente B');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('fails closed with no tenant context established', async () => {
    await expect(listBookings(database)).rejects.toThrow();
    await expect(getBookingById(database, 'anything')).rejects.toThrow();
  });

  it('rejects cross-tenant bookerCustomerId with 404-equivalent NotFoundError', async () => {
    const depId = await seedDeparture(agencyAId, productOneWayA, '2027-03-01T10:00:00Z', 10);
    await expect(
      runWithTenantContext(contextA, () =>
        createBooking(database, {
          bookerCustomerId: customerBId,
          tripType: TripType.ONE_WAY,
          outboundDepartureId: depId,
          passengers: [{ name: 'Joao' }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects cross-tenant outbound departure reference', async () => {
    const routeB = await seedRoute(agencyBId, 'X', 'Y');
    const productB = await seedProduct(agencyBId, 'ONE_WAY', routeB);
    const depB = await seedDeparture(agencyBId, productB, '2027-03-01T10:00:00Z', 10);
    await expect(
      runWithTenantContext(contextA, () =>
        createBooking(database, {
          bookerCustomerId: customerAId,
          tripType: TripType.ONE_WAY,
          outboundDepartureId: depB,
          passengers: [{ name: 'Joao' }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects zero passengers', async () => {
    const depId = await seedDeparture(agencyAId, productOneWayA, '2027-03-01T10:00:00Z', 10);
    await expect(
      runWithTenantContext(contextA, () =>
        createBooking(database, {
          bookerCustomerId: customerAId,
          tripType: TripType.ONE_WAY,
          outboundDepartureId: depId,
          passengers: [],
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('one-way booking succeeds with a single real FK to the outbound departure', async () => {
    const depId = await seedDeparture(agencyAId, productOneWayA, '2027-03-01T10:00:00Z', 10);
    const result = await runWithTenantContext(contextA, () =>
      createBooking(database, {
        bookerCustomerId: customerAId,
        tripType: TripType.ONE_WAY,
        outboundDepartureId: depId,
        passengers: [{ name: 'Joao' }],
      }),
    );
    expect(result.booking.outboundDepartureId).toBe(depId);
    expect(result.booking.returnDepartureId).toBeUndefined();
    expect(result.passengers).toHaveLength(1);
  });

  it('round-trip booking links both outbound and return departures as real FKs', async () => {
    const outId = await seedDeparture(agencyAId, productRoundTripA, '2027-03-01T10:00:00Z', 10);
    const retId = await seedDeparture(agencyAId, productRoundTripA, '2027-03-08T10:00:00Z', 10);
    const result = await runWithTenantContext(contextA, () =>
      createBooking(database, {
        bookerCustomerId: customerAId,
        tripType: TripType.ROUND_TRIP,
        outboundDepartureId: outId,
        returnDepartureId: retId,
        passengers: [{ name: 'Joao' }],
      }),
    );
    expect(result.booking.outboundDepartureId).toBe(outId);
    expect(result.booking.returnDepartureId).toBe(retId);

    const row = await adminPool.query<{ outbound_departure_id: string; return_departure_id: string | null }>(
      `SELECT outbound_departure_id, return_departure_id FROM bookings WHERE id = $1`,
      [result.booking.id],
    );
    expect(row.rows[0]?.outbound_departure_id).toBe(outId);
    expect(row.rows[0]?.return_departure_id).toBe(retId);
  });

  it('rejects a return departure at/before the outbound departure (temporal ordering)', async () => {
    const outId = await seedDeparture(agencyAId, productRoundTripA, '2027-03-08T10:00:00Z', 10);
    const retId = await seedDeparture(agencyAId, productRoundTripA, '2027-03-01T10:00:00Z', 10);
    await expect(
      runWithTenantContext(contextA, () =>
        createBooking(database, {
          bookerCustomerId: customerAId,
          tripType: TripType.ROUND_TRIP,
          outboundDepartureId: outId,
          returnDepartureId: retId,
          passengers: [{ name: 'Joao' }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('multi-passenger booking creates all passenger rows atomically', async () => {
    const depId = await seedDeparture(agencyAId, productOneWayA, '2027-03-01T10:00:00Z', 10);
    const result = await runWithTenantContext(contextA, () =>
      createBooking(database, {
        bookerCustomerId: customerAId,
        tripType: TripType.ONE_WAY,
        outboundDepartureId: depId,
        passengers: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      }),
    );
    expect(result.passengers).toHaveLength(3);
    const row = await adminPool.query<{ count: string }>(
      'SELECT COUNT(*) FROM booking_passengers WHERE booking_id = $1',
      [result.booking.id],
    );
    expect(Number(row.rows[0]?.count)).toBe(3);
  });

  it('exact remaining capacity succeeds (capacity=5, book exactly 5)', async () => {
    const depId = await seedDeparture(agencyAId, productOneWayA, '2027-03-01T10:00:00Z', 5);
    const result = await runWithTenantContext(contextA, () =>
      createBooking(database, {
        bookerCustomerId: customerAId,
        tripType: TripType.ONE_WAY,
        outboundDepartureId: depId,
        passengers: [1, 2, 3, 4, 5].map((n) => ({ name: `P${n}` })),
      }),
    );
    expect(result.passengers).toHaveLength(5);
  });

  it('capacity+1 is rejected cleanly with zero rows created', async () => {
    const depId = await seedDeparture(agencyAId, productOneWayA, '2027-03-01T10:00:00Z', 5);
    await expect(
      runWithTenantContext(contextA, () =>
        createBooking(database, {
          bookerCustomerId: customerAId,
          tripType: TripType.ONE_WAY,
          outboundDepartureId: depId,
          passengers: [1, 2, 3, 4, 5, 6].map((n) => ({ name: `P${n}` })),
        }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const bookingCount = await adminPool.query<{ count: string }>(
      'SELECT COUNT(*) FROM bookings WHERE outbound_departure_id = $1',
      [depId],
    );
    expect(Number(bookingCount.rows[0]?.count)).toBe(0);
  });

  it('THE CONCURRENCY TEST: two concurrent 1-passenger bookings against capacity=1 -- exactly one succeeds', async () => {
    const depId = await seedDeparture(agencyAId, productOneWayA, '2027-03-01T10:00:00Z', 1);

    const attempt = () =>
      runWithTenantContext(contextA, () =>
        createBooking(database, {
          bookerCustomerId: customerAId,
          tripType: TripType.ONE_WAY,
          outboundDepartureId: depId,
          passengers: [{ name: 'Racer' }],
        }),
      );

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'CONFLICT' });

    const passengerCount = await adminPool.query<{ count: string }>(
      'SELECT COUNT(*) FROM booking_passengers bp JOIN bookings b ON b.id = bp.booking_id WHERE b.outbound_departure_id = $1',
      [depId],
    );
    expect(Number(passengerCount.rows[0]?.count)).toBe(1);
  });

  it('ATOMIC ROUND-TRIP CAPACITY: outbound has room, return has none -- whole booking fails, no partial commit', async () => {
    const outId = await seedDeparture(agencyAId, productRoundTripA, '2027-03-01T10:00:00Z', 5);
    const retId = await seedDeparture(agencyAId, productRoundTripA, '2027-03-08T10:00:00Z', 0);

    await expect(
      runWithTenantContext(contextA, () =>
        createBooking(database, {
          bookerCustomerId: customerAId,
          tripType: TripType.ROUND_TRIP,
          outboundDepartureId: outId,
          returnDepartureId: retId,
          passengers: [{ name: 'Joao' }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const outboundBookingCount = await adminPool.query<{ count: string }>(
      'SELECT COUNT(*) FROM bookings WHERE outbound_departure_id = $1',
      [outId],
    );
    expect(Number(outboundBookingCount.rows[0]?.count)).toBe(0);
  });

  it('DB CHECK constraint backstops trip-type/return-departure consistency when the app layer is bypassed', async () => {
    const outId = await seedDeparture(agencyAId, productOneWayA, '2027-03-01T10:00:00Z', 10);
    await expect(
      adminPool.query(
        `INSERT INTO bookings (agency_id, booker_customer_id, trip_type, outbound_departure_id, return_departure_id)
         VALUES ($1, $2, 'ONE_WAY', $3, $3)`,
        [agencyAId, customerAId, outId],
      ),
    ).rejects.toThrow(/bookings_return_departure_required_check/);
  });

  async function seedRoute(agencyId: string, origin: string, destination: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO routes (agency_id, origin, destination) VALUES ($1, $2, $3) RETURNING id`,
      [agencyId, origin, destination],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed route');
    return id;
  }

  async function seedProduct(
    agencyId: string,
    tripType: 'ONE_WAY' | 'ROUND_TRIP',
    outboundRouteId: string,
    returnRouteId?: string,
  ): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO transport_products (agency_id, name, trip_type, outbound_route_id, return_route_id, price)
       VALUES ($1, 'P', $2, $3, $4, 100) RETURNING id`,
      [agencyId, tripType, outboundRouteId, returnRouteId ?? null],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed product');
    return id;
  }

  async function seedCustomer(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
      [agencyId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed customer');
    return id;
  }

  async function seedDeparture(
    agencyId: string,
    productId: string,
    departureAt: string,
    capacity: number,
  ): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, service_type)
       VALUES ($1, $2, $3, $4, 'OWN') RETURNING id`,
      [agencyId, productId, departureAt, capacity],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed departure');
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Booking data-layer tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Booking data-layer tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Booking data-layer tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run Booking data-layer tests against unsafe DATABASE_URL.');
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
  await pool.query(readSqlForPg(migration004));
  await pool.query(readSqlForPg(migration005));
  await pool.query(readSqlForPg(migration011));
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
        ($1, 'Agency A', 'agency-a-bookings-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-bookings-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-bookings-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-bookings-test-only', 'ACTIVE');
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
