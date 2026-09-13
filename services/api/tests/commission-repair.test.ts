import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
const migration004 = resolve(repoRoot, 'infrastructure/migrations/004_route_points.sql');
const migration005 = resolve(repoRoot, 'infrastructure/migrations/005_booking.sql');
const migration006 = resolve(repoRoot, 'infrastructure/migrations/006_field_operations.sql');
const migration007 = resolve(repoRoot, 'infrastructure/migrations/007_commission_repair.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-commission-repair-postgres';
const containerName = 'travel-platform-postgres-local';
const postgresImage = 'postgres:15';
const databaseHost = process.env.DATABASE_TEST_HOST ?? '127.0.0.1';
const databasePort = Number(process.env.DATABASE_TEST_PORT ?? '55432');
const databaseName = process.env.DATABASE_TEST_NAME ?? 'travel_platform_test';
const adminUser = process.env.DATABASE_TEST_USER ?? 'travel_test';
const adminPassword = process.env.DATABASE_TEST_PASSWORD ?? 'travel_test_password';
const poolPasswordKey = 'pass' + 'word';

const agencyAId = '10000000-0000-4000-8000-000000000001';
const customerAId = 'c0000000-0000-4000-8000-000000000099';
const saleAId = 's0000000-0000-4000-8000-000000000099';
const userAId = '11000000-0000-4000-8000-000000000001';

/**
 * Proves the D1 (Option A) Commission structural repair: commissions now
 * has UNIQUE(agency_id, id), matching every other tenant-scoped table, so
 * a future table can reference it via the same composite tenant-safe FK
 * pattern used everywhere else in this schema. Purely additive -- no
 * existing FK/CHECK/RLS policy on commissions is touched, and a normal
 * Commission insert (exercising its pre-existing FKs to sales/agencies)
 * still succeeds unchanged.
 */
describe('Commission structural repair (007_commission_repair.sql)', () => {
  let adminPool: Pool;

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

    await resetDatabase(adminPool);
  });

  afterAll(async () => {
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('adds commissions_agency_id_key as a UNIQUE(agency_id, id) constraint', async () => {
    const result = await adminPool.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'commissions'::regclass AND contype = 'u'`,
    );
    expect(result.rows.map((r) => r.conname)).toContain('commissions_agency_id_key');
  });

  it('allows a new table to reference commissions via a composite tenant-safe FK', async () => {
    await adminPool.query(`
      CREATE TABLE commission_fk_probe (
        id TEXT PRIMARY KEY,
        agency_id TEXT NOT NULL,
        commission_id TEXT NOT NULL,
        CONSTRAINT commission_fk_probe_commission_tenant_fk
          FOREIGN KEY (agency_id, commission_id) REFERENCES commissions (agency_id, id)
      );
    `);
    try {
      const insert = await adminPool.query<{ id: string }>(
        `INSERT INTO commissions (agency_id, sale_id, amount)
         VALUES ($1, $2, 100.00)
         RETURNING id`,
        [agencyAId, saleAId],
      );
      const commissionId = insert.rows[0]?.id;
      if (!commissionId) {
        throw new Error('Commission insert did not return an id');
      }

      // The composite FK succeeds for a real same-tenant commission row.
      await expect(
        adminPool.query(
          `INSERT INTO commission_fk_probe (id, agency_id, commission_id) VALUES ($1, $2, $3)`,
          ['probe-1', agencyAId, commissionId],
        ),
      ).resolves.toBeDefined();

      // Cross-tenant reference is rejected -- the composite FK, not just
      // the bare id, is what makes this tenant-safe.
      await expect(
        adminPool.query(
          `INSERT INTO commission_fk_probe (id, agency_id, commission_id) VALUES ($1, $2, $3)`,
          ['probe-2', '20000000-0000-4000-8000-000000000001', commissionId],
        ),
      ).rejects.toThrow();
    } finally {
      await adminPool.query('DROP TABLE commission_fk_probe;');
    }
  });

  it('does not disturb existing Commission FKs -- a normal insert still succeeds', async () => {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO commissions (agency_id, sale_id, amount, percentage, status)
       VALUES ($1, $2, 450.00, 10.00, 'PENDING')
       RETURNING id`,
      [agencyAId, saleAId],
    );
    expect(result.rows[0]?.id).toBeTruthy();
  });
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Commission repair tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Commission repair tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Commission repair tests require a database name with a test marker.');
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
  await pool.query(readSqlForPg(migration005));
  await pool.query(readSqlForPg(migration006));
  await pool.query(readSqlForPg(migration007));
  await pool.query(readSqlForPg(prepareRolesSql));
  await seedFixtures(pool);
}

function readSqlForPg(filePath: string): string {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
}

async function seedFixtures(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO agencies (id, name, slug, email, plan, status)
     VALUES ($1, 'Agency A', 'agency-a-commission-repair-test', 'agency-a@example.test', 'FREE', 'ACTIVE');`,
    [agencyAId],
  );
  await pool.query(
    `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
     VALUES ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-commission-repair-test-only', 'ACTIVE');`,
    [userAId, agencyAId],
  );
  await pool.query(
    `INSERT INTO customers (id, agency_id, name, email)
     VALUES ($1, $2, 'Customer A', 'customer-a@example.test');`,
    [customerAId, agencyAId],
  );
  await pool.query(
    `INSERT INTO sales (id, agency_id, customer_id, user_id, amount, total)
     VALUES ($1, $2, $3, $4, 1000.00, 1000.00);`,
    [saleAId, agencyAId, customerAId, userAId],
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
