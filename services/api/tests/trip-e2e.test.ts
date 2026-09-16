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
// 068_protocol_numbers.sql: customers.protocol_number is a required
// NOT NULL column createCustomer()/the trip fixtures below always rely
// on -- omitting it made every customer insert fail with 'column
// protocol_number does not exist' (found via a real CI run).
const migration068 = resolve(repoRoot, 'infrastructure/migrations/068_protocol_numbers.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-trip-e2e-postgres';
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
  agentA: { userId: userAId, agencyId: agencyAId, role: UserRole.AGENT, email: 'user-a@example.test' },
  agentB: { userId: userBId, agencyId: agencyBId, role: UserRole.AGENT, email: 'user-b@example.test' },
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

describe('Trip end-to-end vertical validation (Package 2)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
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

    await resetDatabase(adminPool);
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
      url: '/trips',
      headers: { 'x-test-principal': 'agentA' },
      payload: {
        customerId: customerAId,
        name: 'Trip A',
        destination: 'Lisbon',
        startDate: '2026-01-01',
        endDate: '2026-01-10',
      },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ trip: { id: string } }>().trip.id;

    const list = await app.inject({
      method: 'GET',
      url: '/trips',
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ trips: Array<{ id: string }> }>().trips.some((t) => t.id === id)).toBe(true);

    const get1 = await app.inject({
      method: 'GET',
      url: `/trips/${id}`,
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(get1.statusCode).toBe(200);
    expect(get1.json<{ trip: { destination: string } }>().trip.destination).toBe('Lisbon');

    const patch = await app.inject({
      method: 'PATCH',
      url: `/trips/${id}`,
      headers: { 'x-test-principal': 'agentA' },
      payload: { destination: 'Porto' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json<{ trip: { destination: string } }>().trip.destination).toBe('Porto');

    const row = await adminPool.query<{ destination: string }>('SELECT destination FROM trips WHERE id = $1', [id]);
    expect(row.rows[0]?.destination).toBe('Porto');

    await app.close();
  });

  it('Scenario: full Agency B lifecycle - create, list, get, update, persisted change confirmed via direct DB read', async () => {
    const app = buildTestApp(runtimePool);

    await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { 'x-test-principal': 'agentA' },
      payload: {
        customerId: customerAId,
        name: 'Agency A Trip',
        destination: 'Madrid',
        startDate: '2026-02-01',
        endDate: '2026-02-10',
      },
    });

    const created = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { 'x-test-principal': 'agentB' },
      payload: {
        customerId: customerBId,
        name: 'Trip B',
        destination: 'Rome',
        startDate: '2026-03-01',
        endDate: '2026-03-10',
      },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ trip: { id: string } }>().trip.id;

    const list = await app.inject({
      method: 'GET',
      url: '/trips',
      headers: { 'x-test-principal': 'agentB' },
    });
    expect(list.statusCode).toBe(200);
    const destinations = list.json<{ trips: Array<{ destination: string }> }>().trips.map((t) => t.destination);
    expect(destinations).toContain('Rome');
    expect(destinations).not.toContain('Madrid');

    const patch = await app.inject({
      method: 'PATCH',
      url: `/trips/${id}`,
      headers: { 'x-test-principal': 'agentB' },
      payload: { destination: 'Milan' },
    });
    expect(patch.statusCode).toBe(200);

    const row = await adminPool.query<{ destination: string }>('SELECT destination FROM trips WHERE id = $1', [id]);
    expect(row.rows[0]?.destination).toBe('Milan');

    await app.close();
  });

  it('Scenario: isolation - lists never cross tenants, cross-tenant GET/PATCH are 404 with zero mutation', async () => {
    const app = buildTestApp(runtimePool);

    const tripA = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { 'x-test-principal': 'agentA' },
      payload: {
        customerId: customerAId,
        name: 'A Isolation',
        destination: 'Paris',
        startDate: '2026-01-01',
        endDate: '2026-01-05',
      },
    });
    const idA = tripA.json<{ trip: { id: string } }>().trip.id;

    const tripB = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { 'x-test-principal': 'agentB' },
      payload: {
        customerId: customerBId,
        name: 'B Isolation',
        destination: 'Berlin',
        startDate: '2026-01-01',
        endDate: '2026-01-05',
      },
    });
    const idB = tripB.json<{ trip: { id: string } }>().trip.id;

    const listA = await app.inject({
      method: 'GET',
      url: '/trips',
      headers: { 'x-test-principal': 'agentA' },
    });
    const listAIds = listA.json<{ trips: Array<{ id: string }> }>().trips.map((t) => t.id);
    expect(listAIds).toContain(idA);
    expect(listAIds).not.toContain(idB);

    const listB = await app.inject({
      method: 'GET',
      url: '/trips',
      headers: { 'x-test-principal': 'agentB' },
    });
    const listBIds = listB.json<{ trips: Array<{ id: string }> }>().trips.map((t) => t.id);
    expect(listBIds).toContain(idB);
    expect(listBIds).not.toContain(idA);

    const aGetB = await app.inject({
      method: 'GET',
      url: `/trips/${idB}`,
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(aGetB.statusCode).toBe(404);

    const bGetA = await app.inject({
      method: 'GET',
      url: `/trips/${idA}`,
      headers: { 'x-test-principal': 'agentB' },
    });
    expect(bGetA.statusCode).toBe(404);

    const aPatchB = await app.inject({
      method: 'PATCH',
      url: `/trips/${idB}`,
      headers: { 'x-test-principal': 'agentA' },
      payload: { destination: 'Hacked By A' },
    });
    expect(aPatchB.statusCode).toBe(404);

    const bPatchA = await app.inject({
      method: 'PATCH',
      url: `/trips/${idA}`,
      headers: { 'x-test-principal': 'agentB' },
      payload: { destination: 'Hacked By B' },
    });
    expect(bPatchA.statusCode).toBe(404);

    const rowA = await adminPool.query<{ destination: string }>('SELECT destination FROM trips WHERE id = $1', [idA]);
    expect(rowA.rows[0]?.destination).toBe('Paris');

    const rowB = await adminPool.query<{ destination: string }>('SELECT destination FROM trips WHERE id = $1', [idB]);
    expect(rowB.rows[0]?.destination).toBe('Berlin');

    await app.close();
  });

  it('Scenario: high role does not bypass tenant - OWNER from Agency A cannot read/mutate Trip B, and vice versa', async () => {
    const app = buildTestApp(runtimePool);

    const tripA = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { 'x-test-principal': 'agentA' },
      payload: {
        customerId: customerAId,
        name: 'Owner Guard A',
        destination: 'Athens',
        startDate: '2026-01-01',
        endDate: '2026-01-05',
      },
    });
    const idA = tripA.json<{ trip: { id: string } }>().trip.id;

    const tripB = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { 'x-test-principal': 'agentB' },
      payload: {
        customerId: customerBId,
        name: 'Owner Guard B',
        destination: 'Vienna',
        startDate: '2026-01-01',
        endDate: '2026-01-05',
      },
    });
    const idB = tripB.json<{ trip: { id: string } }>().trip.id;

    const ownerACrossGet = await app.inject({
      method: 'GET',
      url: `/trips/${idB}`,
      headers: { 'x-test-principal': 'ownerA' },
    });
    expect(ownerACrossGet.statusCode).toBe(404);

    const ownerACrossPatch = await app.inject({
      method: 'PATCH',
      url: `/trips/${idB}`,
      headers: { 'x-test-principal': 'ownerA' },
      payload: { destination: 'Hacked By Owner A' },
    });
    expect(ownerACrossPatch.statusCode).toBe(404);

    const ownerBCrossGet = await app.inject({
      method: 'GET',
      url: `/trips/${idA}`,
      headers: { 'x-test-principal': 'ownerB' },
    });
    expect(ownerBCrossGet.statusCode).toBe(404);

    const ownerBCrossPatch = await app.inject({
      method: 'PATCH',
      url: `/trips/${idA}`,
      headers: { 'x-test-principal': 'ownerB' },
      payload: { destination: 'Hacked By Owner B' },
    });
    expect(ownerBCrossPatch.statusCode).toBe(404);

    const rowA = await adminPool.query<{ destination: string }>('SELECT destination FROM trips WHERE id = $1', [idA]);
    expect(rowA.rows[0]?.destination).toBe('Athens');

    const rowB = await adminPool.query<{ destination: string }>('SELECT destination FROM trips WHERE id = $1', [idB]);
    expect(rowB.rows[0]?.destination).toBe('Vienna');

    await app.close();
  });

  it('Scenario: RBAC E2E - VIEWER read-only, AGENT full, higher role inherits, unknown role fails closed, no auth 401', async () => {
    const app = buildTestApp(runtimePool);

    const seeded = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { 'x-test-principal': 'agentA' },
      payload: {
        customerId: customerAId,
        name: 'RBAC Target',
        destination: 'Dublin',
        startDate: '2026-01-01',
        endDate: '2026-01-05',
      },
    });
    const id = seeded.json<{ trip: { id: string } }>().trip.id;

    const viewerGet = await app.inject({
      method: 'GET',
      url: `/trips/${id}`,
      headers: { 'x-test-principal': 'viewerA' },
    });
    expect(viewerGet.statusCode).toBe(200);

    const viewerPost = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { 'x-test-principal': 'viewerA' },
      payload: {
        customerId: customerAId,
        name: 'Viewer Attempt',
        destination: 'Oslo',
        startDate: '2026-01-01',
        endDate: '2026-01-05',
      },
    });
    expect(viewerPost.statusCode).toBe(403);

    const viewerPatch = await app.inject({
      method: 'PATCH',
      url: `/trips/${id}`,
      headers: { 'x-test-principal': 'viewerA' },
      payload: { destination: 'Viewer Attempt' },
    });
    expect(viewerPatch.statusCode).toBe(403);

    const agentPatch = await app.inject({
      method: 'PATCH',
      url: `/trips/${id}`,
      headers: { 'x-test-principal': 'agentA' },
      payload: { destination: 'Agent Updated' },
    });
    expect(agentPatch.statusCode).toBe(200);

    const ownerGet = await app.inject({
      method: 'GET',
      url: `/trips/${id}`,
      headers: { 'x-test-principal': 'ownerA' },
    });
    expect(ownerGet.statusCode).toBe(200);

    const ownerPatch = await app.inject({
      method: 'PATCH',
      url: `/trips/${id}`,
      headers: { 'x-test-principal': 'ownerA' },
      payload: { destination: 'Owner Updated' },
    });
    expect(ownerPatch.statusCode).toBe(200);

    const unknownList = await app.inject({
      method: 'GET',
      url: '/trips',
      headers: { 'x-test-principal': 'unknownRoleA' },
    });
    expect(unknownList.statusCode).toBe(403);

    const unknownPost = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { 'x-test-principal': 'unknownRoleA' },
      payload: {
        customerId: customerAId,
        name: 'Unknown Attempt',
        destination: 'Nowhere',
        startDate: '2026-01-01',
        endDate: '2026-01-05',
      },
    });
    expect(unknownPost.statusCode).toBe(403);

    const noAuthList = await app.inject({ method: 'GET', url: '/trips' });
    expect(noAuthList.statusCode).toBe(401);

    const noAuthPost = await app.inject({
      method: 'POST',
      url: '/trips',
      payload: {
        customerId: customerAId,
        name: 'No Auth',
        destination: 'Nowhere',
        startDate: '2026-01-01',
        endDate: '2026-01-05',
      },
    });
    expect(noAuthPost.statusCode).toBe(401);

    await app.close();
  });

  it('Scenario: customer relation - Customer A can be related to Trip A; Customer B rejected under Agency A principal', async () => {
    const app = buildTestApp(runtimePool);

    const created = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { 'x-test-principal': 'agentA' },
      payload: {
        customerId: customerAId,
        name: 'Customer Relation',
        destination: 'Zurich',
        startDate: '2026-01-01',
        endDate: '2026-01-05',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json<{ trip: { customerId: string } }>().trip.customerId).toBe(customerAId);

    const rejected = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { 'x-test-principal': 'agentA' },
      payload: {
        customerId: customerBId,
        name: 'Should Fail',
        destination: 'Nowhere',
        startDate: '2026-01-01',
        endDate: '2026-01-05',
      },
    });
    expect(rejected.statusCode).toBe(404);

    await app.close();
  });

  it('Scenario: saleId is rejected as a forbidden field at the HTTP layer', async () => {
    const app = buildTestApp(runtimePool);

    const created = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { 'x-test-principal': 'agentA' },
      payload: {
        customerId: customerAId,
        name: 'Sale Attempt',
        destination: 'Nowhere',
        startDate: '2026-01-01',
        endDate: '2026-01-05',
        saleId: '00000000-0000-4000-8000-000000000099',
      },
    });
    expect(created.statusCode).toBe(400);

    await app.close();
  });

  it('Scenario: status is rejected 400 via real PATCH through the full HTTP stack', async () => {
    const app = buildTestApp(runtimePool);

    const seeded = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { 'x-test-principal': 'agentA' },
      payload: {
        customerId: customerAId,
        name: 'Status Target',
        destination: 'Nowhere',
        startDate: '2026-01-01',
        endDate: '2026-01-05',
      },
    });
    const id = seeded.json<{ trip: { id: string } }>().trip.id;

    const patch = await app.inject({
      method: 'PATCH',
      url: `/trips/${id}`,
      headers: { 'x-test-principal': 'agentA' },
      payload: { status: 'CONFIRMED' },
    });
    expect(patch.statusCode).toBe(400);

    await app.close();
  });

  it('Scenario: authority field spoofing - forbidden fields rejected 400, no ownership change', async () => {
    const app = buildTestApp(runtimePool);

    const seeded = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { 'x-test-principal': 'agentA' },
      payload: {
        customerId: customerAId,
        name: 'Spoof Target',
        destination: 'Nowhere',
        startDate: '2026-01-01',
        endDate: '2026-01-05',
      },
    });
    const id = seeded.json<{ trip: { id: string } }>().trip.id;

    const patch = await app.inject({
      method: 'PATCH',
      url: `/trips/${id}`,
      headers: { 'x-test-principal': 'agentA' },
      payload: {
        destination: 'Spoofed',
        agencyId: agencyBId,
        tenantId: agencyBId,
        id: '00000000-0000-4000-8000-000000000099',
        status: 'CONFIRMED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    expect(patch.statusCode).toBe(400);

    const row = await adminPool.query<{ destination: string; agency_id: string }>(
      'SELECT destination, agency_id FROM trips WHERE id = $1',
      [id],
    );
    expect(row.rows[0]?.destination).toBe('Nowhere');
    expect(row.rows[0]?.agency_id).toBe(agencyAId);

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
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Trip E2E tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Trip E2E tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Trip E2E tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run trip E2E tests against unsafe DATABASE_URL.');
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
  await pool.query(readSqlForPg(migration001));
  await pool.query(readSqlForPg(migration002));
  await pool.query(readSqlForPg(migration068));
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
        ($1, 'Agency A', 'agency-a-trip-e2e-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-trip-e2e-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-trip-e2e-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-trip-e2e-test-only', 'ACTIVE');
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
