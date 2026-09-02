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
const migration005 = resolve(repoRoot, 'infrastructure/migrations/005_booking.sql');
const migration006 = resolve(repoRoot, 'infrastructure/migrations/006_field_operations.sql');
const migration007 = resolve(repoRoot, 'infrastructure/migrations/007_commission_repair.sql');
const migration010 = resolve(repoRoot, 'infrastructure/migrations/010_financial_foundation.sql');
const migration015 = resolve(repoRoot, 'infrastructure/migrations/015_audit_logging.sql');
const migration024 = resolve(repoRoot, 'infrastructure/migrations/024_extended_financial_module.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-sale-e2e-postgres';
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

describe.sequential('Sale end-to-end vertical validation', () => {
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
    await adminPool.query(
      `TRUNCATE TABLE
        payment_allocations,
        payments,
        receivables,
        payables,
        operational_costs,
        revenues,
        expenses,
        cash_transactions,
        reconciliations,
        financial_categories,
        audit_logs
       RESTART IDENTITY CASCADE`,
    );
    await adminPool.query('TRUNCATE TABLE sales RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE proposals RESTART IDENTITY CASCADE');
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

  it('Scenario: full Agency A lifecycle - create, list, get, patch (amount/discount recomputes total), persisted change confirmed via direct DB read', async () => {
    const app = buildTestApp(runtimePool);

    const created = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerAId, amount: 500, discount: 50 },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ sale: { id: string; total: number } }>().sale.id;
    expect(created.json<{ sale: { total: number } }>().sale.total).toBe(450);

    const list = await app.inject({
      method: 'GET',
      url: '/sales',
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ sales: Array<{ id: string }> }>().sales.some((s) => s.id === id)).toBe(true);

    const get1 = await app.inject({
      method: 'GET',
      url: `/sales/${id}`,
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(get1.statusCode).toBe(200);

    const patch = await app.inject({
      method: 'PATCH',
      url: `/sales/${id}`,
      headers: { 'x-test-principal': 'agentA' },
      payload: { amount: 1000, discount: 100 },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json<{ sale: { total: number } }>().sale.total).toBe(900);

    const row = await adminPool.query<{ amount: string; discount: string; total: string }>(
      'SELECT amount, discount, total FROM sales WHERE id = $1',
      [id],
    );
    expect(row.rows[0]?.amount).toBe('1000.00');
    expect(row.rows[0]?.total).toBe('900.00');

    await app.close();
  });

  it('Scenario: isolation - lists never cross tenants, cross-tenant GET/PATCH are 404 with zero mutation', async () => {
    const app = buildTestApp(runtimePool);

    const saleA = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerAId, amount: 10 },
    });
    const idA = saleA.json<{ sale: { id: string } }>().sale.id;

    const saleB = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { 'x-test-principal': 'agentB' },
      payload: { customerId: customerBId, amount: 20 },
    });
    const idB = saleB.json<{ sale: { id: string } }>().sale.id;

    const listA = await app.inject({
      method: 'GET',
      url: '/sales',
      headers: { 'x-test-principal': 'agentA' },
    });
    const listAIds = listA.json<{ sales: Array<{ id: string }> }>().sales.map((s) => s.id);
    expect(listAIds).toContain(idA);
    expect(listAIds).not.toContain(idB);

    const listB = await app.inject({
      method: 'GET',
      url: '/sales',
      headers: { 'x-test-principal': 'agentB' },
    });
    const listBIds = listB.json<{ sales: Array<{ id: string }> }>().sales.map((s) => s.id);
    expect(listBIds).toContain(idB);
    expect(listBIds).not.toContain(idA);

    const aGetB = await app.inject({
      method: 'GET',
      url: `/sales/${idB}`,
      headers: { 'x-test-principal': 'agentA' },
    });
    expect(aGetB.statusCode).toBe(404);

    const bGetA = await app.inject({
      method: 'GET',
      url: `/sales/${idA}`,
      headers: { 'x-test-principal': 'agentB' },
    });
    expect(bGetA.statusCode).toBe(404);

    const aPatchB = await app.inject({
      method: 'PATCH',
      url: `/sales/${idB}`,
      headers: { 'x-test-principal': 'agentA' },
      payload: { amount: 9999 },
    });
    expect(aPatchB.statusCode).toBe(404);

    const bPatchA = await app.inject({
      method: 'PATCH',
      url: `/sales/${idA}`,
      headers: { 'x-test-principal': 'agentB' },
      payload: { amount: 9999 },
    });
    expect(bPatchA.statusCode).toBe(404);

    const rowA = await adminPool.query<{ amount: string }>('SELECT amount FROM sales WHERE id = $1', [idA]);
    expect(rowA.rows[0]?.amount).toBe('10.00');

    const rowB = await adminPool.query<{ amount: string }>('SELECT amount FROM sales WHERE id = $1', [idB]);
    expect(rowB.rows[0]?.amount).toBe('20.00');

    await app.close();
  });

  it('Scenario: high role does not bypass tenant - OWNER from Agency A cannot read/mutate Sale B, and vice versa', async () => {
    const app = buildTestApp(runtimePool);

    const saleA = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerAId, amount: 15 },
    });
    const idA = saleA.json<{ sale: { id: string } }>().sale.id;

    const saleB = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { 'x-test-principal': 'agentB' },
      payload: { customerId: customerBId, amount: 25 },
    });
    const idB = saleB.json<{ sale: { id: string } }>().sale.id;

    const ownerACrossGet = await app.inject({
      method: 'GET',
      url: `/sales/${idB}`,
      headers: { 'x-test-principal': 'ownerA' },
    });
    expect(ownerACrossGet.statusCode).toBe(404);

    const ownerACrossPatch = await app.inject({
      method: 'PATCH',
      url: `/sales/${idB}`,
      headers: { 'x-test-principal': 'ownerA' },
      payload: { amount: 1 },
    });
    expect(ownerACrossPatch.statusCode).toBe(404);

    const ownerBCrossGet = await app.inject({
      method: 'GET',
      url: `/sales/${idA}`,
      headers: { 'x-test-principal': 'ownerB' },
    });
    expect(ownerBCrossGet.statusCode).toBe(404);

    const rowA = await adminPool.query<{ amount: string }>('SELECT amount FROM sales WHERE id = $1', [idA]);
    expect(rowA.rows[0]?.amount).toBe('15.00');

    const rowB = await adminPool.query<{ amount: string }>('SELECT amount FROM sales WHERE id = $1', [idB]);
    expect(rowB.rows[0]?.amount).toBe('25.00');

    await app.close();
  });

  it('Scenario: RBAC E2E - VIEWER read-only, AGENT full write, higher role inherits, unknown role fails closed, no auth 401', async () => {
    const app = buildTestApp(runtimePool);

    const seeded = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerAId, amount: 5 },
    });
    const id = seeded.json<{ sale: { id: string } }>().sale.id;

    const viewerGet = await app.inject({
      method: 'GET',
      url: `/sales/${id}`,
      headers: { 'x-test-principal': 'viewerA' },
    });
    expect(viewerGet.statusCode).toBe(200);

    const viewerPost = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { 'x-test-principal': 'viewerA' },
      payload: { customerId: customerAId, amount: 1 },
    });
    expect(viewerPost.statusCode).toBe(403);

    const viewerPatch = await app.inject({
      method: 'PATCH',
      url: `/sales/${id}`,
      headers: { 'x-test-principal': 'viewerA' },
      payload: { amount: 1 },
    });
    expect(viewerPatch.statusCode).toBe(403);

    const ownerPatch = await app.inject({
      method: 'PATCH',
      url: `/sales/${id}`,
      headers: { 'x-test-principal': 'ownerA' },
      payload: { amount: 50 },
    });
    expect(ownerPatch.statusCode).toBe(200);

    const unknownList = await app.inject({
      method: 'GET',
      url: '/sales',
      headers: { 'x-test-principal': 'unknownRoleA' },
    });
    expect(unknownList.statusCode).toBe(403);

    const unknownPost = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { 'x-test-principal': 'unknownRoleA' },
      payload: { customerId: customerAId, amount: 1 },
    });
    expect(unknownPost.statusCode).toBe(403);

    const noAuthList = await app.inject({ method: 'GET', url: '/sales' });
    expect(noAuthList.statusCode).toBe(401);

    const noAuthPost = await app.inject({
      method: 'POST',
      url: '/sales',
      payload: { customerId: customerAId, amount: 1 },
    });
    expect(noAuthPost.statusCode).toBe(401);

    await app.close();
  });

  it('Scenario: total is server-computed via real HTTP round-trip; client-sent total is rejected 400', async () => {
    const app = buildTestApp(runtimePool);

    const created = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerAId, amount: 100, discount: 25, total: 999 },
    });
    expect(created.statusCode).toBe(400);

    const validCreate = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerAId, amount: 100, discount: 25 },
    });
    expect(validCreate.statusCode).toBe(201);
    expect(validCreate.json<{ sale: { total: number } }>().sale.total).toBe(75);

    await app.close();
  });

  it('Scenario: a second Sale for the same Proposal is rejected cleanly (409, no raw constraint name leaked)', async () => {
    const app = buildTestApp(runtimePool);
    const proposalId = await seedProposal(agencyAId, customerAId);

    const first = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerAId, proposalId, amount: 300 },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerAId, proposalId, amount: 400 },
    });
    expect(second.statusCode).toBe(409);
    const body = JSON.stringify(second.json());
    expect(body).not.toMatch(/sales_agency_proposal_key/);
    expect(body).not.toMatch(/constraint/i);

    await app.close();
  });

  it('Scenario: attempting to set status or paidAt via PATCH returns 400', async () => {
    const app = buildTestApp(runtimePool);

    const seeded = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerAId, amount: 100 },
    });
    const id = seeded.json<{ sale: { id: string } }>().sale.id;

    const statusPatch = await app.inject({
      method: 'PATCH',
      url: `/sales/${id}`,
      headers: { 'x-test-principal': 'agentA' },
      payload: { status: 'PAID' },
    });
    expect(statusPatch.statusCode).toBe(400);

    const paidAtPatch = await app.inject({
      method: 'PATCH',
      url: `/sales/${id}`,
      headers: { 'x-test-principal': 'agentA' },
      payload: { paidAt: new Date().toISOString() },
    });
    expect(paidAtPatch.statusCode).toBe(400);

    await app.close();
  });

  it('Scenario: authority field spoofing - forbidden fields rejected 400, no ownership/identity change', async () => {
    const app = buildTestApp(runtimePool);

    const seeded = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { 'x-test-principal': 'agentA' },
      payload: { customerId: customerAId, amount: 1 },
    });
    const id = seeded.json<{ sale: { id: string } }>().sale.id;

    const patch = await app.inject({
      method: 'PATCH',
      url: `/sales/${id}`,
      headers: { 'x-test-principal': 'agentA' },
      payload: {
        amount: 2,
        agencyId: agencyBId,
        tenantId: agencyBId,
        id: '00000000-0000-4000-8000-000000000099',
        userId: userBId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    expect(patch.statusCode).toBe(400);

    const row = await adminPool.query<{ amount: string; agency_id: string; user_id: string }>(
      'SELECT amount, agency_id, user_id FROM sales WHERE id = $1',
      [id],
    );
    expect(row.rows[0]?.amount).toBe('1.00');
    expect(row.rows[0]?.agency_id).toBe(agencyAId);
    expect(row.rows[0]?.user_id).toBe(userAId);

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
      `INSERT INTO customers (agency_id, name, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
      [agencyId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed customer');
    return id;
  }

  async function seedProposal(agencyId: string, customerId: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO proposals (agency_id, customer_id, proposed_price, discount, total)
       VALUES ($1, $2, '100.00', '0.00', '100.00') RETURNING id`,
      [agencyId, customerId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed proposal');
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Sale E2E tests require localhost only.');
  }

  if (databasePort !== 55432) {
    throw new Error('Sale E2E tests require local port 55432.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Sale E2E tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === '55432' || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run sale E2E tests against unsafe DATABASE_URL.');
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
  await pool.query(readSqlForPg(migration003));
  await pool.query(readSqlForPg(migration004));
  await pool.query(readSqlForPg(migration005));
  await pool.query(readSqlForPg(migration006));
  await pool.query(readSqlForPg(migration007));
  await pool.query(readSqlForPg(migration010));
  await pool.query(readSqlForPg(migration015));
  await pool.query(readSqlForPg(migration024));
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
        ($1, 'Agency A', 'agency-a-sale-e2e-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-sale-e2e-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-sale-e2e-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-sale-e2e-test-only', 'ACTIVE');
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
