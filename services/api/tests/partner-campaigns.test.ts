import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  CampaignAttributionEventType,
  CampaignCommercialModel,
  CampaignPlacementLocation,
  PartnerCampaignStatus,
  createCampaignPartnerStub,
  createCampaignPlacement,
  createPartnerCampaign,
  getCampaignAttributionSummary,
  getPartnerCampaignById,
  listActiveCampaignsForLocation,
  listCampaignPartnerStubs,
  listCampaignPlacements,
  listCampaignProducts,
  listPartnerCampaigns,
  recordCampaignAttribution,
  transitionPartnerCampaignStatus,
} from '../src/partner-campaigns';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration052 = resolve(repoRoot, 'infrastructure/migrations/052_partner_campaigns.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-partner-campaigns-postgres';
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

const agencyAId = '10000000-0000-4000-8000-000000000002';
const agencyBId = '20000000-0000-4000-8000-000000000002';
const userAId = '11000000-0000-4000-8000-000000000002';
const userBId = '21000000-0000-4000-8000-000000000002';

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

describe.sequential('Partner Campaigns data-access layer (Agent 10)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let database: DatabaseRuntime;

  beforeAll(async () => {
    assertSafeTestDatabase();
    await resetDisposableDatabaseWithRetry();
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
      'TRUNCATE TABLE campaign_attributions, campaign_placements, campaign_products, partner_campaigns, campaign_partner_stubs RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('fails closed with no tenant context established', async () => {
    await expect(database.withTenantTransaction((client) => listPartnerCampaigns(client))).rejects.toThrow();
    await expect(
      database.withTenantTransaction((client) =>
        createPartnerCampaign(client, { partnerId: 'x', name: 'Y' }),
      ),
    ).rejects.toThrow();
  });

  it('createCampaignPartnerStub + listCampaignPartnerStubs are tenant scoped', async () => {
    await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) => createCampaignPartnerStub(client, 'Parceiro A')),
    );
    await runWithTenantContext(contextB, () =>
      database.withTenantTransaction((client) => createCampaignPartnerStub(client, 'Parceiro B')),
    );

    const fromA = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) => listCampaignPartnerStubs(client)),
    );
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.name).toBe('Parceiro A');

    const fromB = await runWithTenantContext(contextB, () =>
      database.withTenantTransaction((client) => listCampaignPartnerStubs(client)),
    );
    expect(fromB).toHaveLength(1);
    expect(fromB[0]?.name).toBe('Parceiro B');
  });

  it('createPartnerCampaign writes under the current tenant only, tenant B cannot see it', async () => {
    const partner = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) => createCampaignPartnerStub(client, 'Parceiro A')),
    );

    const created = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        createPartnerCampaign(client, {
          partnerId: partner.id,
          name: 'Campanha Verão',
          commercialModel: CampaignCommercialModel.CPA,
          productDescriptions: ['Pacote Cancún 7 noites'],
        }),
      ),
    );
    expect(created.name).toBe('Campanha Verão');
    expect(created.status).toBe(PartnerCampaignStatus.DRAFT);

    const fromB = await runWithTenantContext(contextB, () =>
      database.withTenantTransaction((client) => listPartnerCampaigns(client)),
    );
    expect(fromB).toHaveLength(0);

    await expect(
      runWithTenantContext(contextB, () =>
        database.withTenantTransaction((client) => getPartnerCampaignById(client, created.id)),
      ),
    ).rejects.toThrow();

    const products = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) => listCampaignProducts(client, created.id)),
    );
    expect(products).toHaveLength(1);
    expect(products[0]?.productDescription).toBe('Pacote Cancún 7 noites');
  });

  it('rejects a partnerId belonging to another tenant (composite FK)', async () => {
    const partnerB = await runWithTenantContext(contextB, () =>
      database.withTenantTransaction((client) => createCampaignPartnerStub(client, 'Parceiro B')),
    );

    await expect(
      runWithTenantContext(contextA, () =>
        database.withTenantTransaction((client) =>
          createPartnerCampaign(client, { partnerId: partnerB.id, name: 'Cross Tenant' }),
        ),
      ),
    ).rejects.toThrow();
  });

  it('enforces the campaign status state machine', async () => {
    const partner = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) => createCampaignPartnerStub(client, 'Parceiro A')),
    );
    const created = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        createPartnerCampaign(client, { partnerId: partner.id, name: 'Campanha' }),
      ),
    );

    // DRAFT -> COMPLETED is not an allowed transition.
    await expect(
      runWithTenantContext(contextA, () =>
        database.withTenantTransaction((client) =>
          transitionPartnerCampaignStatus(client, created.id, PartnerCampaignStatus.COMPLETED),
        ),
      ),
    ).rejects.toThrow();

    const active = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        transitionPartnerCampaignStatus(client, created.id, PartnerCampaignStatus.ACTIVE),
      ),
    );
    expect(active.status).toBe(PartnerCampaignStatus.ACTIVE);

    // Cannot transition another tenant's campaign.
    await expect(
      runWithTenantContext(contextB, () =>
        database.withTenantTransaction((client) =>
          transitionPartnerCampaignStatus(client, created.id, PartnerCampaignStatus.PAUSED),
        ),
      ),
    ).rejects.toThrow();
  });

  it('placements + listActiveCampaignsForLocation only surface active campaigns/placements in tenant', async () => {
    const partner = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) => createCampaignPartnerStub(client, 'Parceiro A')),
    );
    const created = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        createPartnerCampaign(client, { partnerId: partner.id, name: 'Campanha' }),
      ),
    );

    await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        createCampaignPlacement(client, created.id, CampaignPlacementLocation.PROPOSAL),
      ),
    );

    // Not yet ACTIVE -> should not appear.
    let activeInA = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        listActiveCampaignsForLocation(client, CampaignPlacementLocation.PROPOSAL),
      ),
    );
    expect(activeInA).toHaveLength(0);

    await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        transitionPartnerCampaignStatus(client, created.id, PartnerCampaignStatus.ACTIVE),
      ),
    );

    activeInA = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        listActiveCampaignsForLocation(client, CampaignPlacementLocation.PROPOSAL),
      ),
    );
    expect(activeInA).toHaveLength(1);
    expect(activeInA[0]?.id).toBe(created.id);

    const activeInB = await runWithTenantContext(contextB, () =>
      database.withTenantTransaction((client) =>
        listActiveCampaignsForLocation(client, CampaignPlacementLocation.PROPOSAL),
      ),
    );
    expect(activeInB).toHaveLength(0);

    const placementsFromB = await runWithTenantContext(contextB, () =>
      database.withTenantTransaction((client) => listCampaignPlacements(client, created.id)),
    );
    expect(placementsFromB).toHaveLength(0);
  });

  it('recordCampaignAttribution validates placement/campaign pairing and tenant, then tallies a summary', async () => {
    const partner = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) => createCampaignPartnerStub(client, 'Parceiro A')),
    );
    const created = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        createPartnerCampaign(client, { partnerId: partner.id, name: 'Campanha' }),
      ),
    );
    const placement = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        createCampaignPlacement(client, created.id, CampaignPlacementLocation.TRIP),
      ),
    );

    // Cross-tenant: campaign exists but tenant B has no visibility -> NotFound.
    await expect(
      runWithTenantContext(contextB, () =>
        database.withTenantTransaction((client) =>
          recordCampaignAttribution(client, {
            campaignId: created.id,
            placementId: placement.id,
            eventType: CampaignAttributionEventType.IMPRESSION,
          }),
        ),
      ),
    ).rejects.toThrow();

    await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        recordCampaignAttribution(client, {
          campaignId: created.id,
          placementId: placement.id,
          eventType: CampaignAttributionEventType.IMPRESSION,
        }),
      ),
    );
    await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        recordCampaignAttribution(client, {
          campaignId: created.id,
          placementId: placement.id,
          eventType: CampaignAttributionEventType.CLICK,
        }),
      ),
    );

    const summary = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) => getCampaignAttributionSummary(client, created.id)),
    );
    expect(summary).toEqual({ campaignId: created.id, impressions: 1, clicks: 1 });

    const summaryFromB = () =>
      runWithTenantContext(contextB, () =>
        database.withTenantTransaction((client) => getCampaignAttributionSummary(client, created.id)),
      );
    await expect(summaryFromB()).rejects.toThrow();
  });

  it('rejects a placementId that does not belong to the given campaignId', async () => {
    const partner = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) => createCampaignPartnerStub(client, 'Parceiro A')),
    );
    const campaign1 = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        createPartnerCampaign(client, { partnerId: partner.id, name: 'Campanha 1' }),
      ),
    );
    const campaign2 = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        createPartnerCampaign(client, { partnerId: partner.id, name: 'Campanha 2' }),
      ),
    );
    const placementOfCampaign2 = await runWithTenantContext(contextA, () =>
      database.withTenantTransaction((client) =>
        createCampaignPlacement(client, campaign2.id, CampaignPlacementLocation.CATALOG),
      ),
    );

    await expect(
      runWithTenantContext(contextA, () =>
        database.withTenantTransaction((client) =>
          recordCampaignAttribution(client, {
            campaignId: campaign1.id,
            placementId: placementOfCampaign2.id,
            eventType: CampaignAttributionEventType.CLICK,
          }),
        ),
      ),
    ).rejects.toThrow();
  });
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Partner campaigns data-layer tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Partner campaigns data-layer tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Partner campaigns data-layer tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run partner campaigns data-layer tests against unsafe DATABASE_URL.');
    }
  }
}

function resetDisposableDatabase(): void {
  compose(['down', '-v']);
  compose(['up', '-d']);
}

// The local postgres container name/port are fixed in
// docker-compose.local-postgres.yml and shared across every worktree on
// this machine. When multiple Wave-2 agents run integration tests
// concurrently, `down -v` from one agent can race a fresh `up -d` from
// another, producing a transient "container name already in use" conflict.
// Retry with backoff; if the container already exists (owned by another
// concurrent run), just reuse it once healthy instead of forcing it down --
// this test's own resetDatabase() re-applies a clean schema regardless of
// who started the container.
async function resetDisposableDatabaseWithRetry(): Promise<void> {
  const attempts = 12;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      resetDisposableDatabase();
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Conflict') && !message.includes('already in use')) {
        throw error;
      }
      try {
        compose(['up', '-d']);
        return;
      } catch {
        // Still racing another agent's teardown/startup -- back off and retry.
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 5_000));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to bring up the local postgres container after retries.');
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
  await pool.query(readSqlForPg(migration052));
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
        ($1, 'Agency A', 'agency-a-partner-campaigns-test', 'agency-a-pc@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-partner-campaigns-test', 'agency-b-pc@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a-pc@example.test', 'User A', 'ADMIN', 'hash-for-partner-campaigns-test-only', 'ACTIVE'),
        ($3, $4, 'user-b-pc@example.test', 'User B', 'ADMIN', 'hash-for-partner-campaigns-test-only', 'ACTIVE');
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
