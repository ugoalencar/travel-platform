import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  updateAgencyBranding,
  updateAgencyProfile,
  getAgencyProfile,
} from '../src/settings-queries';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration049 = resolve(
  repoRoot,
  'infrastructure/migrations/050_agency_branding_departments.sql',
);
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-departments-postgres';
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

const contextA = {
  agencyId: agencyAId,
  userId: userAId,
  userRole: UserRole.ADMIN,
  email: 'user-a@example.test',
};
const contextB = {
  agencyId: agencyBId,
  userId: userBId,
  userRole: UserRole.ADMIN,
  email: 'user-b@example.test',
};

describe('Departments + Agency Branding data-access layer (Agent 01 SaaS Admin)', () => {
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
    await adminPool.query('TRUNCATE TABLE departments RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('fails closed with no tenant context established', async () => {
    await expect(database.withTenantTransaction((client) => listDepartments(client))).rejects.toThrow();
    await expect(
      database.withTenantTransaction((client) => createDepartment(client, { name: 'X' })),
    ).rejects.toThrow();
  });

  it('listDepartments returns only Agency A departments', async () => {
    await seedDepartment(agencyAId, 'Vendas A');
    await seedDepartment(agencyBId, 'Vendas B');

    const result = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) => listDepartments(client)),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Vendas A');
  });

  it('listDepartments returns only Agency B departments', async () => {
    await seedDepartment(agencyAId, 'Vendas A');
    await seedDepartment(agencyBId, 'Vendas B');

    const result = await runWithTenantContext(contextB, () =>
      database.withTenantTransaction((client) => listDepartments(client)),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Vendas B');
  });

  it('createDepartment writes the row under the current tenant only, tenant B cannot see it', async () => {
    const created = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) => createDepartment(client, { name: 'Operações' })),
    );
    expect(created.name).toBe('Operações');

    const fromB = await runWithTenantContext(contextB, () =>
      database.withTenantTransaction((client) => listDepartments(client)),
    );
    expect(fromB).toHaveLength(0);
  });

  it('updateDepartment on another tenant department id is a no-op (returns null)', async () => {
    const bId = await seedDepartment(agencyBId, 'Financeiro B');

    const result = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        updateDepartment(client, bId, { name: 'Hacked' }),
      ),
    );

    expect(result).toBeNull();

    const stillOriginal = await adminPool.query<{ name: string }>(
      'SELECT name FROM departments WHERE id = $1',
      [bId],
    );
    expect(stillOriginal.rows[0]?.name).toBe('Financeiro B');
  });

  it('deleteDepartment on another tenant department id is a no-op (returns false)', async () => {
    const bId = await seedDepartment(agencyBId, 'Marketing B');

    const result = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) => deleteDepartment(client, bId)),
    );

    expect(result).toBe(false);

    const stillExists = await adminPool.query('SELECT 1 FROM departments WHERE id = $1', [bId]);
    expect(stillExists.rowCount).toBe(1);
  });

  it('rejects duplicate department name within same tenant, allows same name in different tenant', async () => {
    await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) => createDepartment(client, { name: 'Suporte' })),
    );

    await expect(
      runWithTenantContext(contextA, () =>
        database.withTenantTransaction((client) => createDepartment(client, { name: 'Suporte' })),
      ),
    ).rejects.toThrow();

    await expect(
      runWithTenantContext(contextB, () =>
        database.withTenantTransaction((client) => createDepartment(client, { name: 'Suporte' })),
      ),
    ).resolves.toMatchObject({ name: 'Suporte' });
  });

  it('updateAgencyBranding persists branding fields for the current tenant only', async () => {
    const updated = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        updateAgencyBranding(client, {
          displayName: 'Agência A Turismo',
          logoUrl: 'https://cdn.example.test/logo-a.png',
          primaryColor: '#1A2B3C',
        }),
      ),
    );

    expect(updated.displayName).toBe('Agência A Turismo');
    expect(updated.logoUrl).toBe('https://cdn.example.test/logo-a.png');
    expect(updated.primaryColor).toBe('#1A2B3C');

    const bProfile = await runWithTenantContext(contextB, () =>
      database.withTenantTransaction((client) => getAgencyProfile(client)),
    );
    expect(bProfile.profile.displayName).toBeUndefined();
  });

  it('rejects an invalid primaryColor', async () => {
    await expect(
      runWithTenantContext(contextA, () =>
        database.withTenantTransaction((client) =>
          updateAgencyBranding(client, { primaryColor: 'not-a-color' }),
        ),
      ),
    ).rejects.toThrow();
  });

  it('updateAgencyProfile persists name/email/phone for the current tenant only', async () => {
    const updated = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        updateAgencyProfile(client, {
          name: 'Agência A Ltda',
          email: 'contato@agencia-a.test',
          phone: '+55 11 90000-0000',
        }),
      ),
    );

    expect(updated.name).toBe('Agência A Ltda');
    expect(updated.email).toBe('contato@agencia-a.test');
    expect(updated.phone).toBe('+55 11 90000-0000');

    const bProfile = await runWithTenantContext(contextB, () =>
      database.withTenantTransaction((client) => getAgencyProfile(client)),
    );
    expect(bProfile.profile.name).not.toBe('Agência A Ltda');
  });

  it('rejects an empty name', async () => {
    await expect(
      runWithTenantContext(contextA, () =>
        database.withTenantTransaction((client) => updateAgencyProfile(client, { name: '   ' })),
      ),
    ).rejects.toThrow();
  });

  async function seedDepartment(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO departments (agency_id, name) VALUES ($1, $2) RETURNING id`,
      [agencyId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed department');
    }
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Departments data-layer tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Departments data-layer tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Departments data-layer tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run departments data-layer tests against unsafe DATABASE_URL.');
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

async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.query(readSqlForPg(migration001));
  await pool.query(readSqlForPg(migration002));
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
        ($1, 'Agency A', 'agency-a-departments-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-departments-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-departments-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-departments-test-only', 'ACTIVE');
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
