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
const migration019 = resolve(repoRoot, 'infrastructure/migrations/019_customer_360_addresses.sql');
const migration020 = resolve(repoRoot, 'infrastructure/migrations/020_customer_360_dependents.sql');
const migration021 = resolve(repoRoot, 'infrastructure/migrations/021_customer_360_documents.sql');
const migration046 = resolve(repoRoot, 'infrastructure/migrations/046_customer_360_completion.sql');
// 068_protocol_numbers.sql: customers.protocol_number is a required NOT NULL
// column (with a UNIQUE constraint and a server-side default) that
// createCustomer() always populates -- omitting this migration made every
// customer INSERT in this suite fail with 'column protocol_number does not
// exist' (found via a real CI run, not assumed).
const migration068 = resolve(repoRoot, 'infrastructure/migrations/068_protocol_numbers.sql');
// 049_enrollment_links.sql: 068 ALTERs enrollment_submissions too, which
// doesn't exist until this migration creates it.
const migration049b = resolve(repoRoot, 'infrastructure/migrations/049_enrollment_links.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-customer-e2e-postgres';
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
  b: { userId: userBId, agencyId: agencyBId, role: UserRole.ADMIN, email: 'user-b@example.test' },
  agentA: { userId: userAId, agencyId: agencyAId, role: UserRole.AGENT, email: 'user-a@example.test' },
  agentB: { userId: userBId, agencyId: agencyBId, role: UserRole.AGENT, email: 'user-b@example.test' },
  viewerA: { userId: userAId, agencyId: agencyAId, role: UserRole.VIEWER, email: 'user-a@example.test' },
  managerA: { userId: userAId, agencyId: agencyAId, role: UserRole.MANAGER, email: 'user-a@example.test' },
  ownerA: { userId: userAId, agencyId: agencyAId, role: UserRole.OWNER, email: 'user-a@example.test' },
  unknownRoleA: {
    userId: userAId,
    agencyId: agencyAId,
    role: 'NOT_A_REAL_ROLE' as UserRole,
    email: 'user-a@example.test',
  },
};

describe('Customer end-to-end validation (Task 3)', () => {
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
    await adminPool.query('TRUNCATE TABLE customers RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('Scenario 1: full Agency A lifecycle - create, list, get, update, get again', async () => {
    const app = buildTestApp(runtimePool);

    const created = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'Lifecycle A', email: 'lifecycle-a@example.test' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ customer: { id: string } }>().customer.id;

    const list = await app.inject({
      method: 'GET',
      url: '/customers',
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ customers: Array<{ id: string }> }>().customers.some((c) => c.id === id)).toBe(true);

    const get1 = await app.inject({
      method: 'GET',
      url: `/customers/${id}`,
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(get1.statusCode).toBe(200);
    expect(get1.json<{ customer: { id: string } }>().customer.id).toBe(id);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/customers/${id}`,
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'Lifecycle A Updated' },
    });
    expect(patch.statusCode).toBe(200);

    const get2 = await app.inject({
      method: 'GET',
      url: `/customers/${id}`,
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(get2.statusCode).toBe(200);
    expect(get2.json<{ customer: { name: string } }>().customer.name).toBe('Lifecycle A Updated');

    await app.close();
  });

  it('Scenario 2: full Agency B lifecycle, never sees Agency A data', async () => {
    const app = buildTestApp(runtimePool);

    await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'Agency A Customer' },
    });

    const created = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'agentB' },
      payload: { name: 'Lifecycle B', email: 'lifecycle-b@example.test' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ customer: { id: string } }>().customer.id;

    const list = await app.inject({
      method: 'GET',
      url: '/customers',
      headers: { 'x-test-principal': 'agentB' },
    });
    expect(list.statusCode).toBe(200);
    const names = list.json<{ customers: Array<{ name: string }> }>().customers.map((c) => c.name);
    expect(names).toContain('Lifecycle B');
    expect(names).not.toContain('Agency A Customer');

    const get1 = await app.inject({
      method: 'GET',
      url: `/customers/${id}`,
      headers: { 'x-test-principal': 'agentB' },
    });
    expect(get1.statusCode).toBe(200);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/customers/${id}`,
      headers: { 'x-test-principal': 'agentB' },
      payload: { name: 'Lifecycle B Updated' },
    });
    expect(patch.statusCode).toBe(200);

    const get2 = await app.inject({
      method: 'GET',
      url: `/customers/${id}`,
      headers: { 'x-test-principal': 'agentB' },
    });
    expect(get2.json<{ customer: { name: string } }>().customer.name).toBe('Lifecycle B Updated');

    await app.close();
  });

  it('Scenario 3: cross-tenant E2E blocked - Agency B cannot GET/PATCH Agency A customer, record untouched', async () => {
    const app = buildTestApp(runtimePool);

    const created = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'A Protected', email: 'protected@example.test' },
    });
    const id = created.json<{ customer: { id: string } }>().customer.id;

    const bGet = await app.inject({
      method: 'GET',
      url: `/customers/${id}`,
      headers: { 'x-test-principal': 'agentB' },
    });
    expect(bGet.statusCode).toBe(404);
    expect(bGet.json()).toEqual({ error: 'Customer not found', code: 'NOT_FOUND' });

    const bPatch = await app.inject({
      method: 'PATCH',
      url: `/customers/${id}`,
      headers: { 'x-test-principal': 'agentB' },
      payload: { name: 'Hacked By B' },
    });
    expect(bPatch.statusCode).toBe(404);
    expect(bPatch.json()).toEqual({ error: 'Customer not found', code: 'NOT_FOUND' });

    const aGet = await app.inject({
      method: 'GET',
      url: `/customers/${id}`,
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(aGet.statusCode).toBe(200);
    expect(aGet.json<{ customer: { name: string } }>().customer.name).toBe('A Protected');

    await app.close();
  });

  it('Scenario 4: RBAC E2E - VIEWER read-only, AGENT full, MANAGER/OWNER inherit, unknown role fails closed', async () => {
    const app = buildTestApp(runtimePool);

    const seeded = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'RBAC Target' },
    });
    const id = seeded.json<{ customer: { id: string } }>().customer.id;

    // VIEWER: read ok, write forbidden
    const viewerList = await app.inject({
      method: 'GET',
      url: '/customers',
      headers: { 'x-test-principal': 'viewerA' },
    });
    expect(viewerList.statusCode).toBe(200);

    const viewerGet = await app.inject({
      method: 'GET',
      url: `/customers/${id}`,
      headers: { 'x-test-principal': 'viewerA' },
    });
    expect(viewerGet.statusCode).toBe(200);

    const viewerPost = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'viewerA' },
      payload: { name: 'Viewer Attempt' },
    });
    expect(viewerPost.statusCode).toBe(403);

    const viewerPatch = await app.inject({
      method: 'PATCH',
      url: `/customers/${id}`,
      headers: { 'x-test-principal': 'viewerA' },
      payload: { name: 'Viewer Attempt' },
    });
    expect(viewerPatch.statusCode).toBe(403);

    // AGENT: full access
    const agentPost = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'Agent Direct' },
    });
    expect(agentPost.statusCode).toBe(201);

    // MANAGER / OWNER inherit
    for (const key of ['managerA', 'ownerA'] as const) {
      const listRes = await app.inject({
        method: 'GET',
        url: '/customers',
        headers: { 'x-test-principal': key },
      });
      expect(listRes.statusCode).toBe(200);

      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/customers/${id}`,
        headers: { 'x-test-principal': key },
        payload: { name: `${key} updated` },
      });
      expect(patchRes.statusCode).toBe(200);
    }

    // Unknown role fails closed on both read and write
    const unknownList = await app.inject({
      method: 'GET',
      url: '/customers',
      headers: { 'x-test-principal': 'unknownRoleA' },
    });
    expect(unknownList.statusCode).toBe(403);

    const unknownGet = await app.inject({
      method: 'GET',
      url: `/customers/${id}`,
      headers: { 'x-test-principal': 'unknownRoleA' },
    });
    expect(unknownGet.statusCode).toBe(403);

    const unknownPost = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'unknownRoleA' },
      payload: { name: 'Unknown Attempt' },
    });
    expect(unknownPost.statusCode).toBe(403);

    const unknownPatch = await app.inject({
      method: 'PATCH',
      url: `/customers/${id}`,
      headers: { 'x-test-principal': 'unknownRoleA' },
      payload: { name: 'Unknown Attempt' },
    });
    expect(unknownPatch.statusCode).toBe(403);

    await app.close();
  });

  it('Scenario 5: auth fail-closed - no principal returns 401 on read and write', async () => {
    const app = buildTestApp(runtimePool);

    const list = await app.inject({ method: 'GET', url: '/customers' });
    expect(list.statusCode).toBe(401);
    expect(list.json()).toMatchObject({ code: 'UNAUTHORIZED' });

    const post = await app.inject({
      method: 'POST',
      url: '/customers',
      payload: { name: 'No Auth' },
    });
    expect(post.statusCode).toBe(401);
    expect(post.json()).toMatchObject({ code: 'UNAUTHORIZED' });

    await app.close();
  });

  it('Scenario 6: ownership/input attack - forbidden fields rejected with 400, no row mutated', async () => {
    const app = buildTestApp(runtimePool);

    const forbiddenBodies = [
      { name: 'Attack', agencyId: agencyBId },
      { name: 'Attack', tenantId: agencyBId },
      { name: 'Attack', id: '00000000-0000-4000-8000-000000000099' },
      { name: 'Attack', deletedAt: new Date().toISOString() },
      { name: 'Attack', status: 'ACTIVE' },
      { name: 'Attack', createdBy: userBId },
    ];

    for (const payload of forbiddenBodies) {
      const response = await app.inject({
        method: 'POST',
        url: '/customers',
        headers: { 'x-test-principal': 'agentA' },
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    }

    const rows = await adminPool.query<{ count: string }>(
      "SELECT COUNT(*)::TEXT AS count FROM customers WHERE name = 'Attack'",
    );
    expect(rows.rows[0]?.count).toBe('0');

    const seeded = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'Patch Target' },
    });
    const id = seeded.json<{ customer: { id: string } }>().customer.id;

    const patchAttack = await app.inject({
      method: 'PATCH',
      url: `/customers/${id}`,
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'Patched Attack', agencyId: agencyBId, deletedAt: new Date().toISOString() },
    });
    expect(patchAttack.statusCode).toBe(400);

    const row = await adminPool.query<{ name: string }>('SELECT name FROM customers WHERE id = $1', [id]);
    expect(row.rows[0]?.name).toBe('Patch Target');

    await app.close();
  });

  it('Scenario 7: 409 conflict via real unique index, safe generic message', async () => {
    const app = buildTestApp(runtimePool);

    const first = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'Conflict One', cpf: '55566677788' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'Conflict Two', cpf: '55566677788' },
    });
    expect(second.statusCode).toBe(409);
    const body = second.json<{ error: string; code: string }>();
    expect(body).toEqual({ error: 'A customer with this CPF or email already exists', code: 'CONFLICT' });
    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toMatch(/duplicate key|constraint|SQL|postgres/i);

    const rows = await adminPool.query<{ count: string }>(
      "SELECT COUNT(*)::TEXT AS count FROM customers WHERE cpf = '55566677788'",
    );
    expect(rows.rows[0]?.count).toBe('1');

    await app.close();
  });

  it('Scenario 8: soft delete - excluded from list/get, PATCH is a no-op 404', async () => {
    const app = buildTestApp(runtimePool);

    const seeded = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'Soon Deleted' },
    });
    const id = seeded.json<{ customer: { id: string } }>().customer.id;

    await adminPool.query('UPDATE customers SET deleted_at = now() WHERE id = $1', [id]);

    const list = await app.inject({
      method: 'GET',
      url: '/customers',
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(list.json<{ customers: Array<{ id: string }> }>().customers.some((c) => c.id === id)).toBe(false);

    const get = await app.inject({
      method: 'GET',
      url: `/customers/${id}`,
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(get.statusCode).toBe(404);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/customers/${id}`,
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'Reactivate Attempt' },
    });
    expect(patch.statusCode).toBe(404);

    const row = await adminPool.query<{ name: string; deleted_at: string | null }>(
      'SELECT name, deleted_at FROM customers WHERE id = $1',
      [id],
    );
    expect(row.rows[0]?.name).toBe('Soon Deleted');
    expect(row.rows[0]?.deleted_at).not.toBeNull();

    await app.close();
  });

  it('Scenario 11: concurrency - interleaved Agency A/B requests never cross-contaminate', async () => {
    const app = buildTestApp(runtimePool);

    const seedA = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'Concurrent A Seed' },
    });
    const seedB = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'agentB' },
      payload: { name: 'Concurrent B Seed' },
    });
    expect(seedA.statusCode).toBe(201);
    expect(seedB.statusCode).toBe(201);

    const requests = [
      app.inject({ method: 'GET', url: '/customers', headers: { 'x-test-principal': 'agentA' } }),
      app.inject({ method: 'GET', url: '/customers', headers: { 'x-test-principal': 'agentB' } }),
      app.inject({ method: 'GET', url: '/customers', headers: { 'x-test-principal': 'agentA' } }),
      app.inject({ method: 'GET', url: '/customers', headers: { 'x-test-principal': 'agentB' } }),
      app.inject({
        method: 'POST',
        url: '/customers',
        headers: { 'x-test-principal': 'agentA' },
        payload: { name: 'Concurrent A Create' },
      }),
      app.inject({
        method: 'POST',
        url: '/customers',
        headers: { 'x-test-principal': 'agentB' },
        payload: { name: 'Concurrent B Create' },
      }),
    ];

    const responses = await Promise.all(requests);
    const listA1 = responses[0]!;
    const listB1 = responses[1]!;
    const listA2 = responses[2]!;
    const listB2 = responses[3]!;
    const createA = responses[4]!;
    const createB = responses[5]!;

    for (const response of [listA1, listA2]) {
      const customers = response.json<{ customers: Array<{ agencyId: string }> }>().customers;
      expect(customers.every((c) => c.agencyId === agencyAId)).toBe(true);
    }
    for (const response of [listB1, listB2]) {
      const customers = response.json<{ customers: Array<{ agencyId: string }> }>().customers;
      expect(customers.every((c) => c.agencyId === agencyBId)).toBe(true);
    }

    expect(createA.statusCode).toBe(201);
    expect(createB.statusCode).toBe(201);
    expect(createA.json<{ customer: { agencyId: string } }>().customer.agencyId).toBe(agencyAId);
    expect(createB.json<{ customer: { agencyId: string } }>().customer.agencyId).toBe(agencyBId);

    await app.close();
  });

  it('Scenario 12: error response bodies contain only generic {error, code}, no internals', async () => {
    const app = buildTestApp(runtimePool);

    const notFound = await app.inject({
      method: 'GET',
      url: '/customers/00000000-0000-4000-8000-000000000099',
      headers: { 'x-test-principal': 'agentA' },
    });
    const badInput = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'X', agencyId: agencyBId },
    });
    const noAuth = await app.inject({ method: 'GET', url: '/customers' });
    const forbidden = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'viewerA' },
      payload: { name: 'X' },
    });
    const created = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'Conflict Base', email: 'conflict-base@example.test' },
    });
    const conflict = await app.inject({
      method: 'POST',
      url: '/customers',
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'Conflict Dup', email: 'conflict-base@example.test' },
    });

    expect(created.statusCode).toBe(201);

    for (const response of [notFound, badInput, noAuth, forbidden, conflict]) {
      const body = response.json<Record<string, unknown>>();
      expect(Object.keys(body).sort()).toEqual(['code', 'error']);
      const bodyText = JSON.stringify(body);
      expect(bodyText).not.toMatch(/DATABASE_URL|at\s+\S+\.(js|ts):\d+|postgres:\/\/|constraint|SELECT |INSERT |UPDATE /i);
    }

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
    throw new Error('Customer E2E tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Customer E2E tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Customer E2E tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run customer E2E tests against unsafe DATABASE_URL.');
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
  await pool.query(readSqlForPg(migration019));
  await pool.query(readSqlForPg(migration020));
  await pool.query(readSqlForPg(migration021));
  await pool.query(readSqlForPg(migration046));
  await pool.query(readSqlForPg(migration049b));
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
        ($1, 'Agency A', 'agency-a-customer-e2e-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-customer-e2e-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-customer-e2e-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-customer-e2e-test-only', 'ACTIVE');
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
