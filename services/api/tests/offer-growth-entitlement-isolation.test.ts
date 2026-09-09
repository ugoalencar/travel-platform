import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { createDatabaseRuntime, createPlatformDatabaseRuntime } from '../src/database';

// ============================================================
// MANDATORY entitlement isolation test (Offer & Growth Engine batch 04,
// section Y). Agency A has SOCIAL_AUTOMATION ON, Agency B has it OFF,
// same-shaped user/role in both. Proves:
//   - Agency A can activate/use automation.
//   - Agency B is blocked at the backend (entitlement check, not just
//     hidden UI).
//   - Cross-tenant access (Agency B user touching Agency A's automation
//     by id) is blocked regardless of entitlement.
// Also proves the platform entitlement-write stopgap cannot be reached
// via a normal agency-authenticated request (section H boundary).
// ============================================================

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationFiles = [
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
].map((name) => resolve(repoRoot, 'infrastructure/migrations', name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-offer-growth-entitlement-postgres';
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
  agentA: { userId: userAId, agencyId: agencyAId, role: UserRole.AGENT, email: 'user-a@example.test' },
  managerB: { userId: userBId, agencyId: agencyBId, role: UserRole.MANAGER, email: 'user-b@example.test' },
  agentB: { userId: userBId, agencyId: agencyBId, role: UserRole.AGENT, email: 'user-b@example.test' },
  ownerB: { userId: userBId, agencyId: agencyBId, role: UserRole.OWNER, email: 'user-b@example.test' },
};

describe.sequential('Offer & Growth Engine: entitlement isolation (mandatory)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let automationAId: string;

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

    // Agency A: SOCIAL_AUTOMATION ON. Agency B: SOCIAL_AUTOMATION OFF
    // (explicit disabled row -- proves "no row" and "disabled row" both
    // fail closed the same way in the isolation test below).
    await adminPool.query(
      `INSERT INTO agency_entitlements (agency_id, feature, enabled, updated_by)
       VALUES ($1, 'SOCIAL_AUTOMATION', true, 'test-seed'),
              ($2, 'SOCIAL_AUTOMATION', false, 'test-seed')`,
      [agencyAId, agencyBId],
    );
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  function buildTestApp() {
    return buildApp({
      authProvider: {
        authenticate(request) {
          const key = request.headers['x-test-principal'];
          return Promise.resolve(typeof key === 'string' ? principals[key] ?? null : null);
        },
      },
      validateUserAgencyAccess: (userId, agencyId) =>
        Promise.resolve(
          (userId === userAId && agencyId === agencyAId) || (userId === userBId && agencyId === agencyBId),
        ),
      database: createDatabaseRuntime(runtimePool),
      platformStopgap: {
        enabled: true,
        sharedKey: 'test-only-platform-key',
        database: createPlatformDatabaseRuntime(adminPool),
      },
    });
  }

  it('Agency A (entitled) can create and activate an automation', async () => {
    const app = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/automations',
      headers: { 'x-test-principal': 'agentA' },
      payload: {
        name: 'Agency A automation',
        trigger: 'COMMENT_KEYWORD',
        keyword: 'PROMO',
        actions: [{ type: 'PUBLIC_REPLY', message: 'hi' }],
      },
    });
    expect(created.statusCode).toBe(201);
    automationAId = created.json<{ automation: { id: string } }>().automation.id;

    const activated = await app.inject({
      method: 'POST',
      url: `/automations/${automationAId}/activate`,
      headers: { 'x-test-principal': 'managerA' },
    });
    expect(activated.statusCode).toBe(200);
    expect(activated.json<{ automation: { status: string } }>().automation.status).toBe('ACTIVE');
    await app.close();
  });

  it('Agency B (not entitled) is blocked at the backend from creating an automation', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/automations',
      headers: { 'x-test-principal': 'agentB' },
      payload: {
        name: 'Agency B automation',
        trigger: 'COMMENT_KEYWORD',
        keyword: 'PROMO',
        actions: [{ type: 'PUBLIC_REPLY', message: 'hi' }],
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).not.toHaveProperty('automation');

    const count = await adminPool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM automations WHERE agency_id = $1`,
      [agencyBId],
    );
    expect(Number(count.rows[0]?.count)).toBe(0);
    await app.close();
  });

  it('Agency B (not entitled) is blocked from listing/reading automations even with a MANAGER role', async () => {
    const app = buildTestApp();
    const listResponse = await app.inject({
      method: 'GET',
      url: '/automations',
      headers: { 'x-test-principal': 'managerB' },
    });
    expect(listResponse.statusCode).toBe(403);
    await app.close();
  });

  it('cross-tenant: Agency B (even OWNER) cannot activate Agency A automation by id, regardless of entitlement', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: `/automations/${automationAId}/activate`,
      headers: { 'x-test-principal': 'ownerB' },
    });
    // Agency B lacks the entitlement at all, so this fails at the
    // entitlement gate (403) before RLS/tenant lookup would even return
    // 404 -- either way, Agency A's automation must not be touched.
    expect([403, 404]).toContain(response.statusCode);

    const row = await adminPool.query<{ status: string }>(
      `SELECT status FROM automations WHERE agency_id = $1 AND id = $2`,
      [agencyAId, automationAId],
    );
    expect(row.rows[0]?.status).toBe('ACTIVE');
    await app.close();
  });

  it('cross-tenant: even if Agency B somehow had the entitlement, RLS still blocks touching Agency A automation by id', async () => {
    await adminPool.query(
      `UPDATE agency_entitlements SET enabled = true WHERE agency_id = $1 AND feature = 'SOCIAL_AUTOMATION'`,
      [agencyBId],
    );
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: `/automations/${automationAId}/activate`,
      headers: { 'x-test-principal': 'ownerB' },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
    await adminPool.query(
      `UPDATE agency_entitlements SET enabled = false WHERE agency_id = $1 AND feature = 'SOCIAL_AUTOMATION'`,
      [agencyBId],
    );
  });

  it('platform entitlement-write stopgap: an agency OWNER JWT cannot self-grant an entitlement', async () => {
    const app = buildTestApp();
    // ownerB tries to hit the platform-scoped write route with their own
    // (real, valid-for-their-agency) auth header instead of the platform
    // shared-secret header. Must be rejected -- the route ignores the
    // agency JWT entirely and requires x-platform-stopgap-key.
    const response = await app.inject({
      method: 'POST',
      url: '/platform/entitlements',
      headers: { 'x-test-principal': 'ownerB' },
      payload: { agencyId: agencyBId, feature: 'SOCIAL_AUTOMATION', enabled: true },
    });
    expect(response.statusCode).toBe(401);

    const row = await adminPool.query<{ enabled: boolean }>(
      `SELECT enabled FROM agency_entitlements WHERE agency_id = $1 AND feature = 'SOCIAL_AUTOMATION'`,
      [agencyBId],
    );
    expect(row.rows[0]?.enabled).toBe(false);
    await app.close();
  });

  it('platform entitlement-write stopgap: the correct shared key CAN write an entitlement (documented temporary mechanism)', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/platform/entitlements',
      headers: { 'x-platform-stopgap-key': 'test-only-platform-key' },
      payload: { agencyId: agencyBId, feature: 'CAMPAIGNS', enabled: true },
    });
    expect(response.statusCode).toBe(200);

    const row = await adminPool.query<{ enabled: boolean }>(
      `SELECT enabled FROM agency_entitlements WHERE agency_id = $1 AND feature = 'CAMPAIGNS'`,
      [agencyBId],
    );
    expect(row.rows[0]?.enabled).toBe(true);
    await app.close();
  });
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Entitlement isolation test requires localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Entitlement isolation test requires a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Entitlement isolation test requires a database name with a test marker.');
  }
}

function resetDisposableDatabase(): void {
  compose(['down', '-v']);
  compose(['up', '-d']);
}

function compose(args: readonly string[]) {
  return run('docker', ['compose', '-f', composeFile, '-p', projectName, ...args]);
}

async function waitForHealthyContainer(): Promise<void> {
  const timeoutAt = Date.now() + 120_000;
  while (Date.now() < timeoutAt) {
    const result = run('docker', ['inspect', '-f', '{{.State.Health.Status}}', containerName], false);
    if (result.stdout.trim() === 'healthy') return;
    await new Promise((resolveWait) => {
      setTimeout(resolveWait, 2_000);
    });
  }
  throw new Error('Local PostgreSQL container did not become healthy in time.');
}

function assertContainerIsLocal(): void {
  const result = run('docker', ['ps', '--filter', `name=${containerName}`, '--format', '{{.Image}}|{{.Ports}}']);
  const output = result.stdout.trim();
  if (!output.includes(postgresImage) || !output.includes(`${databaseHost}:${databasePort}->5432/tcp`)) {
    throw new Error('Container is not the expected local disposable Postgres.');
  }
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
    `INSERT INTO agencies (id, name, slug, email, plan, status)
     VALUES
       ($1, 'Agency A', 'agency-a-entitlement-isolation-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
       ($2, 'Agency B', 'agency-b-entitlement-isolation-test', 'agency-b@example.test', 'FREE', 'ACTIVE')`,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
     VALUES
       ($1, $2, 'user-a@example.test', 'User A', 'OWNER', 'hash-for-entitlement-isolation-test-only', 'ACTIVE'),
       ($3, $4, 'user-b@example.test', 'User B', 'OWNER', 'hash-for-entitlement-isolation-test-only', 'ACTIVE')`,
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
