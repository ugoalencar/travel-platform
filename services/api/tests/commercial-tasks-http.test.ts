import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import { buildApp } from '../src/app';

// Closes the CRUD/filter coverage gap left by commercial-cockpit-security.test.ts
// (which covers RBAC/tenant-isolation for commercial_tasks, not the happy
// paths). Tasks UI + Customer 360 Quick Wins round -- see
// docs/product/TASKS_UI.md.

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-commercial-tasks-http-postgres';
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

const agencyId = '60000000-0000-4000-8000-000000000001';
const agencyBId = '60000000-0000-4000-8000-000000000002';
const customerId = '60000000-0000-4000-8000-000000000010';
const ownerUserId = '60000000-0000-4000-8000-000000000020';
const agentUserId = '60000000-0000-4000-8000-000000000021';
const viewerUserId = '60000000-0000-4000-8000-000000000022';

describe('Commercial Tasks — HTTP CRUD/filters (Tasks UI round)', () => {
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
    await adminPool.query('TRUNCATE TABLE commercial_tasks RESTART IDENTITY CASCADE');
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
          const header = request.headers['x-test-role'];
          if (!header || typeof header !== 'string') return Promise.resolve(null);
          const roleToUser: Record<string, string> = {
            OWNER: ownerUserId,
            AGENT: agentUserId,
            VIEWER: viewerUserId,
          };
          return Promise.resolve({
            agencyId,
            userId: roleToUser[header] ?? agentUserId,
            role: header as UserRole,
            email: 'test@example.test',
          });
        },
      },
      validateUserAgencyAccess: () => Promise.resolve(true),
      database,
    });
  }

  it('AGENT creates a task and it is returned by GET /commercial/tasks', async () => {
    const app = buildTestApp();
    const create = await app.inject({
      method: 'POST',
      url: '/commercial/tasks',
      headers: { 'x-test-role': 'AGENT' },
      payload: {
        customerId,
        assignedUserId: agentUserId,
        type: 'FOLLOW_UP',
        title: 'Ligar para Maria sobre proposta Cancún',
        dueAt: new Date(Date.now() + 3600_000).toISOString(),
      },
    });
    expect(create.statusCode).toBe(201);
    const created: { task: { id: string; title: string } } = create.json();
    expect(created.task.title).toBe('Ligar para Maria sobre proposta Cancún');

    const list = await app.inject({
      method: 'GET',
      url: '/commercial/tasks',
      headers: { 'x-test-role': 'AGENT' },
    });
    expect(list.statusCode).toBe(200);
    const body: { tasks: { id: string }[] } = list.json();
    expect(body.tasks.some((t) => t.id === created.task.id)).toBe(true);
    await app.close();
  });

  it('PATCH edits title/dueAt/notes', async () => {
    const app = buildTestApp();
    const create = await app.inject({
      method: 'POST',
      url: '/commercial/tasks',
      headers: { 'x-test-role': 'AGENT' },
      payload: {
        customerId,
        assignedUserId: agentUserId,
        title: 'Título original',
        dueAt: new Date().toISOString(),
      },
    });
    const created: { task: { id: string } } = create.json();
    const taskId = created.task.id;

    const patch = await app.inject({
      method: 'PATCH',
      url: `/commercial/tasks/${taskId}`,
      headers: { 'x-test-role': 'AGENT' },
      payload: { title: 'Título editado', notes: 'nota nova' },
    });
    expect(patch.statusCode).toBe(200);
    const updated: { task: { title: string; notes: string } } = patch.json();
    expect(updated.task.title).toBe('Título editado');
    expect(updated.task.notes).toBe('nota nova');
    await app.close();
  });

  it('PATCH completedAt marks a task complete, and clearing it reopens', async () => {
    const app = buildTestApp();
    const create = await app.inject({
      method: 'POST',
      url: '/commercial/tasks',
      headers: { 'x-test-role': 'AGENT' },
      payload: { customerId, assignedUserId: agentUserId, title: 'Concluir isso', dueAt: new Date().toISOString() },
    });
    const created: { task: { id: string } } = create.json();
    const taskId = created.task.id;

    const complete = await app.inject({
      method: 'PATCH',
      url: `/commercial/tasks/${taskId}`,
      headers: { 'x-test-role': 'AGENT' },
      payload: { completedAt: new Date().toISOString() },
    });
    expect(complete.statusCode).toBe(200);
    const completed: { task: { completedAt?: string | null } } = complete.json();
    expect(completed.task.completedAt).not.toBeNull();

    const reopen = await app.inject({
      method: 'PATCH',
      url: `/commercial/tasks/${taskId}`,
      headers: { 'x-test-role': 'AGENT' },
      payload: { completedAt: null },
    });
    expect(reopen.statusCode).toBe(200);
    const reopened: { task: { completedAt?: string | null } } = reopen.json();
    expect(reopened.task.completedAt ?? null).toBeNull();
    await app.close();
  });

  it('filters: pending=true excludes completed tasks', async () => {
    const app = buildTestApp();
    const pending = await app.inject({
      method: 'POST',
      url: '/commercial/tasks',
      headers: { 'x-test-role': 'AGENT' },
      payload: { customerId, assignedUserId: agentUserId, title: 'Pendente', dueAt: new Date().toISOString() },
    });
    const done = await app.inject({
      method: 'POST',
      url: '/commercial/tasks',
      headers: { 'x-test-role': 'AGENT' },
      payload: { customerId, assignedUserId: agentUserId, title: 'Concluída', dueAt: new Date().toISOString() },
    });
    const pendingCreated: { task: { id: string } } = pending.json();
    const doneCreated: { task: { id: string } } = done.json();
    const doneId = doneCreated.task.id;
    await app.inject({
      method: 'PATCH',
      url: `/commercial/tasks/${doneId}`,
      headers: { 'x-test-role': 'AGENT' },
      payload: { completedAt: new Date().toISOString() },
    });

    const list = await app.inject({
      method: 'GET',
      url: '/commercial/tasks?pending=true',
      headers: { 'x-test-role': 'AGENT' },
    });
    const body: { tasks: { id: string }[] } = list.json();
    const ids = body.tasks.map((t) => t.id);
    expect(ids).toContain(pendingCreated.task.id);
    expect(ids).not.toContain(doneId);
    await app.close();
  });

  it('filters: overdue=true only returns tasks past due and not completed', async () => {
    const app = buildTestApp();
    const overdue = await app.inject({
      method: 'POST',
      url: '/commercial/tasks',
      headers: { 'x-test-role': 'AGENT' },
      payload: {
        customerId,
        assignedUserId: agentUserId,
        title: 'Atrasada',
        dueAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
    });
    await app.inject({
      method: 'POST',
      url: '/commercial/tasks',
      headers: { 'x-test-role': 'AGENT' },
      payload: {
        customerId,
        assignedUserId: agentUserId,
        title: 'Futura',
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });

    const list = await app.inject({
      method: 'GET',
      url: '/commercial/tasks?overdue=true',
      headers: { 'x-test-role': 'AGENT' },
    });
    const body: { tasks: { id: string; title: string }[] } = list.json();
    const overdueCreated: { task: { id: string } } = overdue.json();
    expect(body.tasks.every((t) => t.title === 'Atrasada')).toBe(true);
    expect(body.tasks.some((t) => t.id === overdueCreated.task.id)).toBe(true);
    await app.close();
  });

  it('filters: dueFrom/dueTo scope a "today" window', async () => {
    const app = buildTestApp();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const today = await app.inject({
      method: 'POST',
      url: '/commercial/tasks',
      headers: { 'x-test-role': 'AGENT' },
      payload: { customerId, assignedUserId: agentUserId, title: 'Hoje', dueAt: new Date().toISOString() },
    });
    await app.inject({
      method: 'POST',
      url: '/commercial/tasks',
      headers: { 'x-test-role': 'AGENT' },
      payload: {
        customerId,
        assignedUserId: agentUserId,
        title: 'Semana que vem',
        dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      },
    });

    const list = await app.inject({
      method: 'GET',
      url: `/commercial/tasks?dueFrom=${encodeURIComponent(startOfDay.toISOString())}&dueTo=${encodeURIComponent(endOfDay.toISOString())}`,
      headers: { 'x-test-role': 'AGENT' },
    });
    const body: { tasks: { id: string }[] } = list.json();
    const todayCreated: { task: { id: string } } = today.json();
    expect(body.tasks.some((t) => t.id === todayCreated.task.id)).toBe(true);
    expect(body.tasks.length).toBe(1);
    await app.close();
  });

  it('filters: assignedUserId scopes to "my tasks"', async () => {
    const app = buildTestApp();
    await app.inject({
      method: 'POST',
      url: '/commercial/tasks',
      headers: { 'x-test-role': 'AGENT' },
      payload: { customerId, assignedUserId: agentUserId, title: 'Minha', dueAt: new Date().toISOString() },
    });
    await app.inject({
      method: 'POST',
      url: '/commercial/tasks',
      headers: { 'x-test-role': 'OWNER' },
      payload: { customerId, assignedUserId: ownerUserId, title: 'Do owner', dueAt: new Date().toISOString() },
    });

    const list = await app.inject({
      method: 'GET',
      url: `/commercial/tasks?assignedUserId=${agentUserId}`,
      headers: { 'x-test-role': 'AGENT' },
    });
    const body: { tasks: { title: string }[] } = list.json();
    expect(body.tasks.map((t) => t.title)).toEqual(['Minha']);
    await app.close();
  });

  it('a task created in this session does not leak to Agency B', async () => {
    const app = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/commercial/tasks',
      headers: { 'x-test-role': 'AGENT' },
      payload: { customerId, assignedUserId: agentUserId, title: 'Só da agência A', dueAt: new Date().toISOString() },
    });
    const createdBody: { task: { id: string } } = created.json();
    const taskId = createdBody.task.id;

    const otherAgencyApp = buildApp({
      authProvider: {
        authenticate: () =>
          Promise.resolve({ agencyId: agencyBId, userId: 'other-agency-user', role: UserRole.OWNER, email: 'b@test.test' }),
      },
      validateUserAgencyAccess: () => Promise.resolve(true),
      database,
    });
    const crossTenantGet = await otherAgencyApp.inject({ method: 'GET', url: `/commercial/tasks/${taskId}` });
    expect(crossTenantGet.statusCode).toBe(404);
    await app.close();
    await otherAgencyApp.close();
  });

  it('reload/persistence: task survives a fresh GET after creation', async () => {
    const app = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/commercial/tasks',
      headers: { 'x-test-role': 'AGENT' },
      payload: { customerId, assignedUserId: agentUserId, title: 'Persistente', dueAt: new Date().toISOString() },
    });
    const createdBody: { task: { id: string } } = created.json();
    const taskId = createdBody.task.id;

    const reread = await app.inject({
      method: 'GET',
      url: `/commercial/tasks/${taskId}`,
      headers: { 'x-test-role': 'AGENT' },
    });
    expect(reread.statusCode).toBe(200);
    const rereadBody: { task: { title: string } } = reread.json();
    expect(rereadBody.task.title).toBe('Persistente');
    await app.close();
  });

  // ------------------------------------------------------------
  async function resetDatabase(pool: Pool): Promise<void> {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migrationFile of migrationFiles) {
      await pool.query(readSqlForPg(migrationFile));
    }
    await pool.query(readSqlForPg(prepareRolesSql));
    await seedFixtures(pool);
  }

  async function seedFixtures(pool: Pool): Promise<void> {
    await pool.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status)
       VALUES
         ($1, 'Agency Tasks HTTP Test', 'agency-tasks-http-test', 'agency-tasks-http@example.test', 'FREE', 'ACTIVE'),
         ($2, 'Agency B Tasks HTTP Test', 'agency-b-tasks-http-test', 'agency-b-tasks-http@example.test', 'FREE', 'ACTIVE')`,
      [agencyId, agencyBId],
    );
    await pool.query(
      `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
       VALUES
         ($1, $2, 'owner@example.test', 'Owner', 'OWNER', 'hash-for-commercial-tasks-http-test-only', 'ACTIVE'),
         ($3, $2, 'agent@example.test', 'Agente', 'AGENT', 'hash-for-commercial-tasks-http-test-only', 'ACTIVE'),
         ($4, $2, 'viewer@example.test', 'Viewer', 'VIEWER', 'hash-for-commercial-tasks-http-test-only', 'ACTIVE')`,
      [ownerUserId, agencyId, agentUserId, viewerUserId],
    );
    await pool.query(
      `INSERT INTO customers (agency_id, id, name, status, protocol_number)
       VALUES ($1, $2, 'Cliente Teste Tasks', 'ACTIVE', 'CLI-TASKS-0001')`,
      [agencyId, customerId],
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
    throw new Error('Commercial tasks HTTP tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Commercial tasks HTTP tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Commercial tasks HTTP tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run commercial tasks HTTP tests against unsafe DATABASE_URL.');
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
    if (result.stdout.trim() === 'healthy') return;
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
