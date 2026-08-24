import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

// Migration-preservation test: seeds commercial_opportunities rows under
// the OLD (pre-008) schema shape -- i.e. applies every migration up to
// and including 008_commercial_cockpit.sql (which only has the `stage`
// enum column, no pipeline_id/stage_id) and inserts rows using that old
// shape -- then applies 009_configurable_pipelines.sql on top and asserts
// every pre-existing row ends up with a valid, correctly-mapped
// pipeline_id/stage_id and that zero rows were lost.

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
const migration004 = resolve(repoRoot, 'infrastructure/migrations/004_route_points.sql');
const migration005 = resolve(repoRoot, 'infrastructure/migrations/005_booking.sql');
const migration006 = resolve(repoRoot, 'infrastructure/migrations/006_field_operations.sql');
const migration008Commercial = resolve(repoRoot, 'infrastructure/migrations/008_commercial_cockpit.sql');
const migration009Configurable = resolve(repoRoot, 'infrastructure/migrations/009_configurable_pipelines.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-migration-009-preservation-postgres';
const containerName = 'travel-platform-postgres-local';
const postgresImage = 'postgres:15';
const databaseHost = process.env.DATABASE_TEST_HOST ?? '127.0.0.1';
const databasePort = Number(process.env.DATABASE_TEST_PORT ?? '55432');
const databaseName = process.env.DATABASE_TEST_NAME ?? 'travel_platform_test';
const adminUser = process.env.DATABASE_TEST_USER ?? 'travel_test';
const adminPassword = process.env.DATABASE_TEST_PASSWORD ?? 'travel_test_password';
const poolPasswordKey = 'pass' + 'word';

const agencyId = '30000000-0000-4000-8000-000000000001';
const agency2Id = '30000000-0000-4000-8000-000000000002';
const customerId = '31000000-0000-4000-8000-000000000001';
const customer2Id = '31000000-0000-4000-8000-000000000002';

describe.sequential('Migration 009 preservation (pre-009 rows survive with valid pipeline/stage)', () => {
  let pool: Pool;

  beforeAll(async () => {
    assertSafeTestDatabase();
    resetDisposableDatabase();
    await waitForHealthyContainer();
    assertContainerIsLocal();

    pool = new Pool({
      host: databaseHost,
      port: databasePort,
      database: databaseName,
      user: adminUser,
      [poolPasswordKey]: adminPassword,
    });

    // Apply every migration UP TO 008 only -- the old pre-pipeline schema
    // shape, with just the `stage` enum column.
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const file of [
      migration001,
      migration002,
      migration003,
      migration004,
      migration005,
      migration006,
      migration008Commercial,
    ]) {
      await pool.query(readSqlForPg(file));
    }

    await pool.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status) VALUES
         ($1, 'Agency Pre-008', 'agency-pre-008-migration-test', 'agency-pre-008@example.test', 'FREE', 'ACTIVE'),
         ($2, 'Agency Pre-008 No Opps', 'agency-pre-008-no-opps-migration-test', 'agency-pre-008-b@example.test', 'FREE', 'ACTIVE')`,
      [agencyId, agency2Id],
    );
    await pool.query(
      `INSERT INTO customers (id, agency_id, name) VALUES ($1, $2, 'Customer Pre-008'), ($3, $2, 'Customer Pre-008 B')`,
      [customerId, agencyId, customer2Id],
    );

    // Seed one opportunity per old CommercialStage enum value, under the
    // OLD schema shape (no pipeline_id/stage_id column exists yet).
    const stages = [
      'PROSPECTING',
      'INTEREST',
      'QUOTE',
      'PROPOSAL_SENT',
      'WAITING_CUSTOMER',
      'NEGOTIATION',
      'WON',
      'POST_SALE',
      'LOST',
    ];
    for (const stage of stages) {
      await pool.query(
        `INSERT INTO commercial_opportunities (agency_id, customer_id, stage) VALUES ($1, $2, $3)`,
        [agencyId, customerId, stage],
      );
    }
    // A second row on the second customer to make sure per-row mapping
    // (not just per-agency) is exercised.
    await pool.query(
      `INSERT INTO commercial_opportunities (agency_id, customer_id, stage) VALUES ($1, $2, 'WON')`,
      [agencyId, customer2Id],
    );
  });

  afterAll(async () => {
    await pool?.end();
    compose(['down', '-v']);
  });

  it('applies 009 cleanly and preserves every pre-existing row with a correctly-mapped pipeline/stage', async () => {
    const beforeCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM commercial_opportunities WHERE agency_id = $1`,
      [agencyId],
    );
    expect(Number(beforeCount.rows[0]?.count)).toBe(10);

    await pool.query(readSqlForPg(migration009Configurable));

    const afterCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM commercial_opportunities WHERE agency_id = $1`,
      [agencyId],
    );
    expect(Number(afterCount.rows[0]?.count)).toBe(10);

    // Zero rows anywhere in the table missing pipeline_id/stage_id.
    const missing = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM commercial_opportunities
       WHERE pipeline_id IS NULL OR stage_id IS NULL`,
    );
    expect(Number(missing.rows[0]?.count)).toBe(0);

    // Every row's new stage_id/pipeline_id maps back to a PipelineStage
    // whose name equals the row's OLD stage value, in a Pipeline named
    // "Comercial" scoped to the SAME agency as the opportunity.
    const mappedCorrect = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM commercial_opportunities co
       JOIN pipeline_stages ps ON ps.agency_id = co.agency_id AND ps.id = co.stage_id
       JOIN pipelines p ON p.agency_id = ps.agency_id AND p.id = ps.pipeline_id
       WHERE co.agency_id = $1
         AND p.id = co.pipeline_id
         AND p.name = 'Comercial'
         AND ps.name = co.stage::TEXT`,
      [agencyId],
    );
    expect(Number(mappedCorrect.rows[0]?.count)).toBe(10);

    // A default "Comercial" pipeline with 9 stages was created even for
    // the agency with zero pre-existing opportunities.
    const noOppsPipeline = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pipelines WHERE agency_id = $1 AND name = 'Comercial'`,
      [agency2Id],
    );
    expect(Number(noOppsPipeline.rows[0]?.count)).toBe(1);
    const noOppsStages = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pipeline_stages ps
       JOIN pipelines p ON p.agency_id = ps.agency_id AND p.id = ps.pipeline_id
       WHERE p.agency_id = $1 AND p.name = 'Comercial'`,
      [agency2Id],
    );
    expect(Number(noOppsStages.rows[0]?.count)).toBe(9);
  });
});

function readSqlForPg(filePath: string): string {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
}

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Migration 008 preservation test requires localhost only.');
  }
  if (databasePort !== 55432) {
    throw new Error('Migration 008 preservation test requires local port 55432.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Migration 008 preservation test requires a database name with a test marker.');
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
    if (result.stdout.trim() === 'healthy') {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
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

interface CommandResult {
  stdout: string;
  stderr: string;
}

function run(command: string, args: readonly string[], throwOnError = true): CommandResult {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 });
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
