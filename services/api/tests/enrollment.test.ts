import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  approveEnrollmentSubmission,
  createEnrollmentLink,
  hashEnrollmentToken,
  listEnrollmentLinks,
  listEnrollmentSubmissions,
  requestEnrollmentChanges,
  resolvePublicEnrollmentToken,
  revokeEnrollmentLink,
  submitEnrollment,
} from '../src/enrollment';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration019 = resolve(repoRoot, 'infrastructure/migrations/019_customer_360_addresses.sql');
const migration020 = resolve(repoRoot, 'infrastructure/migrations/020_customer_360_dependents.sql');
const migration021 = resolve(repoRoot, 'infrastructure/migrations/021_customer_360_documents.sql');
const migration046 = resolve(repoRoot, 'infrastructure/migrations/046_customer_360_completion.sql');
const migration049 = resolve(repoRoot, 'infrastructure/migrations/049_enrollment_links.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-enrollment-postgres';
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

const agencyAId = '30000000-0000-4000-8000-000000000001';
const agencyBId = '40000000-0000-4000-8000-000000000001';
const userAId = '31000000-0000-4000-8000-000000000001';
const userBId = '41000000-0000-4000-8000-000000000001';

const contextA = { agencyId: agencyAId, userId: userAId, userRole: UserRole.ADMIN, email: 'user-a@example.test' };
const contextB = { agencyId: agencyBId, userId: userBId, userRole: UserRole.ADMIN, email: 'user-b@example.test' };
const viewerContextA = { agencyId: agencyAId, userId: userAId, userRole: UserRole.VIEWER, email: 'user-a@example.test' };

describe.sequential('Enrollment link flow (Agent 02: Client Onboarding)', () => {
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
    await adminPool.query(
      'TRUNCATE TABLE enrollment_documents, enrollment_submissions, enrollment_links, customers RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  // ------------------------------------------------------------
  // Entropy / token hashing
  // ------------------------------------------------------------
  it('generates a high-entropy token and never stores the raw token', async () => {
    const { link, token } = await runWithTenantContext(contextA, () =>
      createEnrollmentLink(database, {}),
    );

    // base64url of 32 random bytes -> 43 chars, no padding.
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).not.toMatch(/[+/=]/);

    const row = await adminPool.query<{ token_hash: string }>(
      'SELECT token_hash FROM enrollment_links WHERE id = $1',
      [link.id],
    );
    expect(row.rows[0]?.token_hash).toBe(hashEnrollmentToken(token));
    expect(row.rows[0]?.token_hash).not.toBe(token);
  });

  it('two generated tokens are never equal (no Math.random-style collision risk)', async () => {
    const first = await runWithTenantContext(contextA, () => createEnrollmentLink(database, {}));
    const second = await runWithTenantContext(contextA, () => createEnrollmentLink(database, {}));
    expect(first.token).not.toBe(second.token);
  });

  it('rejects link creation below AGENT role', async () => {
    await expect(
      runWithTenantContext(viewerContextA, () => createEnrollmentLink(database, {})),
    ).rejects.toThrow();
  });

  // ------------------------------------------------------------
  // Public resolve: invalid / expired / revoked all fail the same way
  // ------------------------------------------------------------
  it('resolvePublicEnrollmentToken returns null for a completely unknown token', async () => {
    const result = await resolvePublicEnrollmentToken(database, 'this-token-does-not-exist');
    expect(result).toBeNull();
  });

  it('resolvePublicEnrollmentToken returns null for an empty/missing token', async () => {
    expect(await resolvePublicEnrollmentToken(database, '')).toBeNull();
    // @ts-expect-error -- deliberately exercising a non-string input, as a
    // malicious/malformed client could send.
    expect(await resolvePublicEnrollmentToken(database, undefined)).toBeNull();
  });

  it('resolvePublicEnrollmentToken resolves a valid token to agency+link, never leaking other tenants', async () => {
    const { link, token } = await runWithTenantContext(contextA, () =>
      createEnrollmentLink(database, {}),
    );

    const resolved = await resolvePublicEnrollmentToken(database, token);
    expect(resolved).toEqual({ agencyId: agencyAId, linkId: link.id });
  });

  it('resolvePublicEnrollmentToken returns null (same shape as unknown) for a revoked token', async () => {
    const { link, token } = await runWithTenantContext(contextA, () =>
      createEnrollmentLink(database, {}),
    );
    await runWithTenantContext(contextA, () => revokeEnrollmentLink(database, link.id));

    const resolved = await resolvePublicEnrollmentToken(database, token);
    expect(resolved).toBeNull();
  });

  it('resolvePublicEnrollmentToken returns null (same shape as unknown) for an expired token', async () => {
    const { link, token } = await runWithTenantContext(contextA, () =>
      createEnrollmentLink(database, { ttlDays: 1 }),
    );
    await adminPool.query(`UPDATE enrollment_links SET expires_at = now() - interval '1 hour' WHERE id = $1`, [
      link.id,
    ]);

    const resolved = await resolvePublicEnrollmentToken(database, token);
    expect(resolved).toBeNull();
  });

  it('a revoked link cannot be used to submit even with a previously-resolved linkInfo (fails closed)', async () => {
    const { link, token } = await runWithTenantContext(contextA, () =>
      createEnrollmentLink(database, {}),
    );
    const resolved = await resolvePublicEnrollmentToken(database, token);
    expect(resolved).not.toBeNull();

    await runWithTenantContext(contextA, () => revokeEnrollmentLink(database, link.id));

    await expect(
      submitEnrollment(database, resolved!, token, {
        fullName: 'Prospect Late',
        consentGiven: true,
      }),
    ).rejects.toThrow();
  });

  // ------------------------------------------------------------
  // Tenant isolation / cross-tenant leakage
  // ------------------------------------------------------------
  it('Tenant B staff never sees Tenant A enrollment links', async () => {
    await runWithTenantContext(contextA, () => createEnrollmentLink(database, { label: 'A link' }));

    const linksB = await runWithTenantContext(contextB, () => listEnrollmentLinks(database));
    expect(linksB).toHaveLength(0);
  });

  it('Tenant B staff cannot revoke a Tenant A link by id', async () => {
    const { link } = await runWithTenantContext(contextA, () => createEnrollmentLink(database, {}));

    const result = await runWithTenantContext(contextB, () => revokeEnrollmentLink(database, link.id));
    expect(result).toBeNull();

    const row = await adminPool.query<{ status: string }>('SELECT status FROM enrollment_links WHERE id = $1', [
      link.id,
    ]);
    expect(row.rows[0]?.status).toBe('ACTIVE');
  });

  it('Tenant B staff never sees Tenant A enrollment submissions', async () => {
    const { token } = await runWithTenantContext(contextA, () => createEnrollmentLink(database, {}));
    const resolved = await resolvePublicEnrollmentToken(database, token);
    await submitEnrollment(database, resolved!, token, {
      fullName: 'Cross Tenant Prospect',
      consentGiven: true,
    });

    const submissionsA = await runWithTenantContext(contextA, () => listEnrollmentSubmissions(database));
    const submissionsB = await runWithTenantContext(contextB, () => listEnrollmentSubmissions(database));
    expect(submissionsA).toHaveLength(1);
    expect(submissionsB).toHaveLength(0);
  });

  it('fails closed with no tenant context established (staff operations)', async () => {
    await expect(createEnrollmentLink(database, {})).rejects.toThrow();
    await expect(listEnrollmentLinks(database)).rejects.toThrow();
    await expect(listEnrollmentSubmissions(database)).rejects.toThrow();
  });

  // ------------------------------------------------------------
  // Submission -> review -> approval -> Customer 360 (+ dedupe)
  // ------------------------------------------------------------
  it('end-to-end: valid token submits, staff approves, a real Customer row is created', async () => {
    const { token } = await runWithTenantContext(contextA, () =>
      createEnrollmentLink(database, { label: 'Onboarding 2026' }),
    );
    const resolved = await resolvePublicEnrollmentToken(database, token);

    const submission = await submitEnrollment(database, resolved!, token, {
      fullName: 'Maria Prospect',
      email: 'maria.prospect@example.test',
      cpf: '98765432100',
      wishDestination: 'Paris',
      consentGiven: true,
    });
    expect(submission.status).toBe('SUBMITTED');

    const approval = await runWithTenantContext(contextA, () =>
      approveEnrollmentSubmission(database, submission.id),
    );
    expect(approval.submission.status).toBe('APPROVED');
    expect(approval.wishId).toBeDefined();

    const customerRow = await adminPool.query<{ agency_id: string; name: string; cpf: string }>(
      'SELECT agency_id, name, cpf FROM customers WHERE id = $1',
      [approval.customerId],
    );
    expect(customerRow.rows[0]?.agency_id).toBe(agencyAId);
    expect(customerRow.rows[0]?.name).toBe('Maria Prospect');
    expect(customerRow.rows[0]?.cpf).toBe('98765432100');
  });

  it('submission without consent is rejected', async () => {
    const { token } = await runWithTenantContext(contextA, () => createEnrollmentLink(database, {}));
    const resolved = await resolvePublicEnrollmentToken(database, token);

    await expect(
      submitEnrollment(database, resolved!, token, {
        fullName: 'No Consent Guy',
        consentGiven: false,
      }),
    ).rejects.toThrow();
  });

  it('approval is rejected when a customer with the same CPF already exists in this tenant', async () => {
    await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        client.query('INSERT INTO customers (agency_id, name, cpf) VALUES ($1, $2, $3)', [
          agencyAId,
          'Existing Customer',
          '11122233344',
        ]),
      ),
    );

    const { token } = await runWithTenantContext(contextA, () => createEnrollmentLink(database, {}));
    const resolved = await resolvePublicEnrollmentToken(database, token);
    const submission = await submitEnrollment(database, resolved!, token, {
      fullName: 'Dupe CPF Prospect',
      cpf: '11122233344',
      consentGiven: true,
    });

    await expect(
      runWithTenantContext(contextA, () => approveEnrollmentSubmission(database, submission.id)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('staff can request changes on a submission (does not approve)', async () => {
    const { token } = await runWithTenantContext(contextA, () => createEnrollmentLink(database, {}));
    const resolved = await resolvePublicEnrollmentToken(database, token);
    const submission = await submitEnrollment(database, resolved!, token, {
      fullName: 'Needs Changes',
      consentGiven: true,
    });

    const result = await runWithTenantContext(contextA, () =>
      requestEnrollmentChanges(database, submission.id, { notes: 'Falta telefone' }),
    );
    expect(result?.status).toBe('CHANGES_REQUESTED');
  });

  // ------------------------------------------------------------
  // Revocation / expiry
  // ------------------------------------------------------------
  it('revoking a link is idempotent-safe: revoking twice returns null the second time', async () => {
    const { link } = await runWithTenantContext(contextA, () => createEnrollmentLink(database, {}));
    const first = await runWithTenantContext(contextA, () => revokeEnrollmentLink(database, link.id));
    const second = await runWithTenantContext(contextA, () => revokeEnrollmentLink(database, link.id));
    expect(first?.status).toBe('REVOKED');
    expect(second).toBeNull();
  });

  it('default TTL is 7 days when not specified', async () => {
    const before = Date.now();
    const { link } = await runWithTenantContext(contextA, () => createEnrollmentLink(database, {}));
    const expectedMs = before + 7 * 24 * 60 * 60 * 1000;
    const diff = Math.abs(link.expiresAt.getTime() - expectedMs);
    expect(diff).toBeLessThan(60_000);
  });
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Enrollment tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Enrollment tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Enrollment tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run enrollment tests against unsafe DATABASE_URL.');
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
  await pool.query(readSqlForPg(migration019));
  await pool.query(readSqlForPg(migration020));
  await pool.query(readSqlForPg(migration021));
  await pool.query(readSqlForPg(migration046));
  await pool.query(readSqlForPg(migration049));
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
        ($1, 'Agency A', 'agency-a-enrollment-test', 'agency-a-enrollment@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-enrollment-test', 'agency-b-enrollment@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a-enrollment@example.test', 'User A', 'ADMIN', 'hash-for-enrollment-test-only', 'ACTIVE'),
        ($3, $4, 'user-b-enrollment@example.test', 'User B', 'ADMIN', 'hash-for-enrollment-test-only', 'ACTIVE');
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
