/**
 * Disposable PostgreSQL helpers for the Travel Lite test suite.
 *
 * Own container (travel-lite-postgres-test on 55437), own database —
 * never the Travel Platform test container (55432) and never the Travel
 * Lite dev database (55436). Reset = DROP SCHEMA + reapply
 * infrastructure/migrations-travel-lite/*.sql as the admin role.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

const repoRoot = resolve(import.meta.dirname, '../../../..');

export const COMPOSE_FILE = resolve(repoRoot, 'infrastructure/docker-compose.travel-lite-test.yml');
export const CONTAINER_NAME = 'travel-lite-postgres-test';
export const MIGRATIONS_DIR = resolve(repoRoot, 'infrastructure/migrations-travel-lite');

export const ADMIN_URL =
  process.env.LITE_TEST_ADMIN_URL ??
  'postgresql://travel_lite_admin:travel_lite_admin_password@127.0.0.1:55437/travel_lite_test';
export const RUNTIME_URL =
  process.env.LITE_TEST_RUNTIME_URL ??
  'postgresql://travel_lite_runtime:travel_lite_runtime_password@127.0.0.1:55437/travel_lite_test';

function compose(args: string[]): void {
  const result = spawnSync('docker', ['compose', '-f', COMPOSE_FILE, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`docker compose ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
}

function containerHealthy(): boolean {
  const result = spawnSync(
    'docker',
    ['inspect', '--format', '{{.State.Health.Status}}', CONTAINER_NAME],
    { encoding: 'utf8', windowsHide: true },
  );
  return result.status === 0 && result.stdout.trim() === 'healthy';
}

async function waitForHealthy(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (containerHealthy()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${CONTAINER_NAME} did not become healthy in time`);
}

export interface LiteTestPools {
  adminPool: Pool;
  runtimePool: Pool;
}

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => resolve(MIGRATIONS_DIR, name));
}

/**
 * Brings the test container up (if needed), drops the schema and reapplies
 * every Lite migration. Returns fresh pools (admin + runtime role).
 */
export async function resetLiteTestDatabase(): Promise<LiteTestPools> {
  if (!containerHealthy()) {
    compose(['up', '-d']);
    await waitForHealthy();
  }

  const adminPool = new Pool({ connectionString: ADMIN_URL, max: 5 });
  await adminPool.query('DROP SCHEMA public CASCADE');
  await adminPool.query('CREATE SCHEMA public');

  for (const file of migrationFiles()) {
    const sql = readFileSync(file, 'utf8');
    try {
      await adminPool.query(sql);
    } catch (error) {
      throw new Error(`migration ${file} failed: ${(error as Error).message}`);
    }
  }

  const runtimePool = new Pool({ connectionString: RUNTIME_URL, max: 5 });
  return { adminPool, runtimePool };
}

export async function endPools(pools: Partial<LiteTestPools>): Promise<void> {
  await pools.runtimePool?.end();
  await pools.adminPool?.end();
}

export function teardownLiteTestDatabase(): void {
  compose(['down', '-v']);
}

/** Inserts a tenant directly as admin (outside RLS) for fixtures. */
export async function createTenantFixture(
  adminPool: Pool,
  fixture: { slug: string; name?: string },
): Promise<string> {
  const result = await adminPool.query<{ id: string }>(
    `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id`,
    [fixture.name ?? fixture.slug, fixture.slug],
  );
  return result.rows[0]!.id;
}

export async function createUserFixture(
  adminPool: Pool,
  fixture: {
    tenantId: string;
    name: string;
    email: string;
    passwordHash: string;
    role: 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER';
  },
): Promise<string> {
  const result = await adminPool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [fixture.tenantId, fixture.name, fixture.email, fixture.passwordHash, fixture.role],
  );
  return result.rows[0]!.id;
}

export function assertLocalTestDatabase(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Travel Lite tests must never run with NODE_ENV=production');
  }
  for (const url of [ADMIN_URL, RUNTIME_URL]) {
    const hostname = new URL(url).hostname;
    if (!['127.0.0.1', 'localhost'].includes(hostname)) {
      throw new Error(`Travel Lite tests must target a local database (got ${hostname})`);
    }
  }
}
