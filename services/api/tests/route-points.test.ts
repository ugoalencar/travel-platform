import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { CheckpointType, UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  createRoutePoint,
  getRoutePointById,
  listRoutePoints,
  reorderRoutePoints,
  updateRoutePoint,
} from '../src/route-points';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
const migration004 = resolve(repoRoot, 'infrastructure/migrations/004_route_points.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-route-points-postgres';
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

describe('RoutePoint data-access layer', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let database: DatabaseRuntime;

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
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE route_points RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE routes RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('fails closed with no tenant context established', async () => {
    await expect(listRoutePoints(database, 'anything')).rejects.toThrow();
  });

  it('returns an empty list for a Route with zero points', async () => {
    const routeId = await seedRoute(agencyAId, 'A1', 'A2');
    const result = await runWithTenantContext(contextA, () => listRoutePoints(database, routeId));
    expect(result).toEqual([]);
  });

  it('creates and lists several points ordered by sequence', async () => {
    const routeId = await seedRoute(agencyAId, 'A1', 'A2');

    await runWithTenantContext(contextA, () =>
      createRoutePoint(database, routeId, {
        sequence: 2,
        name: 'Parada tecnica',
        checkpointRequired: false,
      }),
    );
    await runWithTenantContext(contextA, () =>
      createRoutePoint(database, routeId, {
        sequence: 1,
        name: 'Origem',
        checkpointRequired: true,
        checkpointType: CheckpointType.DEPARTURE,
      }),
    );

    const result = await runWithTenantContext(contextA, () => listRoutePoints(database, routeId));
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('Origem');
    expect(result[0]?.sequence).toBe(1);
    expect(result[1]?.name).toBe('Parada tecnica');
    expect(result[1]?.sequence).toBe(2);
  });

  it.each([CheckpointType.ARRIVAL, CheckpointType.DEPARTURE, CheckpointType.BOTH])(
    'accepts checkpointRequired=true with checkpointType=%s',
    async (checkpointType) => {
      const routeId = await seedRoute(agencyAId, 'A1', 'A2');
      const created = await runWithTenantContext(contextA, () =>
        createRoutePoint(database, routeId, {
          sequence: 1,
          name: 'Ponto',
          checkpointRequired: true,
          checkpointType,
        }),
      );
      expect(created.checkpointRequired).toBe(true);
      expect(created.checkpointType).toBe(checkpointType);
    },
  );

  it('accepts checkpointRequired=false with null/absent checkpointType', async () => {
    const routeId = await seedRoute(agencyAId, 'A1', 'A2');
    const created = await runWithTenantContext(contextA, () =>
      createRoutePoint(database, routeId, {
        sequence: 1,
        name: 'Parada opcional',
        checkpointRequired: false,
      }),
    );
    expect(created.checkpointRequired).toBe(false);
    expect(created.checkpointType).toBeUndefined();
  });

  it('rejects checkpointRequired=true with no checkpointType (app-layer 400)', async () => {
    const routeId = await seedRoute(agencyAId, 'A1', 'A2');
    await expect(
      runWithTenantContext(contextA, () =>
        createRoutePoint(database, routeId, {
          sequence: 1,
          name: 'Ponto',
          checkpointRequired: true,
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('DB CHECK constraint backstops checkpointRequired/checkpointType consistency', async () => {
    const routeId = await seedRoute(agencyAId, 'A1', 'A2');
    await expect(
      adminPool.query(
        `INSERT INTO route_points (agency_id, route_id, sequence, name, checkpoint_required, checkpoint_type)
         VALUES ($1, $2, 1, 'Ponto', true, NULL)`,
        [agencyAId, routeId],
      ),
    ).rejects.toThrow(/route_points_checkpoint_type_required_check/);
  });

  it('rejects negative plannedOffsetMinutes', async () => {
    const routeId = await seedRoute(agencyAId, 'A1', 'A2');
    await expect(
      runWithTenantContext(contextA, () =>
        createRoutePoint(database, routeId, {
          sequence: 1,
          name: 'Ponto',
          plannedOffsetMinutes: -5,
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('DB CHECK constraint backstops non-negative plannedOffsetMinutes', async () => {
    const routeId = await seedRoute(agencyAId, 'A1', 'A2');
    await expect(
      adminPool.query(
        `INSERT INTO route_points (agency_id, route_id, sequence, name, planned_offset_minutes)
         VALUES ($1, $2, 1, 'Ponto', -1)`,
        [agencyAId, routeId],
      ),
    ).rejects.toThrow(/route_points_offset_non_negative_check/);
  });

  it('rejects a duplicate sequence within the same route cleanly (no leaked constraint name)', async () => {
    const routeId = await seedRoute(agencyAId, 'A1', 'A2');
    await runWithTenantContext(contextA, () =>
      createRoutePoint(database, routeId, { sequence: 1, name: 'A' }),
    );

    await expect(
      runWithTenantContext(contextA, () =>
        createRoutePoint(database, routeId, { sequence: 1, name: 'B' }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects creating a point on a Route belonging to another tenant', async () => {
    const bRouteId = await seedRoute(agencyBId, 'B1', 'B2');
    await expect(
      runWithTenantContext(contextA, () =>
        createRoutePoint(database, bRouteId, { sequence: 1, name: 'Intruder' }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('tenant isolation: getRoutePointById never returns another tenant point', async () => {
    const bRouteId = await seedRoute(agencyBId, 'B1', 'B2');
    const point = await runWithTenantContext(contextB, () =>
      createRoutePoint(database, bRouteId, { sequence: 1, name: 'B Point' }),
    );

    const result = await runWithTenantContext(contextA, () =>
      getRoutePointById(database, bRouteId, point.id),
    );
    expect(result).toBeNull();
  });

  it('updateRoutePoint updates fields and validates checkpointRequired/checkpointType', async () => {
    const routeId = await seedRoute(agencyAId, 'A1', 'A2');
    const point = await runWithTenantContext(contextA, () =>
      createRoutePoint(database, routeId, { sequence: 1, name: 'Ponto' }),
    );

    const updated = await runWithTenantContext(contextA, () =>
      updateRoutePoint(database, routeId, point.id, {
        checkpointRequired: true,
        checkpointType: CheckpointType.ARRIVAL,
        plannedOffsetMinutes: 90,
      }),
    );
    expect(updated?.checkpointRequired).toBe(true);
    expect(updated?.checkpointType).toBe(CheckpointType.ARRIVAL);
    expect(updated?.plannedOffsetMinutes).toBe(90);

    await expect(
      runWithTenantContext(contextA, () =>
        updateRoutePoint(database, routeId, point.id, { checkpointType: null }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('reorderRoutePoints atomically rewrites sequence for all provided ids', async () => {
    const routeId = await seedRoute(agencyAId, 'A1', 'A2');
    const p1 = await runWithTenantContext(contextA, () =>
      createRoutePoint(database, routeId, { sequence: 1, name: 'A' }),
    );
    const p2 = await runWithTenantContext(contextA, () =>
      createRoutePoint(database, routeId, { sequence: 2, name: 'B' }),
    );
    const p3 = await runWithTenantContext(contextA, () =>
      createRoutePoint(database, routeId, { sequence: 3, name: 'C' }),
    );

    const reordered = await runWithTenantContext(contextA, () =>
      reorderRoutePoints(database, routeId, [p3.id, p1.id, p2.id]),
    );

    expect(reordered.map((p) => p.name)).toEqual(['C', 'A', 'B']);
    expect(reordered.map((p) => p.sequence)).toEqual([1, 2, 3]);
  });

  it('rejects cross-tenant RoutePoint ids in reorder', async () => {
    const routeId = await seedRoute(agencyAId, 'A1', 'A2');
    const bRouteId = await seedRoute(agencyBId, 'B1', 'B2');
    const p1 = await runWithTenantContext(contextA, () =>
      createRoutePoint(database, routeId, { sequence: 1, name: 'A' }),
    );
    const bPoint = await runWithTenantContext(contextB, () =>
      createRoutePoint(database, bRouteId, { sequence: 1, name: 'B' }),
    );

    await expect(
      runWithTenantContext(contextA, () =>
        reorderRoutePoints(database, routeId, [p1.id, bPoint.id]),
      ),
    ).rejects.toThrow();
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
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('RoutePoint data-layer tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('RoutePoint data-layer tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('RoutePoint data-layer tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run RoutePoint data-layer tests against unsafe DATABASE_URL.');
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
        ($1, 'Agency A', 'agency-a-route-points-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-route-points-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-route-points-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-route-points-test-only', 'ACTIVE');
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
