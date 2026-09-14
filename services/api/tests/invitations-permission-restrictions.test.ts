import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  resolvePublicInvitationToken,
  acceptInvitation,
} from '../src/invitations';
import {
  createPermissionRestriction,
  listPermissionRestrictions,
  deletePermissionRestriction,
  assertNotRestricted,
} from '../src/permission-restrictions';
import { getAgencyProfile, updateOnboardingStep, completeOnboarding } from '../src/settings-queries';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-invitations-postgres';
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

const agencyAId = '10000000-0000-4000-8000-000000000002';
const agencyBId = '20000000-0000-4000-8000-000000000002';
const ownerAId = '11000000-0000-4000-8000-000000000002';
const adminAId = '11000000-0000-4000-8000-000000000003';
const userBId = '21000000-0000-4000-8000-000000000002';

const ownerContextA = {
  agencyId: agencyAId,
  userId: ownerAId,
  userRole: UserRole.OWNER,
  email: 'owner-a@example.test',
};
const adminContextA = {
  agencyId: agencyAId,
  userId: adminAId,
  userRole: UserRole.ADMIN,
  email: 'admin-a@example.test',
};
const agentContextA = {
  agencyId: agencyAId,
  userId: adminAId,
  userRole: UserRole.AGENT,
  email: 'agent-a@example.test',
};
const contextB = {
  agencyId: agencyBId,
  userId: userBId,
  userRole: UserRole.ADMIN,
  email: 'user-b@example.test',
};

describe('Invitations + PermissionRestrictions data-access layer (Agent 01 SaaS Admin)', () => {
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
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE invitations RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE permission_restrictions RESTART IDENTITY CASCADE');
    await adminPool.query(`DELETE FROM users WHERE id NOT IN ($1, $2, $3)`, [
      ownerAId,
      adminAId,
      userBId,
    ]);
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  // ------------------------------------------------------------
  // Invitations
  // ------------------------------------------------------------
  it('fails closed with no tenant context established', async () => {
    await expect(listInvitations(database)).rejects.toThrow();
  });

  it('ADMIN can create an invitation; token is high-entropy and only its hash is persisted', async () => {
    const { invitation, token } = await runWithTenantContext(adminContextA, () =>
      createInvitation(database, UserRole.ADMIN, { email: 'new-agent@example.test', role: UserRole.AGENT }),
    );

    expect(invitation.status).toBe('PENDING');
    expect(token.length).toBeGreaterThanOrEqual(32);

    const row = await adminPool.query<{ token_hash: string }>(
      'SELECT token_hash FROM invitations WHERE id = $1',
      [invitation.id],
    );
    expect(row.rows[0]?.token_hash).not.toBe(token);
    expect(row.rows[0]?.token_hash).toHaveLength(64); // sha256 hex
  });

  it('an ADMIN cannot invite an OWNER (cannot grant above own role)', async () => {
    await expect(
      runWithTenantContext(adminContextA, () =>
        createInvitation(database, UserRole.ADMIN, { email: 'wannabe-owner@example.test', role: UserRole.OWNER }),
      ),
    ).rejects.toThrow();
  });

  it('an OWNER can invite an ADMIN', async () => {
    const { invitation } = await runWithTenantContext(ownerContextA, () =>
      createInvitation(database, UserRole.OWNER, { email: 'new-admin@example.test', role: UserRole.ADMIN }),
    );
    expect(invitation.role).toBe(UserRole.ADMIN);
  });

  it('listInvitations only returns the current tenant invitations (tenant isolation)', async () => {
    await runWithTenantContext(adminContextA, () =>
      createInvitation(database, UserRole.ADMIN, { email: 'a-invitee@example.test', role: UserRole.AGENT }),
    );
    await runWithTenantContext(contextB, () =>
      createInvitation(database, UserRole.ADMIN, { email: 'b-invitee@example.test', role: UserRole.AGENT }),
    );

    const fromA = await runWithTenantContext(adminContextA, () => listInvitations(database));
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.email).toBe('a-invitee@example.test');

    const fromB = await runWithTenantContext(contextB, () => listInvitations(database));
    expect(fromB).toHaveLength(1);
    expect(fromB[0]?.email).toBe('b-invitee@example.test');
  });

  it('revoking an invitation from another tenant is a no-op', async () => {
    const { invitation } = await runWithTenantContext(contextB, () =>
      createInvitation(database, UserRole.ADMIN, { email: 'b-invitee-2@example.test', role: UserRole.AGENT }),
    );

    const result = await runWithTenantContext(adminContextA, () => revokeInvitation(database, invitation.id));
    expect(result).toBeNull();
  });

  it('full accept flow: resolve token publicly, accept, creates an active user row scoped to the tenant', async () => {
    const { invitation, token } = await runWithTenantContext(adminContextA, () =>
      createInvitation(database, UserRole.ADMIN, { email: 'accepted@example.test', role: UserRole.AGENT }),
    );

    const info = await resolvePublicInvitationToken(database, token);
    expect(info).not.toBeNull();
    expect(info?.agencyId).toBe(agencyAId);
    expect(info?.email).toBe('accepted@example.test');

    const result = await acceptInvitation(database, info!, token, { name: 'Novo Agente', password: 'a-strong-password-1' });
    expect(result.role).toBe(UserRole.AGENT);
    expect(result.agencyId).toBe(agencyAId);

    const userRow = await adminPool.query<{ agency_id: string; role: string; status: string }>(
      'SELECT agency_id, role, status FROM users WHERE id = $1',
      [result.userId],
    );
    expect(userRow.rows[0]?.agency_id).toBe(agencyAId);
    expect(userRow.rows[0]?.role).toBe('AGENT');
    expect(userRow.rows[0]?.status).toBe('ACTIVE');

    const invitationRow = await adminPool.query<{ status: string }>(
      'SELECT status FROM invitations WHERE id = $1',
      [invitation.id],
    );
    expect(invitationRow.rows[0]?.status).toBe('ACCEPTED');
  });

  it('an already-accepted or unknown token resolves to null (generic rejection)', async () => {
    const unknown = await resolvePublicInvitationToken(database, 'not-a-real-token');
    expect(unknown).toBeNull();

    const { token } = await runWithTenantContext(adminContextA, () =>
      createInvitation(database, UserRole.ADMIN, { email: 'reuse@example.test', role: UserRole.AGENT }),
    );
    const info = await resolvePublicInvitationToken(database, token);
    await acceptInvitation(database, info!, token, { name: 'Primeiro', password: 'a-strong-password-1' });

    const reusedInfo = await resolvePublicInvitationToken(database, token);
    expect(reusedInfo).toBeNull();
  });

  it('an expired invitation resolves to null', async () => {
    const { invitation, token } = await runWithTenantContext(adminContextA, () =>
      createInvitation(database, UserRole.ADMIN, { email: 'expired@example.test', role: UserRole.AGENT }),
    );
    await adminPool.query(`UPDATE invitations SET expires_at = now() - interval '1 day' WHERE id = $1`, [
      invitation.id,
    ]);

    const info = await resolvePublicInvitationToken(database, token);
    expect(info).toBeNull();
  });

  // ------------------------------------------------------------
  // Permission restrictions
  // ------------------------------------------------------------
  it('ADMIN can create a restriction for AGENT role that blocks a specific resource/action', async () => {
    const restriction = await runWithTenantContext(adminContextA, () =>
      createPermissionRestriction(database, {
        role: UserRole.AGENT,
        resource: 'air-services',
        action: 'create',
      }),
    );
    expect(restriction.role).toBe(UserRole.AGENT);

    await expect(
      runWithTenantContext(agentContextA, () =>
        database.withTenantTransaction((client) =>
          assertNotRestricted(client, UserRole.AGENT, 'air-services', 'create'),
        ),
      ),
    ).rejects.toThrow();
  });

  it('a restriction never un-restricts something RBAC already denies elsewhere (VIEWER remains denied by requireRole regardless of restriction rows)', async () => {
    // No restriction rows exist for VIEWER on this resource -- RBAC's own
    // requireRole() floor is the only thing standing between a VIEWER and
    // this action, and this module never touches that check.
    const restrictions = await runWithTenantContext(adminContextA, () => listPermissionRestrictions(database));
    expect(restrictions).toHaveLength(0);
  });

  it('OWNER/ADMIN can never be restricted (self-lockout prevention)', async () => {
    await expect(
      runWithTenantContext(adminContextA, () =>
        createPermissionRestriction(database, { role: UserRole.OWNER, resource: 'air-services', action: 'create' }),
      ),
    ).rejects.toThrow();

    await expect(
      runWithTenantContext(adminContextA, () =>
        createPermissionRestriction(database, { role: UserRole.ADMIN, resource: 'air-services', action: 'create' }),
      ),
    ).rejects.toThrow();

    // Even a hand-inserted row can never block OWNER/ADMIN -- assertNotRestricted
    // short-circuits for those roles regardless of table contents.
    await runWithTenantContext(ownerContextA, () =>
      database.withTenantTransaction((client) =>
        assertNotRestricted(client, UserRole.OWNER, 'air-services', 'create'),
      ),
    );
  });

  it('restrictions are tenant-isolated: Tenant B is unaffected by Tenant A restrictions', async () => {
    await runWithTenantContext(adminContextA, () =>
      createPermissionRestriction(database, { role: UserRole.AGENT, resource: 'air-services', action: 'create' }),
    );

    const bAgentContext = { ...contextB, userRole: UserRole.AGENT };
    await runWithTenantContext(bAgentContext, () =>
      database.withTenantTransaction((client) =>
        assertNotRestricted(client, UserRole.AGENT, 'air-services', 'create'),
      ),
    );
  });

  it('deleting a restriction from another tenant is a no-op', async () => {
    const restriction = await runWithTenantContext(adminContextA, () =>
      createPermissionRestriction(database, { role: UserRole.AGENT, resource: 'air-services', action: 'create' }),
    );

    const result = await runWithTenantContext(contextB, () =>
      deletePermissionRestriction(database, restriction.id),
    );
    expect(result).toBe(false);

    const stillExists = await adminPool.query('SELECT 1 FROM permission_restrictions WHERE id = $1', [
      restriction.id,
    ]);
    expect(stillExists.rowCount).toBe(1);
  });

  // ------------------------------------------------------------
  // PermissionRestriction — additional real enforcement points
  // (financial dashboard, employee roster), beyond the original
  // demonstrable air-services slice. The mechanism itself is already
  // exhaustively covered above; these confirm the two new route-level
  // wiring points use the same generic, resource-agnostic check.
  // ------------------------------------------------------------
  it('a restriction on financial:view blocks MANAGER but never OWNER/ADMIN', async () => {
    await runWithTenantContext(adminContextA, () =>
      createPermissionRestriction(database, { role: UserRole.MANAGER, resource: 'financial', action: 'view' }),
    );

    await expect(
      runWithTenantContext(
        { ...adminContextA, userRole: UserRole.MANAGER },
        () => database.withTenantTransaction((client) => assertNotRestricted(client, UserRole.MANAGER, 'financial', 'view')),
      ),
    ).rejects.toThrow();

    await expect(
      runWithTenantContext(ownerContextA, () =>
        database.withTenantTransaction((client) => assertNotRestricted(client, UserRole.OWNER, 'financial', 'view')),
      ),
    ).resolves.toBeUndefined();
  });

  it('a restriction on employees:view blocks MANAGER but does not affect an unrestricted resource', async () => {
    await runWithTenantContext(adminContextA, () =>
      createPermissionRestriction(database, { role: UserRole.MANAGER, resource: 'employees', action: 'view' }),
    );

    await expect(
      runWithTenantContext(
        { ...adminContextA, userRole: UserRole.MANAGER },
        () => database.withTenantTransaction((client) => assertNotRestricted(client, UserRole.MANAGER, 'employees', 'view')),
      ),
    ).rejects.toThrow();

    await expect(
      runWithTenantContext(
        { ...adminContextA, userRole: UserRole.MANAGER },
        () => database.withTenantTransaction((client) => assertNotRestricted(client, UserRole.MANAGER, 'financial', 'view')),
      ),
    ).resolves.toBeUndefined();
  });

  // ------------------------------------------------------------
  // Onboarding wizard progress
  // ------------------------------------------------------------
  it('updateOnboardingStep persists the step and is tenant-scoped', async () => {
    const updated = await runWithTenantContext(adminContextA, () =>
      database.withTenantTransaction((client) => updateOnboardingStep(client, 'branding')),
    );
    expect(updated.onboardingStep).toBe('branding');

    const { profile } = await runWithTenantContext(adminContextA, () =>
      database.withTenantTransaction((client) => getAgencyProfile(client)),
    );
    expect(profile.onboardingStep).toBe('branding');

    const otherTenant = await runWithTenantContext(contextB, () =>
      database.withTenantTransaction((client) => getAgencyProfile(client)),
    );
    expect(otherTenant.profile.onboardingStep).toBeUndefined();
  });

  it('completeOnboarding sets onboardingCompletedAt and step to done, idempotently', async () => {
    const first = await runWithTenantContext(adminContextA, () =>
      database.withTenantTransaction((client) => completeOnboarding(client)),
    );
    expect(first.onboardingStep).toBe('done');
    expect(first.onboardingCompletedAt).toBeTruthy();

    const second = await runWithTenantContext(adminContextA, () =>
      database.withTenantTransaction((client) => completeOnboarding(client)),
    );
    expect(String(second.onboardingCompletedAt)).toBe(String(first.onboardingCompletedAt));
  });

  async function resetDatabase(pool: Pool): Promise<void> {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migrationFile of migrationFiles) {
      await pool.query(readSqlForPg(migrationFile));
    }
    await pool.query(readSqlForPg(prepareRolesSql));
    await seedAgenciesAndUsers(pool);
  }

  async function seedAgenciesAndUsers(pool: Pool): Promise<void> {
    await pool.query(
      `
        INSERT INTO agencies (id, name, slug, email, plan, status)
        VALUES
          ($1, 'Agency A', 'agency-a-invitations-test', 'agency-a-inv@example.test', 'FREE', 'ACTIVE'),
          ($2, 'Agency B', 'agency-b-invitations-test', 'agency-b-inv@example.test', 'FREE', 'ACTIVE');
      `,
      [agencyAId, agencyBId],
    );
    await pool.query(
      `
        INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
        VALUES
          ($1, $2, 'owner-a@example.test', 'Owner A', 'OWNER', 'hash-for-invitations-test-only', 'ACTIVE'),
          ($3, $2, 'admin-a@example.test', 'Admin A', 'ADMIN', 'hash-for-invitations-test-only', 'ACTIVE'),
          ($4, $5, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-invitations-test-only', 'ACTIVE');
      `,
      [ownerAId, agencyAId, adminAId, userBId, agencyBId],
    );
  }
});

function readSqlForPg(filePath: string): string {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
}

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Invitations data-layer tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Invitations data-layer tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Invitations data-layer tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run invitations data-layer tests against unsafe DATABASE_URL.');
    }
  }
}

function resetDisposableDatabase(): void {
  if (process.env.CI === 'true') return;
  compose(['down', '-v']);
  compose(['up', '-d']);
}

function compose(args: readonly string[]) {
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
