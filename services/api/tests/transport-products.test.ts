import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { TripType, UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  createTransportProduct,
  getTransportProductById,
  listTransportProducts,
  updateTransportProduct,
} from '../src/transport-products';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-transport-products-postgres';
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

describe.sequential('TransportProduct data-access layer', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let database: DatabaseRuntime;
  let routeA1: string;
  let routeA2: string;
  let routeB1: string;

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
    await adminPool.query('TRUNCATE TABLE transport_products RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE routes RESTART IDENTITY CASCADE');
    routeA1 = await seedRoute(agencyAId, 'A1', 'A2');
    routeA2 = await seedRoute(agencyAId, 'A3', 'A4');
    routeB1 = await seedRoute(agencyBId, 'B1', 'B2');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('fails closed with no tenant context established', async () => {
    await expect(listTransportProducts(database)).rejects.toThrow();
    await expect(getTransportProductById(database, 'anything')).rejects.toThrow();
    await expect(
      createTransportProduct(database, {
        name: 'x',
        tripType: TripType.ONE_WAY,
        outboundRouteId: routeA1,
        price: 10,
      }),
    ).rejects.toThrow();
    await expect(updateTransportProduct(database, 'anything', { price: 1 })).rejects.toThrow();
  });

  it('listTransportProducts returns only Agency A products', async () => {
    await seedProduct(agencyAId, routeA1);
    await seedProduct(agencyBId, routeB1);

    const result = await runWithTenantContext(contextA, () => listTransportProducts(database));
    expect(result).toHaveLength(1);
    expect(result[0]?.agencyId).toBe(agencyAId);
  });

  it('getTransportProductById never returns another tenant product', async () => {
    const bId = await seedProduct(agencyBId, routeB1);
    const result = await runWithTenantContext(contextA, () => getTransportProductById(database, bId));
    expect(result).toBeNull();
  });

  it('creating a ONE_WAY product without returnRouteId succeeds', async () => {
    const created = await runWithTenantContext(contextA, () =>
      createTransportProduct(database, {
        name: 'One way',
        tripType: TripType.ONE_WAY,
        outboundRouteId: routeA1,
        price: 100,
      }),
    );
    expect(created.tripType).toBe(TripType.ONE_WAY);
    expect(created.returnRouteId).toBeUndefined();
  });

  it('creating a ROUND_TRIP product without returnRouteId is rejected at app layer', async () => {
    await expect(
      runWithTenantContext(contextA, () =>
        createTransportProduct(database, {
          name: 'Round trip',
          tripType: TripType.ROUND_TRIP,
          outboundRouteId: routeA1,
          price: 100,
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('creating a ROUND_TRIP product with returnRouteId succeeds', async () => {
    const created = await runWithTenantContext(contextA, () =>
      createTransportProduct(database, {
        name: 'Round trip',
        tripType: TripType.ROUND_TRIP,
        outboundRouteId: routeA1,
        returnRouteId: routeA2,
        price: 100,
      }),
    );
    expect(created.returnRouteId).toBe(routeA2);
  });

  it('DB CHECK constraint backstops the return-route requirement when the app layer is bypassed', async () => {
    await expect(
      adminPool.query(
        `INSERT INTO transport_products (agency_id, name, trip_type, outbound_route_id, return_route_id, price)
         VALUES ($1, 'Bad round trip', 'ROUND_TRIP', $2, NULL, 100)`,
        [agencyAId, routeA1],
      ),
    ).rejects.toThrow(/transport_products_return_route_required_check/);

    await expect(
      adminPool.query(
        `INSERT INTO transport_products (agency_id, name, trip_type, outbound_route_id, return_route_id, price)
         VALUES ($1, 'Bad one way', 'ONE_WAY', $2, $3, 100)`,
        [agencyAId, routeA1, routeA2],
      ),
    ).rejects.toThrow(/transport_products_return_route_required_check/);
  });

  it('rejects a cross-tenant outbound Route reference', async () => {
    await expect(
      runWithTenantContext(contextA, () =>
        createTransportProduct(database, {
          name: 'Bad',
          tripType: TripType.ONE_WAY,
          outboundRouteId: routeB1,
          price: 100,
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a cross-tenant return Route reference', async () => {
    await expect(
      runWithTenantContext(contextA, () =>
        createTransportProduct(database, {
          name: 'Bad',
          tripType: TripType.ROUND_TRIP,
          outboundRouteId: routeA1,
          returnRouteId: routeB1,
          price: 100,
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects negative price', async () => {
    await expect(
      runWithTenantContext(contextA, () =>
        createTransportProduct(database, {
          name: 'Bad',
          tripType: TripType.ONE_WAY,
          outboundRouteId: routeA1,
          price: -1,
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('active/publiclyBookable are independently settable and default correctly', async () => {
    const created = await runWithTenantContext(contextA, () =>
      createTransportProduct(database, {
        name: 'Def',
        tripType: TripType.ONE_WAY,
        outboundRouteId: routeA1,
        price: 100,
      }),
    );
    expect(created.active).toBe(true);
    expect(created.publiclyBookable).toBe(false);

    const created2 = await runWithTenantContext(contextA, () =>
      createTransportProduct(database, {
        name: 'Def2',
        tripType: TripType.ONE_WAY,
        outboundRouteId: routeA1,
        price: 100,
        active: false,
        publiclyBookable: true,
      }),
    );
    expect(created2.active).toBe(false);
    expect(created2.publiclyBookable).toBe(true);
  });

  it('updateTransportProduct on another tenant product is a no-op', async () => {
    const bId = await seedProduct(agencyBId, routeB1);
    const result = await runWithTenantContext(contextA, () =>
      updateTransportProduct(database, bId, { name: 'Hacked' }),
    );
    expect(result).toBeNull();
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
    throw new Error('TransportProduct data-layer tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('TransportProduct data-layer tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('TransportProduct data-layer tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run transport product data-layer tests against unsafe DATABASE_URL.');
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
        ($1, 'Agency A', 'agency-a-transport-products-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-transport-products-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-transport-products-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-transport-products-test-only', 'ACTIVE');
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
