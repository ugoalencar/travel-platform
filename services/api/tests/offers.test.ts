import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  createOffer,
  getOfferById,
  listOffers,
  updateOffer,
} from '../src/offers';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-offers-postgres';
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

const contextA = { agencyId: agencyAId, userId: userAId, userRole: UserRole.ADMIN, email: 'user-a@example.test' };
const contextB = { agencyId: agencyBId, userId: userBId, userRole: UserRole.ADMIN, email: 'user-b@example.test' };

describe.sequential('Offer data-access layer (Package 1)', () => {
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

    const roleCheck = await runtimePool.query<{ current_user: string }>('SELECT current_user');
    expect(roleCheck.rows[0]?.current_user).toBe(runtimeUser);
    expect(runtimeUser).not.toBe(adminUser);
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE offers RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('fails closed with no tenant context established', async () => {
    await expect(listOffers(database)).rejects.toThrow();
    await expect(getOfferById(database, 'anything')).rejects.toThrow();
    await expect(createOffer(database, validCreateInput())).rejects.toThrow();
    await expect(updateOffer(database, 'anything', { name: 'X' })).rejects.toThrow();
  });

  it('listOffers returns only Agency A offers for Agency A', async () => {
    await seedOffer(agencyAId, { name: 'A Offer' });
    await seedOffer(agencyBId, { name: 'B Offer' });

    const result = await runWithTenantContext(contextA, () => listOffers(database));

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('A Offer');
    expect(result[0]?.agencyId).toBe(agencyAId);
  });

  it('listOffers returns only Agency B offers for Agency B', async () => {
    await seedOffer(agencyAId, { name: 'A Offer' });
    await seedOffer(agencyBId, { name: 'B Offer' });

    const result = await runWithTenantContext(contextB, () => listOffers(database));

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('B Offer');
    expect(result[0]?.agencyId).toBe(agencyBId);
  });

  it('Agency A cannot read an Offer belonging to Agency B via getOfferById', async () => {
    const bOfferId = await seedOffer(agencyBId, { name: 'B Secret' });

    const result = await runWithTenantContext(contextA, () => getOfferById(database, bOfferId));

    expect(result).toBeNull();
  });

  it('Agency B cannot read an Offer belonging to Agency A via getOfferById', async () => {
    const aOfferId = await seedOffer(agencyAId, { name: 'A Secret' });

    const result = await runWithTenantContext(contextB, () => getOfferById(database, aOfferId));

    expect(result).toBeNull();
  });

  it('createOffer writes agency_id matching the current tenant only', async () => {
    const created = await runWithTenantContext(contextA, () =>
      createOffer(database, validCreateInput({ name: 'New Offer' })),
    );

    expect(created.agencyId).toBe(agencyAId);
    expect(created.status).toBe('ACTIVE');

    const row = await adminPool.query<{ agency_id: string }>(
      'SELECT agency_id FROM offers WHERE id = $1',
      [created.id],
    );
    expect(row.rows[0]?.agency_id).toBe(agencyAId);
  });

  it('createOffer rejects a negative price and creates no row', async () => {
    await expect(
      runWithTenantContext(contextA, () =>
        createOffer(database, validCreateInput({ price: -1 })),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const countResult = await adminPool.query<{ count: string }>('SELECT count(*) FROM offers');
    expect(countResult.rows[0]?.count).toBe('0');
  });

  it('createOffer rejects an invalid validity range (validFrom after validUntil) and creates no row', async () => {
    await expect(
      runWithTenantContext(contextA, () =>
        createOffer(
          database,
          validCreateInput({
            name: 'Bad Range',
            validFrom: new Date('2026-06-22'),
            validUntil: new Date('2026-06-15'),
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const countResult = await adminPool.query<{ count: string }>('SELECT count(*) FROM offers');
    expect(countResult.rows[0]?.count).toBe('0');
  });

  it('updateOffer on another tenant Offer id is a no-op and leaves the row unchanged', async () => {
    const bOfferId = await seedOffer(agencyBId, { name: 'B Original' });

    const result = await runWithTenantContext(contextA, () =>
      updateOffer(database, bOfferId, { name: 'Hacked' }),
    );

    expect(result).toBeNull();

    const row = await adminPool.query<{ name: string }>(
      'SELECT name FROM offers WHERE id = $1',
      [bOfferId],
    );
    expect(row.rows[0]?.name).toBe('B Original');
  });

  it('updateOffer on the correct tenant own Offer successfully updates fields', async () => {
    const offerId = await seedOffer(agencyAId, { name: 'Original' });

    const result = await runWithTenantContext(contextA, () =>
      updateOffer(database, offerId, { name: 'Updated', price: 42 }),
    );

    expect(result?.name).toBe('Updated');
    expect(result?.price).toBe(42);
  });

  it('updateOffer rejects a negative price on partial update and leaves the row unchanged', async () => {
    const offerId = await seedOffer(agencyAId, { name: 'Price Test', price: '100.00' });

    await expect(
      runWithTenantContext(contextA, () =>
        updateOffer(database, offerId, { price: -5 }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const row = await adminPool.query<{ price: string }>('SELECT price FROM offers WHERE id = $1', [offerId]);
    expect(row.rows[0]?.price).toBe('100.00');
  });

  it('updateOffer rejects an invalid status value', async () => {
    const offerId = await seedOffer(agencyAId, { name: 'Status Test' });

    await expect(
      runWithTenantContext(contextA, () =>
        updateOffer(database, offerId, { status: 'NOT_A_STATUS' as never }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('updateOffer validates the validity range when only one date is changed against the current row', async () => {
    const offerId = await seedOffer(agencyAId, {
      name: 'Range Test',
      validFrom: '2026-06-10T00:00:00Z',
      validUntil: '2026-06-20T00:00:00Z',
    });

    await expect(
      runWithTenantContext(contextA, () =>
        updateOffer(database, offerId, { validFrom: new Date('2026-06-25T00:00:00Z') }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const row = await adminPool.query<{ valid_from: string }>(
      'SELECT valid_from FROM offers WHERE id = $1',
      [offerId],
    );
    expect(new Date(row.rows[0]?.valid_from ?? '').toISOString()).toBe('2026-06-10T00:00:00.000Z');

    await expect(
      runWithTenantContext(contextA, () =>
        updateOffer(database, offerId, { validUntil: new Date('2026-06-01T00:00:00Z') }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const result = await runWithTenantContext(contextA, () =>
      updateOffer(database, offerId, { validUntil: new Date('2026-06-21T00:00:00Z') }),
    );
    expect(result).not.toBeNull();
  });

  describe('expiration derivation', () => {
    it('returns EXPIRED when validUntil is clearly in the past, regardless of stored status', async () => {
      const past = new Date(Date.now() - 1000);
      const offerId = await seedOffer(agencyAId, { name: 'Past Offer', validUntil: past.toISOString(), status: 'ACTIVE' });

      const result = await runWithTenantContext(contextA, () => getOfferById(database, offerId));

      expect(result?.status).toBe('EXPIRED');

      const row = await adminPool.query<{ status: string }>('SELECT status FROM offers WHERE id = $1', [offerId]);
      expect(row.rows[0]?.status).toBe('ACTIVE');
    });

    it('returns the stored status when validUntil is clearly in the future', async () => {
      const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);
      const offerId = await seedOffer(agencyAId, { name: 'Future Offer', validUntil: future.toISOString(), status: 'ACTIVE' });

      const result = await runWithTenantContext(contextA, () => getOfferById(database, offerId));

      expect(result?.status).toBe('ACTIVE');
    });

    it('never expires by time when validUntil is null', async () => {
      const offerId = await seedOffer(agencyAId, { name: 'No Expiry', status: 'ACTIVE' });

      const result = await runWithTenantContext(contextA, () => getOfferById(database, offerId));

      expect(result?.status).toBe('ACTIVE');
      expect(result?.validUntil).toBeUndefined();
    });
  });

  function validCreateInput(overrides: Partial<{
    name: string;
    price: number;
    validFrom: Date;
    validUntil: Date;
  }> = {}) {
    return {
      name: overrides.name ?? 'Offer Name',
      price: overrides.price ?? 100,
      ...(overrides.validFrom !== undefined ? { validFrom: overrides.validFrom } : {}),
      ...(overrides.validUntil !== undefined ? { validUntil: overrides.validUntil } : {}),
    };
  }

  async function seedOffer(
    agencyId: string,
    data: { name?: string; price?: string; validFrom?: string; validUntil?: string; status?: string },
  ): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO offers (agency_id, name, price, valid_from, valid_until, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        agencyId,
        data.name ?? 'Offer',
        data.price ?? '100.00',
        data.validFrom ?? null,
        data.validUntil ?? null,
        data.status ?? 'ACTIVE',
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed offer');
    }
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Offer data-layer tests require localhost only.');
  }

  if (databasePort !== 55432) {
    throw new Error('Offer data-layer tests require local port 55432.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Offer data-layer tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === '55432' || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run offer data-layer tests against unsafe DATABASE_URL.');
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
    const result = run(
      'docker',
      ['inspect', '-f', '{{.State.Health.Status}}', containerName],
      false,
    );

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
        ($1, 'Agency A', 'agency-a-offers-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-offers-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-offers-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-offers-test-only', 'ACTIVE');
    `,
    [userAId, agencyAId, userBId, agencyBId],
  );
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

function run(
  command: string,
  args: readonly string[],
  throwOnError = true,
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });

  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();

  if (throwOnError && result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
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
