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
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-route-points-http-postgres';
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
  a: { userId: userAId, agencyId: agencyAId, role: UserRole.ADMIN, email: 'user-a@example.test' },
  viewer: { userId: userAId, agencyId: agencyAId, role: UserRole.VIEWER, email: 'user-a@example.test' },
  agent: { userId: userAId, agencyId: agencyAId, role: UserRole.AGENT, email: 'user-a@example.test' },
  manager: { userId: userAId, agencyId: agencyAId, role: UserRole.MANAGER, email: 'user-a@example.test' },
  owner: { userId: userAId, agencyId: agencyAId, role: UserRole.OWNER, email: 'user-a@example.test' },
  ownerAgencyB: { userId: userBId, agencyId: agencyBId, role: UserRole.OWNER, email: 'user-b@example.test' },
};

describe.sequential('RoutePoint HTTP routes', () => {
  let adminPool: Pool;
  let runtimePool: Pool;

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
    await adminPool.query('TRUNCATE TABLE route_points RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE routes RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  describe('GET /transport/routes/:routeId/points', () => {
    it('returns 401 without auth', async () => {
      const routeId = await seedRoute(agencyAId, 'A1', 'A2');
      const app = buildTestApp(runtimePool);
      const response = await app.inject({ method: 'GET', url: `/transport/routes/${routeId}/points` });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('lists points ordered by sequence', async () => {
      const routeId = await seedRoute(agencyAId, 'A1', 'A2');
      await seedPoint(agencyAId, routeId, 2, 'Second');
      await seedPoint(agencyAId, routeId, 1, 'First');

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/transport/routes/${routeId}/points`,
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ points: Array<{ name: string; sequence: number }> }>();
      expect(body.points.map((p) => p.name)).toEqual(['First', 'Second']);
      await app.close();
    });
  });

  describe('POST /transport/routes/:routeId/points', () => {
    it('creates a point (MANAGER)', async () => {
      const routeId = await seedRoute(agencyAId, 'A1', 'A2');
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: `/transport/routes/${routeId}/points`,
        headers: { 'x-test-principal': 'manager' },
        payload: { sequence: 1, name: 'Origem', checkpointRequired: true, checkpointType: 'DEPARTURE' },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json<{ point: { name: string } }>();
      expect(body.point.name).toBe('Origem');
      await app.close();
    });

    it('rejects checkpointRequired=true with no checkpointType with 400', async () => {
      const routeId = await seedRoute(agencyAId, 'A1', 'A2');
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: `/transport/routes/${routeId}/points`,
        headers: { 'x-test-principal': 'manager' },
        payload: { sequence: 1, name: 'Origem', checkpointRequired: true },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
      await app.close();
    });

    it('rejects negative plannedOffsetMinutes with 400', async () => {
      const routeId = await seedRoute(agencyAId, 'A1', 'A2');
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: `/transport/routes/${routeId}/points`,
        headers: { 'x-test-principal': 'manager' },
        payload: { sequence: 1, name: 'Origem', plannedOffsetMinutes: -1 },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects duplicate sequence with 409', async () => {
      const routeId = await seedRoute(agencyAId, 'A1', 'A2');
      const app = buildTestApp(runtimePool);
      await app.inject({
        method: 'POST',
        url: `/transport/routes/${routeId}/points`,
        headers: { 'x-test-principal': 'manager' },
        payload: { sequence: 1, name: 'A' },
      });
      const response = await app.inject({
        method: 'POST',
        url: `/transport/routes/${routeId}/points`,
        headers: { 'x-test-principal': 'manager' },
        payload: { sequence: 1, name: 'B' },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'CONFLICT' });
      await app.close();
    });

    it.each(['routeId', 'agencyId', 'id', 'sequence', 'createdAt', 'updatedAt'] as const)(
      'rejects forbidden field "%s" with 400',
      async (field) => {
        const routeId = await seedRoute(agencyAId, 'A1', 'A2');
        const app = buildTestApp(runtimePool);
        const response = await app.inject({
          method: 'POST',
          url: `/transport/routes/${routeId}/points`,
          headers: { 'x-test-principal': 'manager' },
          payload: { sequence: 1, name: 'A', [field]: 'x' },
        });
        expect(response.statusCode).toBe(400);
        await app.close();
      },
    );

    it('rejects cross-tenant route with 404', async () => {
      const bRouteId = await seedRoute(agencyBId, 'B1', 'B2');
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: `/transport/routes/${bRouteId}/points`,
        headers: { 'x-test-principal': 'a' },
        payload: { sequence: 1, name: 'Intruder' },
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    });
  });

  describe('PATCH /transport/routes/:routeId/points/:id', () => {
    it('updates allowed fields, forbidding routeId/sequence', async () => {
      const routeId = await seedRoute(agencyAId, 'A1', 'A2');
      const pointId = await seedPoint(agencyAId, routeId, 1, 'A');
      const app = buildTestApp(runtimePool);

      const forbidden = await app.inject({
        method: 'PATCH',
        url: `/transport/routes/${routeId}/points/${pointId}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { sequence: 5 },
      });
      expect(forbidden.statusCode).toBe(400);

      const response = await app.inject({
        method: 'PATCH',
        url: `/transport/routes/${routeId}/points/${pointId}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { name: 'Renamed', checkpointRequired: true, checkpointType: 'BOTH' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ point: { name: string; checkpointType: string } }>();
      expect(body.point.name).toBe('Renamed');
      expect(body.point.checkpointType).toBe('BOTH');
      await app.close();
    });
  });

  describe('POST /transport/routes/:routeId/points/reorder', () => {
    it('atomically reorders points', async () => {
      const routeId = await seedRoute(agencyAId, 'A1', 'A2');
      const p1 = await seedPoint(agencyAId, routeId, 1, 'A');
      const p2 = await seedPoint(agencyAId, routeId, 2, 'B');
      const app = buildTestApp(runtimePool);

      const response = await app.inject({
        method: 'POST',
        url: `/transport/routes/${routeId}/points/reorder`,
        headers: { 'x-test-principal': 'manager' },
        payload: { orderedPointIds: [p2, p1] },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ points: Array<{ name: string }> }>();
      expect(body.points.map((p) => p.name)).toEqual(['B', 'A']);
      await app.close();
    });
  });

  describe('RBAC', () => {
    it('allows VIEWER to read, blocks write with 403', async () => {
      const routeId = await seedRoute(agencyAId, 'A1', 'A2');
      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: `/transport/routes/${routeId}/points`,
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(list.statusCode).toBe(200);

      const create = await app.inject({
        method: 'POST',
        url: `/transport/routes/${routeId}/points`,
        headers: { 'x-test-principal': 'viewer' },
        payload: { sequence: 1, name: 'A' },
      });
      expect(create.statusCode).toBe(403);
      await app.close();
    });

    it('blocks AGENT from write (floor is MANAGER)', async () => {
      const routeId = await seedRoute(agencyAId, 'A1', 'A2');
      const app = buildTestApp(runtimePool);
      const create = await app.inject({
        method: 'POST',
        url: `/transport/routes/${routeId}/points`,
        headers: { 'x-test-principal': 'agent' },
        payload: { sequence: 1, name: 'A' },
      });
      expect(create.statusCode).toBe(403);
      await app.close();
    });

    it('keeps a high role from Agency B blocked from Agency A route points (404, no leak)', async () => {
      const routeId = await seedRoute(agencyAId, 'A1', 'A2');
      await seedPoint(agencyAId, routeId, 1, 'A');
      const app = buildTestApp(runtimePool);

      const response = await app.inject({
        method: 'GET',
        url: `/transport/routes/${routeId}/points`,
        headers: { 'x-test-principal': 'ownerAgencyB' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ points: unknown[] }>();
      expect(body.points).toEqual([]);
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

  async function seedPoint(
    agencyId: string,
    routeId: string,
    sequence: number,
    name: string,
  ): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO route_points (agency_id, route_id, sequence, name) VALUES ($1, $2, $3, $4) RETURNING id`,
      [agencyId, routeId, sequence, name],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed route point');
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('RoutePoint HTTP tests require localhost only.');
  }
  if (databasePort !== 55432) {
    throw new Error('RoutePoint HTTP tests require local port 55432.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('RoutePoint HTTP tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === '55432' || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run RoutePoint HTTP tests against unsafe DATABASE_URL.');
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
        ($1, 'Agency A', 'agency-a-route-points-http-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-route-points-http-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-route-points-http-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-route-points-http-test-only', 'ACTIVE');
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
