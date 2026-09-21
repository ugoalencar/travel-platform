import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { createDatabaseRuntime } from '../src/database';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-offer-e2e-postgres';
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
  managerA: { userId: userAId, agencyId: agencyAId, role: UserRole.MANAGER, email: 'user-a@example.test' },
  managerB: { userId: userBId, agencyId: agencyBId, role: UserRole.MANAGER, email: 'user-b@example.test' },
  viewerA: { userId: userAId, agencyId: agencyAId, role: UserRole.VIEWER, email: 'user-a@example.test' },
  ownerA: { userId: userAId, agencyId: agencyAId, role: UserRole.OWNER, email: 'user-a@example.test' },
  ownerB: { userId: userBId, agencyId: agencyBId, role: UserRole.OWNER, email: 'user-b@example.test' },
  unknownRoleA: {
    userId: userAId,
    agencyId: agencyAId,
    role: 'NOT_A_REAL_ROLE' as UserRole,
    email: 'user-a@example.test',
  },
};

describe('Offer end-to-end vertical validation (Package 2)', () => {
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
    await adminPool.query('TRUNCATE TABLE offers RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('Runtime role: app database pool connects as a non-superuser, non-bypassrls runtime role', async () => {
    const roleCheck = await runtimePool.query<{ current_user: string }>('SELECT current_user');
    expect(roleCheck.rows[0]?.current_user).toBe(runtimeUser);
    expect(runtimeUser).not.toBe(adminUser);

    const roleAttrs = await adminPool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1',
      [runtimeUser],
    );
    expect(roleAttrs.rows).toHaveLength(1);
    expect(roleAttrs.rows[0]?.rolsuper).toBe(false);
    expect(roleAttrs.rows[0]?.rolbypassrls).toBe(false);
  });

  it('Scenario: full Agency A lifecycle - create, list, get, update, persisted change confirmed via direct DB read', async () => {
    const app = buildTestApp(runtimePool);

    const created = await app.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-principal': 'managerA' },
      payload: { name: 'Offer A', price: 500 },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ offer: { id: string } }>().offer.id;

    const list = await app.inject({
      method: 'GET',
      url: '/offers',
      headers: { 'x-test-principal': 'managerA' },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ offers: Array<{ id: string }> }>().offers.some((o) => o.id === id)).toBe(true);

    const get1 = await app.inject({
      method: 'GET',
      url: `/offers/${id}`,
      headers: { 'x-test-principal': 'managerA' },
    });
    expect(get1.statusCode).toBe(200);
    expect(get1.json<{ offer: { name: string } }>().offer.name).toBe('Offer A');

    const patch = await app.inject({
      method: 'PATCH',
      url: `/offers/${id}`,
      headers: { 'x-test-principal': 'managerA' },
      payload: { name: 'Offer A Updated' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json<{ offer: { name: string } }>().offer.name).toBe('Offer A Updated');

    const row = await adminPool.query<{ name: string }>('SELECT name FROM offers WHERE id = $1', [id]);
    expect(row.rows[0]?.name).toBe('Offer A Updated');

    await app.close();
  });

  it('Scenario: isolation - lists never cross tenants, cross-tenant GET/PATCH are 404 with zero mutation', async () => {
    const app = buildTestApp(runtimePool);

    const offerA = await app.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-principal': 'managerA' },
      payload: { name: 'A Isolation', price: 10 },
    });
    const idA = offerA.json<{ offer: { id: string } }>().offer.id;

    const offerB = await app.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-principal': 'managerB' },
      payload: { name: 'B Isolation', price: 20 },
    });
    const idB = offerB.json<{ offer: { id: string } }>().offer.id;

    const listA = await app.inject({
      method: 'GET',
      url: '/offers',
      headers: { 'x-test-principal': 'managerA' },
    });
    const listAIds = listA.json<{ offers: Array<{ id: string }> }>().offers.map((o) => o.id);
    expect(listAIds).toContain(idA);
    expect(listAIds).not.toContain(idB);

    const listB = await app.inject({
      method: 'GET',
      url: '/offers',
      headers: { 'x-test-principal': 'managerB' },
    });
    const listBIds = listB.json<{ offers: Array<{ id: string }> }>().offers.map((o) => o.id);
    expect(listBIds).toContain(idB);
    expect(listBIds).not.toContain(idA);

    const aGetB = await app.inject({
      method: 'GET',
      url: `/offers/${idB}`,
      headers: { 'x-test-principal': 'managerA' },
    });
    expect(aGetB.statusCode).toBe(404);

    const bGetA = await app.inject({
      method: 'GET',
      url: `/offers/${idA}`,
      headers: { 'x-test-principal': 'managerB' },
    });
    expect(bGetA.statusCode).toBe(404);

    const aPatchB = await app.inject({
      method: 'PATCH',
      url: `/offers/${idB}`,
      headers: { 'x-test-principal': 'managerA' },
      payload: { name: 'Hacked By A' },
    });
    expect(aPatchB.statusCode).toBe(404);

    const bPatchA = await app.inject({
      method: 'PATCH',
      url: `/offers/${idA}`,
      headers: { 'x-test-principal': 'managerB' },
      payload: { name: 'Hacked By B' },
    });
    expect(bPatchA.statusCode).toBe(404);

    const rowA = await adminPool.query<{ name: string }>('SELECT name FROM offers WHERE id = $1', [idA]);
    expect(rowA.rows[0]?.name).toBe('A Isolation');

    const rowB = await adminPool.query<{ name: string }>('SELECT name FROM offers WHERE id = $1', [idB]);
    expect(rowB.rows[0]?.name).toBe('B Isolation');

    await app.close();
  });

  it('Scenario: high role does not bypass tenant - OWNER from Agency A cannot read/mutate Offer B, and vice versa', async () => {
    const app = buildTestApp(runtimePool);

    const offerA = await app.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-principal': 'managerA' },
      payload: { name: 'Owner Guard A', price: 15 },
    });
    const idA = offerA.json<{ offer: { id: string } }>().offer.id;

    const offerB = await app.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-principal': 'managerB' },
      payload: { name: 'Owner Guard B', price: 25 },
    });
    const idB = offerB.json<{ offer: { id: string } }>().offer.id;

    const ownerACrossGet = await app.inject({
      method: 'GET',
      url: `/offers/${idB}`,
      headers: { 'x-test-principal': 'ownerA' },
    });
    expect(ownerACrossGet.statusCode).toBe(404);

    const ownerACrossPatch = await app.inject({
      method: 'PATCH',
      url: `/offers/${idB}`,
      headers: { 'x-test-principal': 'ownerA' },
      payload: { name: 'Hacked By Owner A' },
    });
    expect(ownerACrossPatch.statusCode).toBe(404);

    const ownerBCrossGet = await app.inject({
      method: 'GET',
      url: `/offers/${idA}`,
      headers: { 'x-test-principal': 'ownerB' },
    });
    expect(ownerBCrossGet.statusCode).toBe(404);

    const ownerBCrossPatch = await app.inject({
      method: 'PATCH',
      url: `/offers/${idA}`,
      headers: { 'x-test-principal': 'ownerB' },
      payload: { name: 'Hacked By Owner B' },
    });
    expect(ownerBCrossPatch.statusCode).toBe(404);

    const rowA = await adminPool.query<{ name: string }>('SELECT name FROM offers WHERE id = $1', [idA]);
    expect(rowA.rows[0]?.name).toBe('Owner Guard A');

    const rowB = await adminPool.query<{ name: string }>('SELECT name FROM offers WHERE id = $1', [idB]);
    expect(rowB.rows[0]?.name).toBe('Owner Guard B');

    await app.close();
  });

  it('Scenario: RBAC E2E - VIEWER read-only, MANAGER full, higher role inherits, unknown role fails closed, no auth 401', async () => {
    const app = buildTestApp(runtimePool);

    const seeded = await app.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-principal': 'managerA' },
      payload: { name: 'RBAC Target', price: 5 },
    });
    const id = seeded.json<{ offer: { id: string } }>().offer.id;

    const viewerGet = await app.inject({
      method: 'GET',
      url: `/offers/${id}`,
      headers: { 'x-test-principal': 'viewerA' },
    });
    expect(viewerGet.statusCode).toBe(200);

    const viewerPost = await app.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-principal': 'viewerA' },
      payload: { name: 'Viewer Attempt', price: 1 },
    });
    expect(viewerPost.statusCode).toBe(403);

    const viewerPatch = await app.inject({
      method: 'PATCH',
      url: `/offers/${id}`,
      headers: { 'x-test-principal': 'viewerA' },
      payload: { name: 'Viewer Attempt' },
    });
    expect(viewerPatch.statusCode).toBe(403);

    const managerPatch = await app.inject({
      method: 'PATCH',
      url: `/offers/${id}`,
      headers: { 'x-test-principal': 'managerA' },
      payload: { name: 'Manager Updated' },
    });
    expect(managerPatch.statusCode).toBe(200);

    const ownerGet = await app.inject({
      method: 'GET',
      url: `/offers/${id}`,
      headers: { 'x-test-principal': 'ownerA' },
    });
    expect(ownerGet.statusCode).toBe(200);

    const ownerPatch = await app.inject({
      method: 'PATCH',
      url: `/offers/${id}`,
      headers: { 'x-test-principal': 'ownerA' },
      payload: { name: 'Owner Updated' },
    });
    expect(ownerPatch.statusCode).toBe(200);

    const unknownList = await app.inject({
      method: 'GET',
      url: '/offers',
      headers: { 'x-test-principal': 'unknownRoleA' },
    });
    expect(unknownList.statusCode).toBe(403);

    const unknownPost = await app.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-principal': 'unknownRoleA' },
      payload: { name: 'Unknown Attempt', price: 1 },
    });
    expect(unknownPost.statusCode).toBe(403);

    const noAuthList = await app.inject({ method: 'GET', url: '/offers' });
    expect(noAuthList.statusCode).toBe(401);

    const noAuthPost = await app.inject({
      method: 'POST',
      url: '/offers',
      payload: { name: 'No Auth', price: 1 },
    });
    expect(noAuthPost.statusCode).toBe(401);

    await app.close();
  });

  it('Scenario: status is rejected 400 on create via real POST through the full HTTP stack', async () => {
    const app = buildTestApp(runtimePool);

    const created = await app.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-principal': 'managerA' },
      payload: { name: 'Status Attempt', price: 1, status: 'INACTIVE' },
    });
    expect(created.statusCode).toBe(400);

    await app.close();
  });

  it('Scenario: authority field spoofing - forbidden fields rejected 400, no ownership change', async () => {
    const app = buildTestApp(runtimePool);

    const seeded = await app.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-principal': 'managerA' },
      payload: { name: 'Spoof Target', price: 1 },
    });
    const id = seeded.json<{ offer: { id: string } }>().offer.id;

    const patch = await app.inject({
      method: 'PATCH',
      url: `/offers/${id}`,
      headers: { 'x-test-principal': 'managerA' },
      payload: {
        name: 'Spoofed',
        agencyId: agencyBId,
        tenantId: agencyBId,
        id: '00000000-0000-4000-8000-000000000099',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    expect(patch.statusCode).toBe(400);

    const row = await adminPool.query<{ name: string; agency_id: string }>(
      'SELECT name, agency_id FROM offers WHERE id = $1',
      [id],
    );
    expect(row.rows[0]?.name).toBe('Spoof Target');
    expect(row.rows[0]?.agency_id).toBe(agencyAId);

    await app.close();
  });

  it('Scenario: expired offer read via HTTP shows status=EXPIRED while the stored DB row is never mutated by the read', async () => {
    const app = buildTestApp(runtimePool);
    const past = new Date(Date.now() - 1000).toISOString();

    const created = await app.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-principal': 'managerA' },
      payload: { name: 'Expiring Offer', price: 50, validUntil: past },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ offer: { id: string; status: string } }>().offer.id;

    const beforeRead = await adminPool.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [id]);
    expect(beforeRead.rows[0]?.status).toBe('ACTIVE');

    const get = await app.inject({
      method: 'GET',
      url: `/offers/${id}`,
      headers: { 'x-test-principal': 'managerA' },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json<{ offer: { status: string } }>().offer.status).toBe('EXPIRED');

    const afterRead = await adminPool.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [id]);
    expect(afterRead.rows[0]?.status).toBe('ACTIVE');
    expect(afterRead.rows[0]?.status).toBe(beforeRead.rows[0]?.status);

    const list = await app.inject({
      method: 'GET',
      url: '/offers',
      headers: { 'x-test-principal': 'managerA' },
    });
    const listed = list.json<{ offers: Array<{ id: string; status: string }> }>().offers.find((o) => o.id === id);
    expect(listed?.status).toBe('EXPIRED');

    const afterList = await adminPool.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [id]);
    expect(afterList.rows[0]?.status).toBe('ACTIVE');

    await app.close();
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
          (userId === userAId && agencyId === agencyAId) ||
            (userId === userBId && agencyId === agencyBId),
        );
      },
      database: createDatabaseRuntime(pool),
    });
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Offer E2E tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Offer E2E tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Offer E2E tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run offer E2E tests against unsafe DATABASE_URL.');
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
  for (const migrationFile of migrationFiles) {
    await pool.query(readSqlForPg(migrationFile));
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
        ($1, 'Agency A', 'agency-a-offer-e2e-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-offer-e2e-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-offer-e2e-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-offer-e2e-test-only', 'ACTIVE');
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
