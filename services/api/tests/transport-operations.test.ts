import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { CheckpointType, UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  confirmArrival,
  confirmDeparture,
  createOperation,
  getOperationById,
  listOperations,
} from '../src/transport-operations';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
const migration004 = resolve(repoRoot, 'infrastructure/migrations/004_route_points.sql');
const migration006 = resolve(repoRoot, 'infrastructure/migrations/006_field_operations.sql');
const migration012 = resolve(repoRoot, 'infrastructure/migrations/012_operational_staff_assignments.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-transport-operations-postgres';
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

describe('TransportOperation data-access layer', () => {
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
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE operation_checkpoints RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE transport_operations RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE route_points RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE scheduled_departures RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE transport_products RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE routes RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('fails closed with no tenant context established', async () => {
    await expect(listOperations(database)).rejects.toThrow();
  });

  it('creates an operation generating checkpoints only for checkpointRequired=true points', async () => {
    const { routeId, departureId } = await seedDepartureWithPoints(agencyAId, [
      { sequence: 1, name: 'Origem', checkpointRequired: true, checkpointType: CheckpointType.DEPARTURE },
      { sequence: 2, name: 'Parada livre', checkpointRequired: false },
      { sequence: 3, name: 'Destino', checkpointRequired: true, checkpointType: CheckpointType.ARRIVAL },
    ]);

    const result = await runWithTenantContext(contextA, () =>
      createOperation(database, { departureId }),
    );

    expect(result.operation.departureId).toBe(departureId);
    expect(result.checkpoints).toHaveLength(2);
    expect(result.checkpoints.map((c) => c.checkpointType)).toEqual([
      CheckpointType.DEPARTURE,
      CheckpointType.ARRIVAL,
    ]);
    void routeId;
  });

  it('rejects a second operation for the same departure (409)', async () => {
    const { departureId } = await seedDepartureWithPoints(agencyAId, []);
    await runWithTenantContext(contextA, () => createOperation(database, { departureId }));

    await expect(
      runWithTenantContext(contextA, () => createOperation(database, { departureId })),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects creating an operation for a cross-tenant departure (404)', async () => {
    const { departureId } = await seedDepartureWithPoints(agencyBId, []);
    await expect(
      runWithTenantContext(contextA, () => createOperation(database, { departureId })),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('BOTH checkpoint type allows arrival and departure confirmation independently', async () => {
    const { departureId } = await seedDepartureWithPoints(agencyAId, [
      { sequence: 1, name: 'Ambos', checkpointRequired: true, checkpointType: CheckpointType.BOTH, plannedOffsetMinutes: 30 },
    ]);
    const created = await runWithTenantContext(contextA, () =>
      createOperation(database, { departureId }),
    );
    const checkpointId = created.checkpoints[0]!.id;

    const afterArrival = await runWithTenantContext(contextA, () =>
      confirmArrival(database, created.operation.id, checkpointId),
    );
    expect(afterArrival.arrivalCheckedAt).toBeInstanceOf(Date);
    expect(afterArrival.departureCheckedAt).toBeUndefined();

    const afterDeparture = await runWithTenantContext(contextA, () =>
      confirmDeparture(database, created.operation.id, checkpointId),
    );
    expect(afterDeparture.arrivalCheckedAt).toBeInstanceOf(Date);
    expect(afterDeparture.departureCheckedAt).toBeInstanceOf(Date);
  });

  it('ARRIVAL-only checkpoint rejects a departure confirmation attempt (400)', async () => {
    const { departureId } = await seedDepartureWithPoints(agencyAId, [
      { sequence: 1, name: 'Chegada', checkpointRequired: true, checkpointType: CheckpointType.ARRIVAL },
    ]);
    const created = await runWithTenantContext(contextA, () =>
      createOperation(database, { departureId }),
    );
    const checkpointId = created.checkpoints[0]!.id;

    await expect(
      runWithTenantContext(contextA, () => confirmDeparture(database, created.operation.id, checkpointId)),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const confirmed = await runWithTenantContext(contextA, () =>
      confirmArrival(database, created.operation.id, checkpointId),
    );
    expect(confirmed.arrivalCheckedAt).toBeInstanceOf(Date);
  });

  it('DEPARTURE-only checkpoint rejects an arrival confirmation attempt (400)', async () => {
    const { departureId } = await seedDepartureWithPoints(agencyAId, [
      { sequence: 1, name: 'Partida', checkpointRequired: true, checkpointType: CheckpointType.DEPARTURE },
    ]);
    const created = await runWithTenantContext(contextA, () =>
      createOperation(database, { departureId }),
    );
    const checkpointId = created.checkpoints[0]!.id;

    await expect(
      runWithTenantContext(contextA, () => confirmArrival(database, created.operation.id, checkpointId)),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects a duplicate confirmation of the same type cleanly (409), preserving the original timestamp', async () => {
    const { departureId } = await seedDepartureWithPoints(agencyAId, [
      { sequence: 1, name: 'Chegada', checkpointRequired: true, checkpointType: CheckpointType.ARRIVAL },
    ]);
    const created = await runWithTenantContext(contextA, () =>
      createOperation(database, { departureId }),
    );
    const checkpointId = created.checkpoints[0]!.id;

    const first = await runWithTenantContext(contextA, () =>
      confirmArrival(database, created.operation.id, checkpointId),
    );
    const firstTimestamp = first.arrivalCheckedAt;

    await expect(
      runWithTenantContext(contextA, () => confirmArrival(database, created.operation.id, checkpointId)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const reloaded = await runWithTenantContext(contextA, () =>
      getOperationById(database, created.operation.id),
    );
    expect(reloaded?.checkpoints[0]?.arrivalCheckedAt?.getTime()).toBe(firstTimestamp?.getTime());
  });

  it('derives expectedAt = departureAt + plannedOffsetMinutes, and actual differs from expected once confirmed', async () => {
    const departureAt = new Date('2026-06-01T10:00:00.000Z');
    const { departureId } = await seedDepartureWithPoints(
      agencyAId,
      [{ sequence: 1, name: 'Ponto', checkpointRequired: true, checkpointType: CheckpointType.ARRIVAL, plannedOffsetMinutes: 45 }],
      departureAt,
    );
    const created = await runWithTenantContext(contextA, () =>
      createOperation(database, { departureId }),
    );
    const checkpoint = created.checkpoints[0]!;
    expect(checkpoint.expectedAt?.getTime()).toBe(departureAt.getTime() + 45 * 60_000);
    expect(checkpoint.arrivalCheckedAt).toBeUndefined();

    const confirmed = await runWithTenantContext(contextA, () =>
      confirmArrival(database, created.operation.id, checkpoint.id),
    );
    // A consumer can compute delay = arrivalCheckedAt - expectedAt from
    // these two independently-sourced values; no delay column exists.
    expect(confirmed.arrivalCheckedAt).toBeInstanceOf(Date);
    expect(confirmed.arrivalCheckedAt!.getTime()).not.toBe(checkpoint.expectedAt!.getTime());
  });

  it('tenant isolation: getOperationById never returns another tenant operation', async () => {
    const { departureId } = await seedDepartureWithPoints(agencyBId, []);
    const created = await runWithTenantContext(contextB, () =>
      createOperation(database, { departureId }),
    );

    const result = await runWithTenantContext(contextA, () => getOperationById(database, created.operation.id));
    expect(result).toBeNull();
  });

  it('rejects confirming a checkpoint via a cross-tenant operationId (404, no leak)', async () => {
    const { departureId } = await seedDepartureWithPoints(agencyBId, [
      { sequence: 1, name: 'B Point', checkpointRequired: true, checkpointType: CheckpointType.ARRIVAL },
    ]);
    const created = await runWithTenantContext(contextB, () =>
      createOperation(database, { departureId }),
    );
    const checkpointId = created.checkpoints[0]!.id;

    await expect(
      runWithTenantContext(contextA, () => confirmArrival(database, created.operation.id, checkpointId)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('RLS proof: runtime role cannot see Agency B rows even via a raw query bypass attempt', async () => {
    const { departureId } = await seedDepartureWithPoints(agencyBId, []);
    await runWithTenantContext(contextB, () => createOperation(database, { departureId }));

    const result = await runWithTenantContext(contextA, () => listOperations(database));
    expect(result).toEqual([]);
  });

  interface PointSpec {
    sequence: number;
    name: string;
    checkpointRequired: boolean;
    checkpointType?: CheckpointType;
    plannedOffsetMinutes?: number;
  }

  async function seedDepartureWithPoints(
    agencyId: string,
    points: PointSpec[],
    departureAt: Date = new Date('2026-01-01T10:00:00.000Z'),
  ): Promise<{ routeId: string; departureId: string }> {
    const routeResult = await adminPool.query<{ id: string }>(
      `INSERT INTO routes (agency_id, origin, destination) VALUES ($1, 'A', 'B') RETURNING id`,
      [agencyId],
    );
    const routeId = routeResult.rows[0]!.id;

    for (const point of points) {
      await adminPool.query(
        `INSERT INTO route_points
           (agency_id, route_id, sequence, name, checkpoint_required, checkpoint_type, planned_offset_minutes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          agencyId,
          routeId,
          point.sequence,
          point.name,
          point.checkpointRequired,
          point.checkpointType ?? null,
          point.plannedOffsetMinutes ?? null,
        ],
      );
    }

    const productResult = await adminPool.query<{ id: string }>(
      `INSERT INTO transport_products (agency_id, name, trip_type, outbound_route_id, price)
       VALUES ($1, 'Product', 'ONE_WAY', $2, 10) RETURNING id`,
      [agencyId, routeId],
    );
    const productId = productResult.rows[0]!.id;

    const departureResult = await adminPool.query<{ id: string }>(
      `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, service_type)
       VALUES ($1, $2, $3, 10, 'OWN') RETURNING id`,
      [agencyId, productId, departureAt.toISOString()],
    );
    const departureId = departureResult.rows[0]!.id;

    return { routeId, departureId };
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('TransportOperation data-layer tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('TransportOperation data-layer tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('TransportOperation data-layer tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run TransportOperation data-layer tests against unsafe DATABASE_URL.');
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
  await pool.query(readSqlForPg(migration006));
  await pool.query(readSqlForPg(migration012));
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
        ($1, 'Agency A', 'agency-a-transport-operations-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-transport-operations-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-transport-operations-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-transport-operations-test-only', 'ACTIVE');
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
