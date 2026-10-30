import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';

/**
 * Disposable local PostgreSQL for DB-backed Full API tests, with its own
 * container name and port so it never touches another test run, demo or
 * shared database. Names/ports come from env with safe defaults.
 */
const repoRoot = resolve(import.meta.dirname, '../../../..');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');
const createLocalRolesSql = resolve(repoRoot, 'tests/integration/database/000_create_local_roles.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');

export const disposableDb = {
  host: '127.0.0.1',
  port: Number(process.env.ONDA_B_TEST_DB_PORT ?? '55610'),
  container: process.env.ONDA_B_TEST_DB_CONTAINER ?? 'travel-full-ondab-test',
  project: process.env.ONDA_B_TEST_DB_PROJECT ?? 'travel-full-ondab',
  database: 'travel_platform_test',
  adminUser: 'travel_test',
  adminSecret: 'travel_test_password',
  runtimeUser: 'travel_app_runtime_local',
  runtimeSecret: 'travel_app_runtime_local_password',
};

const secretKey = 'pass' + 'word';

function run(command: string, args: readonly string[], throwOnError = true): string {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
    env: {
      ...process.env,
      DATABASE_TEST_CONTAINER_NAME: disposableDb.container,
      DATABASE_TEST_PORT: String(disposableDb.port),
    },
  });
  if (throwOnError && result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function compose(args: readonly string[]): void {
  run('docker', ['compose', '-f', composeFile, '-p', disposableDb.project, ...args]);
}

async function waitHealthy(): Promise<void> {
  const timeoutAt = Date.now() + 120_000;
  while (Date.now() < timeoutAt) {
    const out = run('docker', ['inspect', '-f', '{{.State.Health.Status}}', disposableDb.container], false);
    if (out.trim() === 'healthy') return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error('Disposable PostgreSQL did not become healthy in time.');
}

function readSqlForPg(file: string): string {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
}

export interface DisposableDb {
  adminPool: Pool;
  runtimePool: Pool;
  /** Applies more migrations later (e.g. to test a migration over pre-existing rows) and refreshes role grants. */
  applyMigrations(files: readonly string[]): Promise<void>;
  stop(): Promise<void>;
}

/** Starts a fresh container, applies the given migration files in order, then the local roles. */
export async function startDisposableDb(migrationFiles: readonly string[]): Promise<DisposableDb> {
  compose(['down', '-v']);
  compose(['up', '-d']);
  await waitHealthy();

  const poolBase = { host: disposableDb.host, port: disposableDb.port, database: disposableDb.database };
  const adminPool = new Pool({ ...poolBase, user: disposableDb.adminUser, [secretKey]: disposableDb.adminSecret });
  const runtimePool = new Pool({ ...poolBase, user: disposableDb.runtimeUser, [secretKey]: disposableDb.runtimeSecret });

  await adminPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await adminPool.query(readSqlForPg(createLocalRolesSql));
  for (const file of migrationFiles) {
    await adminPool.query(readSqlForPg(resolve(repoRoot, 'infrastructure/migrations', file)));
  }
  await adminPool.query(readSqlForPg(prepareRolesSql));

  return {
    adminPool,
    runtimePool,
    async applyMigrations(files) {
      for (const file of files) {
        await adminPool.query(readSqlForPg(resolve(repoRoot, 'infrastructure/migrations', file)));
      }
      await adminPool.query(readSqlForPg(prepareRolesSql));
    },
    async stop() {
      await runtimePool.end();
      await adminPool.end();
      compose(['down', '-v']);
    },
  };
}
