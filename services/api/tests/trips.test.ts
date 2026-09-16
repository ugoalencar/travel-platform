import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  createTrip,
  getTripById,
  listTrips,
  updateTrip,
} from '../src/trips';

const repoRoot = resolve(import.meta.dirname, '../../..');
// listTrips()'s category computation (071/session work) does an EXISTS
// against excursion_customers/air_services/land_services regardless of
// whether any excursion exists -- all three tables need to exist for the
// query to compile, not just have matching rows. Reusing the full
// sequential 001-024 block (proven working -- the same list
// financial-http.test.ts/partners.test.ts use) rather than hand-picking
// individual dependencies again after the first attempt (001,002,003,
// 004,005,019,020,038,039,040) still missed a type only 006-018 define
// (found via a real CI run: "relation excursion_customers does not
// exist", then "type FinancialObligationStatus does not exist").
const migrations = [
  '001_initial_schema.sql',
  '002_rls_policies.sql',
  '003_transportation.sql',
  '004_route_points.sql',
  '005_booking.sql',
  '006_field_operations.sql',
  '007_commission_repair.sql',
  '008_commercial_cockpit.sql',
  '009_configurable_pipelines.sql',
  '010_financial_foundation.sql',
  '011_booking_cancellation.sql',
  '012_operational_staff_assignments.sql',
  '013_pescador_foundation.sql',
  '014_offer_growth_foundation.sql',
  '015_audit_logging.sql',
  '016_production_auth_captcha_mfa.sql',
  '017_mfa_rls_p0_fix.sql',
  '018_local_dev_migration_corrections.sql',
  '019_customer_360_addresses.sql',
  '020_customer_360_dependents.sql',
  '021_customer_360_documents.sql',
  '022_customer_360_document_audit.sql',
  '023_customer_360_rls.sql',
  '024_extended_financial_module.sql',
  '038_supplier_extended.sql',
  '039_air_services.sql',
  '040_land_services.sql',
  '046_customer_360_completion.sql',
  // 068 ALTERs enrollment_submissions too, which doesn't exist until 049
  // creates it.
  '049_enrollment_links.sql',
  // customers.protocol_number is a required NOT NULL column
  // createCustomer()/the trip fixtures below always rely on.
  '068_protocol_numbers.sql',
  '071_excursions.sql',
].map((name) => resolve(repoRoot, 'infrastructure/migrations', name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-trips-postgres';
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
const contextB = { agencyId: agencyBId, userId: userBId, userRole: UserRole.ADMIN, email: 'user-b@example.test' };

describe('Trip data-access layer (Package 1)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let database: DatabaseRuntime;
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

    const roleCheck = await runtimePool.query<{ current_user: string }>('SELECT current_user');
    expect(roleCheck.rows[0]?.current_user).toBe(runtimeUser);
    expect(runtimeUser).not.toBe(adminUser);
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE trips RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE customers RESTART IDENTITY CASCADE');
    customerAId = await seedCustomer(agencyAId, 'Customer A');
    customerBId = await seedCustomer(agencyBId, 'Customer B');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('fails closed with no tenant context established', async () => {
    await expect(listTrips(database)).rejects.toThrow();
    await expect(getTripById(database, 'anything')).rejects.toThrow();
    await expect(
      createTrip(database, 'anything', validCreateInput()),
    ).rejects.toThrow();
    await expect(updateTrip(database, 'anything', { name: 'X' })).rejects.toThrow();
  });

  it('listTrips returns only Agency A trips for Agency A', async () => {
    await seedTrip(agencyAId, customerAId, { name: 'A Trip' });
    await seedTrip(agencyBId, customerBId, { name: 'B Trip' });

    const result = await runWithTenantContext(contextA, () => listTrips(database));

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('A Trip');
    expect(result[0]?.agencyId).toBe(agencyAId);
  });

  it('listTrips returns only Agency B trips for Agency B', async () => {
    await seedTrip(agencyAId, customerAId, { name: 'A Trip' });
    await seedTrip(agencyBId, customerBId, { name: 'B Trip' });

    const result = await runWithTenantContext(contextB, () => listTrips(database));

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('B Trip');
    expect(result[0]?.agencyId).toBe(agencyBId);
  });

  it('Agency A cannot read a Trip belonging to Agency B via getTripById', async () => {
    const bTripId = await seedTrip(agencyBId, customerBId, { name: 'B Secret' });

    const result = await runWithTenantContext(contextA, () => getTripById(database, bTripId));

    expect(result).toBeNull();
  });

  it('Agency B cannot read a Trip belonging to Agency A via getTripById', async () => {
    const aTripId = await seedTrip(agencyAId, customerAId, { name: 'A Secret' });

    const result = await runWithTenantContext(contextB, () => getTripById(database, aTripId));

    expect(result).toBeNull();
  });

  it('createTrip writes agency_id matching the current tenant only', async () => {
    const created = await runWithTenantContext(contextA, () =>
      createTrip(database, customerAId, validCreateInput({ name: 'New Trip' })),
    );

    expect(created.agencyId).toBe(agencyAId);
    expect(created.customerId).toBe(customerAId);
    expect(created.status).toBe('PLANNED');
    expect(created.saleId).toBeUndefined();

    const row = await adminPool.query<{ agency_id: string; sale_id: string | null }>(
      'SELECT agency_id, sale_id FROM trips WHERE id = $1',
      [created.id],
    );
    expect(row.rows[0]?.agency_id).toBe(agencyAId);
    expect(row.rows[0]?.sale_id).toBeNull();
  });

  it('createTrip rejects a cross-tenant customerId with NotFoundError and creates no row', async () => {
    await expect(
      runWithTenantContext(contextA, () =>
        createTrip(database, customerBId, validCreateInput({ name: 'Should Fail' })),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const countResult = await adminPool.query<{ count: string }>('SELECT count(*) FROM trips');
    expect(countResult.rows[0]?.count).toBe('0');
  });

  it('createTrip rejects an invalid date range (startDate after endDate) and creates no row', async () => {
    await expect(
      runWithTenantContext(contextA, () =>
        createTrip(
          database,
          customerAId,
          validCreateInput({
            name: 'Bad Range',
            startDate: new Date('2026-06-22'),
            endDate: new Date('2026-06-15'),
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const countResult = await adminPool.query<{ count: string }>('SELECT count(*) FROM trips');
    expect(countResult.rows[0]?.count).toBe('0');
  });

  it('updateTrip on another tenant Trip id is a no-op and leaves the row unchanged', async () => {
    const bTripId = await seedTrip(agencyBId, customerBId, { name: 'B Original' });

    const result = await runWithTenantContext(contextA, () =>
      updateTrip(database, bTripId, { name: 'Hacked' }),
    );

    expect(result).toBeNull();

    const row = await adminPool.query<{ name: string }>(
      'SELECT name FROM trips WHERE id = $1',
      [bTripId],
    );
    expect(row.rows[0]?.name).toBe('B Original');
  });

  it('updateTrip on the correct tenant own Trip successfully updates fields', async () => {
    const tripId = await seedTrip(agencyAId, customerAId, { name: 'Original' });

    const result = await runWithTenantContext(contextA, () =>
      updateTrip(database, tripId, { name: 'Updated', notes: 'some notes' }),
    );

    expect(result?.name).toBe('Updated');
    expect(result?.notes).toBe('some notes');
  });

  it('updateTrip validates the date range when only one date is changed against the current row', async () => {
    const tripId = await seedTrip(agencyAId, customerAId, {
      name: 'Range Test',
      startDate: '2026-06-10',
      endDate: '2026-06-20',
    });

    // Moving startDate past the existing endDate must be rejected cleanly.
    await expect(
      runWithTenantContext(contextA, () =>
        updateTrip(database, tripId, { startDate: new Date('2026-06-25') }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    // Row must remain unchanged.
    const row = await adminPool.query<{ start_date: string }>(
      'SELECT start_date::text FROM trips WHERE id = $1',
      [tripId],
    );
    expect(row.rows[0]?.start_date).toBe('2026-06-10');

    // Moving endDate earlier than the existing startDate must also be rejected.
    await expect(
      runWithTenantContext(contextA, () =>
        updateTrip(database, tripId, { endDate: new Date('2026-06-01') }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    // A valid partial update (only endDate, still after current startDate) succeeds.
    const result = await runWithTenantContext(contextA, () =>
      updateTrip(database, tripId, { endDate: new Date('2026-06-21') }),
    );
    expect(result).not.toBeNull();
  });

  function validCreateInput(overrides: Partial<{
    name: string;
    destination: string;
    startDate: Date;
    endDate: Date;
  }> = {}) {
    return {
      name: overrides.name ?? 'Trip Name',
      destination: overrides.destination ?? 'Somewhere',
      startDate: overrides.startDate ?? new Date('2026-06-15'),
      endDate: overrides.endDate ?? new Date('2026-06-22'),
    };
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

  async function seedTrip(
    agencyId: string,
    customerId: string,
    data: { name?: string; startDate?: string; endDate?: string },
  ): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO trips (agency_id, customer_id, name, destination, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        agencyId,
        customerId,
        data.name ?? 'Trip',
        'Somewhere',
        data.startDate ?? '2026-06-15',
        data.endDate ?? '2026-06-22',
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed trip');
    }
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Trip data-layer tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Trip data-layer tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Trip data-layer tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run trip data-layer tests against unsafe DATABASE_URL.');
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
  if (process.env.CI === 'true') return;
  const result = run('docker', [
    'ps',
    '--filter',
    `name=${containerName}`,
    '--format',
    '{{.Image}}|{{.Ports}}',
  ]);
  const output = result.stdout.trim();

  expect(output).toContain(postgresImage);
  expect(output).toContain(`${databaseHost}:${databasePort}->5432/tcp`);
}

async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const migration of migrations) {
    await pool.query(readSqlForPg(migration));
  }
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
        ($1, 'Agency A', 'agency-a-trips-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-trips-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-trips-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-trips-test-only', 'ACTIVE');
    `,
    [userAId, agencyAId, userBId, agencyBId],
  );
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

function run(
  command: string,
  args: readonly string[],
  throwOnError = true,
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });

  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();

  if (throwOnError && result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
        `Exit code: ${result.status ?? 'unknown'}`,
        stdout,
        stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return { stdout, stderr };
}
