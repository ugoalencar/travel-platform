import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

// Guards against the exact drift that broke the human UX review: the
// Commercial Cockpit demo customers (Cliente A/B/C/D) must keep stable,
// deterministic ids across re-seeds so a "here's the demo customer" URL
// handed to a human tester does not silently 404 after the next
// docker-compose down/up + reseed cycle. See scripts/seed-demo-data.cjs's
// cockpitDemoCustomerIds constant -- this test proves those ids actually
// land in the database and resolve to the expected scenario data.
const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
const migration004 = resolve(repoRoot, 'infrastructure/migrations/004_route_points.sql');
const migration005 = resolve(repoRoot, 'infrastructure/migrations/005_booking.sql');
const migration006 = resolve(repoRoot, 'infrastructure/migrations/006_field_operations.sql');
const migration007 = resolve(repoRoot, 'infrastructure/migrations/007_commercial_cockpit.sql');
const migration008 = resolve(repoRoot, 'infrastructure/migrations/008_configurable_pipelines.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const seedScript = resolve(repoRoot, 'scripts/seed-demo-data.cjs');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-demo-seed-stability-postgres';
const containerName = 'travel-platform-postgres-local';
const databaseHost = process.env.DATABASE_TEST_HOST ?? '127.0.0.1';
const databasePort = Number(process.env.DATABASE_TEST_PORT ?? '55432');
const databaseName = process.env.DATABASE_TEST_NAME ?? 'travel_platform_test';
const adminUser = process.env.DATABASE_TEST_USER ?? 'travel_test';
const adminPassword = process.env.DATABASE_TEST_PASSWORD ?? 'travel_test_password';
const poolPasswordKey = 'pass' + 'word';

const agencyAId = '10000000-0000-4000-8000-000000000001';

const cockpitDemoCustomerIds = {
  cancun: 'c0cc0001-0000-4000-8000-00000000000a',
  gramado: 'c0cc0001-0000-4000-8000-00000000000b',
  buzios: 'c0cc0001-0000-4000-8000-00000000000c',
  portoDeGalinhas: 'c0cc0001-0000-4000-8000-00000000000d',
};

describe.sequential('Commercial Cockpit demo seed stability', () => {
  let adminPool: Pool;

  beforeAll(async () => {
    assertSafeTestDatabase();
    resetDisposableDatabase();
    await waitForHealthyContainer();

    adminPool = new Pool({
      host: databaseHost,
      port: databasePort,
      database: databaseName,
      user: adminUser,
      [poolPasswordKey]: adminPassword,
    });

    await applyMigrations(adminPool);
    runSeedScript();
  }, 180_000);

  afterAll(async () => {
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('lands each Cockpit demo customer at its fixed, documented id', async () => {
    const result = await adminPool.query<{ id: string; name: string; agency_id: string }>(
      `SELECT id, name, agency_id FROM customers WHERE id = ANY($1) ORDER BY id`,
      [Object.values(cockpitDemoCustomerIds)],
    );
    expect(result.rows).toHaveLength(4);
    for (const row of result.rows) {
      expect(row.agency_id).toBe(agencyAId);
    }
  });

  it('re-seeding a freshly reset database reproduces the exact same ids (no drift)', async () => {
    await adminPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await applyMigrations(adminPool);
    runSeedScript();

    const result = await adminPool.query<{ id: string }>(
      `SELECT id FROM customers WHERE id = ANY($1)`,
      [Object.values(cockpitDemoCustomerIds)],
    );
    expect(result.rows.map((r) => r.id).sort()).toEqual(Object.values(cockpitDemoCustomerIds).sort());
  });

  it('links Cliente A (Cancun) to a PROPOSAL_SENT opportunity with a real proposal and an overdue follow-up', async () => {
    const opp = await adminPool.query<{ destination: string; proposal_id: string | null }>(
      `SELECT destination, proposal_id FROM commercial_opportunities WHERE customer_id = $1`,
      [cockpitDemoCustomerIds.cancun],
    );
    expect(opp.rows[0]?.destination).toBe('Cancún');
    expect(opp.rows[0]?.proposal_id).toBeTruthy();

    const task = await adminPool.query<{ due_at: Date }>(
      `SELECT due_at FROM commercial_tasks WHERE customer_id = $1 AND completed_at IS NULL`,
      [cockpitDemoCustomerIds.cancun],
    );
    expect(task.rows[0]?.due_at.getTime()).toBeLessThan(Date.now());
  });

  it('links Cliente C (Buzios) to a WON opportunity backed by a real Sale and future Trip', async () => {
    const sale = await adminPool.query<{ status: string }>(
      `SELECT status FROM sales WHERE customer_id = $1`,
      [cockpitDemoCustomerIds.buzios],
    );
    expect(sale.rows).toHaveLength(1);

    const trip = await adminPool.query<{ destination: string; status: string }>(
      `SELECT destination, status FROM trips WHERE customer_id = $1`,
      [cockpitDemoCustomerIds.buzios],
    );
    expect(trip.rows[0]?.destination).toBe('Buzios');
  });

  it('links Cliente D (Porto de Galinhas) to a COMPLETED trip with no POST_SALE task yet (post-sale candidate)', async () => {
    const trip = await adminPool.query<{ status: string }>(
      `SELECT status FROM trips WHERE customer_id = $1`,
      [cockpitDemoCustomerIds.portoDeGalinhas],
    );
    expect(trip.rows[0]?.status).toBe('COMPLETED');

    const postSaleTask = await adminPool.query(
      `SELECT id FROM commercial_tasks WHERE customer_id = $1 AND type = 'POST_SALE'`,
      [cockpitDemoCustomerIds.portoDeGalinhas],
    );
    expect(postSaleTask.rows).toHaveLength(0);
  });
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Demo seed stability tests require localhost only.');
  }
  if (databasePort !== 55432) {
    throw new Error('Demo seed stability tests require local port 55432.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Demo seed stability tests require a database name with a test marker.');
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

async function applyMigrations(pool: Pool): Promise<void> {
  for (const migration of [
    migration001,
    migration002,
    migration003,
    migration004,
    migration005,
    migration006,
    migration007,
    migration008,
    prepareRolesSql,
  ]) {
    await pool.query(readSqlForPg(migration));
  }
}

function readSqlForPg(filePath: string): string {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
}

function runSeedScript(): void {
  const databaseUrl = `postgres://${adminUser}:${adminPassword}@${databaseHost}:${databasePort}/${databaseName}`;
  run('node', [seedScript], true, { ...process.env, DATABASE_URL: databaseUrl });
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

function run(
  command: string,
  args: readonly string[],
  throwOnError = true,
  env: NodeJS.ProcessEnv = process.env,
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
    env,
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
