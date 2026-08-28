import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '../../..');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const constraintsTestSql = resolve(repoRoot, 'tests/integration/database/001_constraints_test.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const rlsRuntimeTestSql = resolve(repoRoot, 'tests/integration/database/003_rls_runtime_test.sql');

const projectName = 'travel-platform-local-postgres';
const containerName = 'travel-platform-postgres-local';
const postgresImage = 'postgres:15';
const testMode = process.env.DATABASE_TEST_MODE ?? 'local';
const isCiMode = testMode === 'ci';
const adminUser = process.env.DATABASE_TEST_USER ?? 'travel_test';
const adminPassword = process.env.DATABASE_TEST_PASSWORD ?? 'travel_test_password';
const databaseName = process.env.DATABASE_TEST_NAME ?? 'travel_platform_test';
const runtimeUser = 'travel_app_runtime_local';
const runtimePassword = 'travel_app_runtime_local_password';
const localHost = process.env.DATABASE_TEST_HOST ?? '127.0.0.1';
const localPort = process.env.DATABASE_TEST_PORT ?? (isCiMode ? '5432' : '55432');

const expectedTables = [
  'agencies',
  'agency_entitlements',
  'assets',
  'audit_logs',
  'automation_executions',
  'automations',
  'booking_passengers',
  'bookings',
  'brokers',
  'campaign_offers',
  'campaigns',
  'commercial_opportunities',
  'commercial_tasks',
  'commissions',
  'connector_actions',
  'coupon_grants',
  'coupon_redemptions',
  'coupons',
  'customer_accounts',
  'customer_interactions',
  'customers',
  'engagements',
  'external_offer_captures',
  'offer_growth_audit_log',
  'offers',
  'operation_assignments',
  'operation_checkpoints',
  'operational_costs',
  'operational_staff',
  'operational_staff_capabilities',
  'payables',
  'payment_allocations',
  'payments',
  'pipeline_access',
  'pipeline_stages',
  'pipelines',
  'proposals',
  'publications',
  'receivables',
  'route_points',
  'routes',
  'sales',
  'scheduled_departures',
  'suppliers',
  'transport_operations',
  'transport_products',
  'trips',
  'users',
  'wishes',
];

interface CommandResult {
  stdout: string;
  stderr: string;
}

describe.sequential('database integration migrations and RLS', () => {
  beforeAll(async () => {
    assertSafeTestDatabase();
    if (isCiMode) {
      await waitForPostgresConnection();
    } else {
      resetDisposableDatabase();
      await waitForHealthyContainer();
      assertContainerIsLocal();
    }
  });

  afterAll(() => {
    assertSafeTestDatabase();
    if (!isCiMode) {
      compose(['down', '-v']);
    }
  });

  it('applies every ordered migration to an empty local database', () => {
    const result = psqlAdmin(readAllMigrations());

    expect(result.stdout).toContain('CREATE TABLE');
    expect(result.stdout).toContain('CREATE POLICY');
    expect(result.stderr).not.toContain('ERROR');
  });

  it('creates exactly the current migrated domain tables', () => {
    const tables = queryAdminLines(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;",
    );

    expect(tables).toEqual(expectedTables);
  });

  it('validates constraints, soft delete, tenant-safe FKs, CustomerAccount, and Proposal snapshot', () => {
    const result = psqlAdmin(readSql(constraintsTestSql));

    expect(result.stdout).toContain('Wish travelers_count = 0');
    expect(result.stdout).toContain('Customer CPF/email reuse after soft delete');
    expect(result.stdout).toContain('Customer can exist without CustomerAccount');
    expect(result.stdout).toContain('CustomerAccount duplicate Customer A');
    expect(result.stdout).toContain('Proposal Agency A -> Customer B');
    expect(result.stdout).toContain('Proposal Agency A -> Offer B');
    expect(result.stdout).toContain('Sale Agency A -> Proposal B');
    expect(result.stdout).toContain('Trip Agency A -> Sale B');
    expect(result.stdout).toContain('Proposal snapshot after Offer change');
    expect(result.stdout).toContain('(23 rows)');
    expect(result.stderr).not.toContain('ERROR');
  });

  it('prepares a non-superuser runtime role without BYPASSRLS', () => {
    const result = psqlAdmin(readSql(prepareRolesSql));

    expect(result.stdout).toContain(runtimeUser);
    expect(result.stdout).toContain(' f        | f            | f           | f');
    expect(result.stderr).not.toContain('ERROR');
  });

  it('seeds a second tenant audit event for runtime read-isolation validation', () => {
    const result = psqlAdmin(`
      INSERT INTO audit_logs
        (agency_id, actor_type, actor_id, event_type, entity_type, entity_id, outcome, metadata)
      VALUES
        ('20000000-0000-4000-8000-000000000001', 'USER',
         '21000000-0000-4000-8000-000000000001', 'PAYMENT_RECORDED',
         'payment', 'audit-payment-b', 'SUCCESS', '{}'::jsonb);
    `);

    expect(result.stderr).not.toContain('ERROR');
  });

  it('enforces RLS for SELECT, INSERT, UPDATE, DELETE, invalid tenants, and fail-closed access', () => {
    const result = psqlRuntime(readSql(rlsRuntimeTestSql));

    expect(result.stdout).toContain('RLS SELECT Customer A cannot see Customer B');
    expect(result.stdout).toContain('RLS INSERT Customer agency B while tenant A');
    expect(result.stdout).toContain('RLS UPDATE agency_id A to B');
    expect(result.stdout).toContain('RLS DELETE Customer B while tenant A');
    expect(result.stdout).toContain('RLS SELECT Audit Log B while tenant A');
    expect(result.stdout).toContain('RLS INSERT Audit Log agency B while tenant A');
    expect(result.stdout).toContain('Runtime cannot UPDATE Audit Log');
    expect(result.stdout).toContain('Runtime cannot DELETE Audit Log');
    expect(result.stdout).toContain('Fail closed SELECT without tenant');
    expect(result.stdout).toContain('Invalid tenant INSERT referencing real Customer A');
    expect(result.stdout).toContain('Runtime role rolsuper/rolbypassrls false');
    expect(result.stdout).toContain(
      'SEC-01 pool reuse: fresh transaction without context is fail-closed',
    );
    expect(result.stdout).toContain(
      'SEC-01 pool reuse: Agency A transaction sees only Agency A',
    );
    expect(result.stdout).toContain(
      'SEC-01 pool reuse: second reused transaction does not inherit Agency A',
    );
    expect(result.stdout).toContain(
      'SEC-01 pool reuse: Agency B transaction sees only Agency B, not Agency A',
    );
    expect(result.stdout).toContain(
      'SEC-01 pool reuse: third reused transaction does not inherit Agency B',
    );
    expect(result.stdout).toContain('(42 rows)');
    expect(result.stderr).not.toContain('ERROR');
  });

  it('keeps FORCE RLS enabled on every migrated tenant table', () => {
    const rows = queryAdminLines(`
      SELECT relname
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind = 'r'
        AND relname = ANY(ARRAY[${expectedTables.map((table) => `'${table}'`).join(', ')}])
        AND relrowsecurity = TRUE
        AND relforcerowsecurity = TRUE
      ORDER BY relname;
    `);

    expect(rows).toEqual(expectedTables);
  });

  it('keeps tenant context functions without SECURITY DEFINER', () => {
    const rows = queryAdminLines(`
      SELECT proname || ':' || prosecdef::TEXT
      FROM pg_proc
      JOIN pg_namespace n ON n.oid = pronamespace
      WHERE nspname = 'public'
        AND proname IN (
          'current_agency_id',
          'current_user_id',
          'set_tenant_context',
          'clear_tenant_context'
        )
      ORDER BY proname;
    `);

    expect(rows).toEqual([
      'clear_tenant_context:false',
      'current_agency_id:false',
      'current_user_id:false',
      'set_tenant_context:false',
    ]);
  });

  it('grants runtime role only the expected table and tenant function privileges', () => {
    const tableGrantCount = queryAdminScalar(`
      SELECT COUNT(*)
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND grantee = '${runtimeUser}'
        AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
    `);
    const functionGrants = queryAdminLines(`
      SELECT routine_name
      FROM information_schema.routine_privileges
      WHERE specific_schema = 'public'
        AND grantee = '${runtimeUser}'
      ORDER BY routine_name;
    `);

    expect(tableGrantCount).toBe(String((expectedTables.length - 1) * 4 + 2));
    expect(
      queryAdminLines(`
        SELECT privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND grantee = '${runtimeUser}'
          AND table_name = 'audit_logs'
        ORDER BY privilege_type;
      `),
    ).toEqual(['INSERT', 'SELECT']);
    expect(functionGrants).toEqual([
      'clear_tenant_context',
      'current_agency_id',
      'current_user_id',
      'set_tenant_context',
    ]);
  });
});

function assertSafeTestDatabase(): void {
  const forbiddenMarkers = ['production', 'prod', 'staging', 'stage'];
  const environmentValues = [
    process.env.NODE_ENV,
    process.env.APP_ENV,
    process.env.DATABASE_ENV,
    process.env.ENVIRONMENT,
  ];

  if (!['127.0.0.1', 'localhost'].includes(localHost)) {
    throw new Error('Database integration tests require localhost only.');
  }

  if (!['local', 'ci'].includes(testMode)) {
    throw new Error('DATABASE_TEST_MODE must be local or ci.');
  }

  if (isCiMode && process.env.GITHUB_ACTIONS !== 'true') {
    throw new Error('CI database mode is allowed only inside GitHub Actions.');
  }

  if (!isCiMode && localPort !== '55432') {
    throw new Error('Local database integration tests require the approved local port 55432.');
  }

  if (isCiMode && localPort !== '5432') {
    throw new Error('CI database integration tests require the PostgreSQL service port 5432.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Database integration tests require a database name with a test marker.');
  }

  if (environmentValues.some((value) => value && forbiddenMarkers.includes(value.toLowerCase()))) {
    throw new Error('Refusing to run database tests in production/staging-like environment.');
  }

  if (process.env.DATABASE_URL) {
    assertDatabaseUrlIsSafe(process.env.DATABASE_URL);
  }
}

function assertDatabaseUrlIsSafe(rawUrl: string): void {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('DATABASE_URL is present but cannot be parsed safely.');
  }

  const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
  const safeDatabase = url.pathname.replace('/', '').includes('test');
  const safePort = url.port === localPort || url.port === '';

  if (!safeHost || !safeDatabase || !safePort) {
    throw new Error('Refusing to run database tests while DATABASE_URL points outside the approved local test database.');
  }
}

function resetDisposableDatabase(): void {
  compose(['down', '-v']);
  compose(['up', '-d']);
}

function compose(args: readonly string[]): CommandResult {
  return run('docker', ['compose', '-f', composeFile, '-p', projectName, ...args]);
}

function psqlAdmin(sql: string): CommandResult {
  return runPsql(adminUser, adminPassword, sql);
}

function psqlRuntime(sql: string): CommandResult {
  return runPsql(runtimeUser, runtimePassword, sql);
}

function runPsql(user: string, password: string, sql: string): CommandResult {
  if (isCiMode) {
    return dockerRunPsql(user, password, sql);
  }

  return dockerExecPsql(user, password, sql);
}

function dockerExecPsql(user: string, password: string, sql: string): CommandResult {
  return run('docker', [
    'exec',
    '-i',
    '-e',
    `PGPASSWORD=${password}`,
    containerName,
    'psql',
    '-h',
    localHost,
    '-p',
    '5432',
    '-U',
    user,
    '-d',
    databaseName,
    '-v',
    'ON_ERROR_STOP=1',
  ], sql);
}

function dockerRunPsql(user: string, password: string, sql: string): CommandResult {
  return run('docker', [
    'run',
    '--rm',
    '-i',
    '--network',
    'host',
    '-e',
    `PGPASSWORD=${password}`,
    postgresImage,
    'psql',
    '-h',
    localHost,
    '-p',
    '5432',
    '-U',
    user,
    '-d',
    databaseName,
    '-v',
    'ON_ERROR_STOP=1',
  ], sql);
}

function queryAdminLines(sql: string): string[] {
  return queryAdmin(sql)
    .stdout.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function queryAdminScalar(sql: string): string {
  const lines = queryAdminLines(sql);
  expect(lines).toHaveLength(1);
  return lines[0] ?? '';
}

function queryAdmin(sql: string): CommandResult {
  if (isCiMode) {
    return run('docker', [
      'run',
      '--rm',
      '--network',
      'host',
      '-e',
      `PGPASSWORD=${adminPassword}`,
      postgresImage,
      'psql',
      '-h',
      localHost,
      '-p',
      localPort,
      '-U',
      adminUser,
      '-d',
      databaseName,
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ]);
  }

  return run('docker', [
    'exec',
    '-e',
    `PGPASSWORD=${adminPassword}`,
    containerName,
    'psql',
    '-h',
    localHost,
    '-p',
    '5432',
    '-U',
    adminUser,
    '-d',
    databaseName,
    '-At',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ]);
}

function readSql(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

function readAllMigrations(): string {
  const migrationFiles = readdirSync(migrationsDir)
    .filter((fileName) => /^\d+_.+\.sql$/.test(fileName))
    .sort();

  expect(migrationFiles).toHaveLength(15);

  return migrationFiles
    .map((fileName) => readSql(resolve(migrationsDir, fileName)))
    .join('\n');
}

async function waitForHealthyContainer(): Promise<void> {
  const timeoutAt = Date.now() + 120_000;

  while (Date.now() < timeoutAt) {
    const result = run('docker', [
      'inspect',
      '-f',
      '{{.State.Health.Status}}',
      containerName,
    ], undefined, false);

    if (result.stdout.trim() === 'healthy') {
      return;
    }

    await new Promise((resolveWait) => {
      setTimeout(resolveWait, 2_000);
    });
  }

  throw new Error('Local PostgreSQL container did not become healthy in time.');
}

async function waitForPostgresConnection(): Promise<void> {
  const timeoutAt = Date.now() + 120_000;

  while (Date.now() < timeoutAt) {
    const result = run('docker', [
      'run',
      '--rm',
      '--network',
      'host',
      '-e',
      `PGPASSWORD=${adminPassword}`,
      postgresImage,
      'psql',
      '-h',
      localHost,
      '-p',
      localPort,
      '-U',
      adminUser,
      '-d',
      databaseName,
      '-At',
      '-c',
      'SELECT 1;',
    ], undefined, false);

    if (result.stdout.trim() === '1') {
      return;
    }

    await new Promise((resolveWait) => {
      setTimeout(resolveWait, 2_000);
    });
  }

  throw new Error('CI PostgreSQL service did not accept connections in time.');
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
  expect(output).toContain(`${localHost}:${localPort}->5432/tcp`);
}

function run(
  command: string,
  args: readonly string[],
  input?: string,
  throwOnError = true,
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    input,
    maxBuffer: 1024 * 1024 * 20,
  });

  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();

  if (throwOnError && result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${redactArgs(args).join(' ')}`,
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

function redactArgs(args: readonly string[]): string[] {
  return args.map((arg) =>
    arg.startsWith('PGPASSWORD=') ? 'PGPASSWORD=<redacted>' : arg,
  );
}
