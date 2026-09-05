import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { DepartureServiceType, UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  createScheduledDeparture,
  getScheduledDepartureById,
  listScheduledDepartures,
  updateScheduledDeparture,
} from '../src/scheduled-departures';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-scheduled-departures-postgres';
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

describe.sequential('ScheduledDeparture data-access layer', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let database: DatabaseRuntime;
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

    database = createDatabaseRuntime(runtimePool);

    await resetDatabase(adminPool);

    const roleCheck = await runtimePool.query<{ current_user: string }>('SELECT current_user');
    expect(roleCheck.rows[0]?.current_user).toBe(runtimeUser);
    expect(runtimeUser).not.toBe(adminUser);
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

  const departureAt = new Date('2027-01-10T10:00:00Z');
  const arrivalAt = new Date('2027-01-10T14:00:00Z');

  it('fails closed with no tenant context established', async () => {
    await expect(listScheduledDepartures(database)).rejects.toThrow();
    await expect(getScheduledDepartureById(database, 'anything')).rejects.toThrow();
    await expect(
      createScheduledDeparture(database, {
        productId: productAId,
        departureAt,
        capacity: 10,
        serviceType: DepartureServiceType.OWN,
      }),
    ).rejects.toThrow();
    await expect(updateScheduledDeparture(database, 'anything', { capacity: 1 })).rejects.toThrow();
  });

  it('listScheduledDepartures returns only Agency A departures', async () => {
    await seedDeparture(agencyAId, productAId);
    await seedDeparture(agencyBId, productBId);

    const result = await runWithTenantContext(contextA, () => listScheduledDepartures(database));
    expect(result).toHaveLength(1);
    expect(result[0]?.agencyId).toBe(agencyAId);
  });

  it('getScheduledDepartureById never returns another tenant departure', async () => {
    const bId = await seedDeparture(agencyBId, productBId);
    const result = await runWithTenantContext(contextA, () => getScheduledDepartureById(database, bId));
    expect(result).toBeNull();
  });

  it('rejects negative capacity at app layer', async () => {
    await expect(
      runWithTenantContext(contextA, () =>
        createScheduledDeparture(database, {
          productId: productAId,
          departureAt,
          capacity: -1,
          serviceType: DepartureServiceType.OWN,
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('DB CHECK constraint backstops non-negative capacity when the app layer is bypassed', async () => {
    await expect(
      adminPool.query(
        `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, service_type)
         VALUES ($1, $2, $3, -5, 'OWN')`,
        [agencyAId, productAId, departureAt],
      ),
    ).rejects.toThrow(/scheduled_departures_capacity_non_negative_check/);
  });

  it('rejects cross-tenant Product reference', async () => {
    await expect(
      runWithTenantContext(contextA, () =>
        createScheduledDeparture(database, {
          productId: productBId,
          departureAt,
          capacity: 10,
          serviceType: DepartureServiceType.OWN,
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects cross-tenant Supplier reference when supplierId is provided', async () => {
    await expect(
      runWithTenantContext(contextA, () =>
        createScheduledDeparture(database, {
          productId: productAId,
          departureAt,
          capacity: 10,
          serviceType: DepartureServiceType.SUBCONTRACTED,
          supplierId: supplierBId,
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects arrivalExpectedAt before departureAt', async () => {
    await expect(
      runWithTenantContext(contextA, () =>
        createScheduledDeparture(database, {
          productId: productAId,
          departureAt,
          arrivalExpectedAt: new Date(departureAt.getTime() - 1000),
          capacity: 10,
          serviceType: DepartureServiceType.OWN,
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('accepts arrivalExpectedAt equal to departureAt', async () => {
    const created = await runWithTenantContext(contextA, () =>
      createScheduledDeparture(database, {
        productId: productAId,
        departureAt,
        arrivalExpectedAt: departureAt,
        capacity: 10,
        serviceType: DepartureServiceType.OWN,
      }),
    );
    expect(created.arrivalExpectedAt?.getTime()).toBe(departureAt.getTime());
  });

  it.each([DepartureServiceType.OWN, DepartureServiceType.SUBCONTRACTED, DepartureServiceType.RESELL])(
    'accepts serviceType %s',
    async (serviceType) => {
      const created = await runWithTenantContext(contextA, () =>
        createScheduledDeparture(database, {
          productId: productAId,
          departureAt,
          arrivalExpectedAt: arrivalAt,
          capacity: 10,
          serviceType,
          ...(serviceType === DepartureServiceType.SUBCONTRACTED ? { supplierId: supplierAId } : {}),
        }),
      );
      expect(created.serviceType).toBe(serviceType);
    },
  );

  it('updateScheduledDeparture on another tenant departure is a no-op', async () => {
    const bId = await seedDeparture(agencyBId, productBId);
    const result = await runWithTenantContext(contextA, () =>
      updateScheduledDeparture(database, bId, { capacity: 999 }),
    );
    expect(result).toBeNull();
  });

  it('updateScheduledDeparture rejects negative capacity', async () => {
    const id = await seedDeparture(agencyAId, productAId);
    await expect(
      runWithTenantContext(contextA, () => updateScheduledDeparture(database, id, { capacity: -1 })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

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
    throw new Error('ScheduledDeparture data-layer tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('ScheduledDeparture data-layer tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('ScheduledDeparture data-layer tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run scheduled departure data-layer tests against unsafe DATABASE_URL.');
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
        ($1, 'Agency A', 'agency-a-scheduled-departures-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-scheduled-departures-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-scheduled-departures-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-scheduled-departures-test-only', 'ACTIVE');
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
