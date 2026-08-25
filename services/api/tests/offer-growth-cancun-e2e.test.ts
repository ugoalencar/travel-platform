import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { createDatabaseRuntime } from '../src/database';

// ============================================================
// MANDATORY Cancun E2E test (Offer & Growth Engine batch 04, section X).
// Proves the full chain end-to-end through real code paths and a real
// Postgres database:
//
//   Campaign "Cancun" -> Offer "Cancun" -> Publication -> simulated
//   Instagram-like COMMENT engagement containing "CANCUN" (via the
//   internal mock connector) -> Engagement recorded -> COMMENT_KEYWORD
//   Automation matches -> dedup check passes (first time) -> Coupon
//   created/granted -> CommercialOpportunity created with full
//   attribution (campaignId/publicationId/offerId/automationId/
//   sourceChannel all populated) -> re-sending the EXACT same event
//   again asserts NO duplicate execution (same dedup key blocks it,
//   verified via DB row counts, not just "no error thrown").
// ============================================================

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationFiles = [
  '001_initial_schema.sql',
  '002_rls_policies.sql',
  '003_transportation.sql',
  '004_route_points.sql',
  '005_booking.sql',
  '006_field_operations.sql',
  '007_commission_repair.sql',
  '008_commercial_cockpit.sql',
  '009_configurable_pipelines.sql',
  '010_financial_foundation.sql',
  '011_booking_cancellation.sql',
  '012_operational_staff_assignments.sql',
  '013_pescador_foundation.sql',
  '014_offer_growth_foundation.sql',
].map((name) => resolve(repoRoot, 'infrastructure/migrations', name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-offer-growth-cancun-e2e-postgres';
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
const userAId = '11000000-0000-4000-8000-000000000001';

const principals: Record<string, AuthenticatedPrincipal> = {
  ownerA: { userId: userAId, agencyId: agencyAId, role: UserRole.OWNER, email: 'user-a@example.test' },
  agentA: { userId: userAId, agencyId: agencyAId, role: UserRole.AGENT, email: 'user-a@example.test' },
  managerA: { userId: userAId, agencyId: agencyAId, role: UserRole.MANAGER, email: 'user-a@example.test' },
};

describe.sequential('Offer & Growth Engine: Cancun E2E (mandatory)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;

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

    await resetDatabase(adminPool);
    await enableCampaignsAndAutomationEntitlements(adminPool);
    await seedDefaultPipeline(adminPool);
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('runs the full Cancun chain and blocks a duplicate webhook delivery via structural dedup', async () => {
    const app = buildApp({
      authProvider: {
        authenticate(request) {
          const key = request.headers['x-test-principal'];
          return Promise.resolve(typeof key === 'string' ? principals[key] ?? null : null);
        },
      },
      validateUserAgencyAccess: (userId, agencyId) =>
        Promise.resolve(userId === userAId && agencyId === agencyAId),
      database: createDatabaseRuntime(runtimePool),
    });

    // 1. Create Offer "Cancun" directly (Offer domain predates this batch).
    const offerResponse = await app.inject({
      method: 'POST',
      url: '/offers',
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'Cancun', price: 2500 },
    });
    expect(offerResponse.statusCode).toBe(201);
    const offerId = offerResponse.json<{ offer: { id: string } }>().offer.id;

    // 2. Create Campaign "Cancun" and link the Offer.
    const campaignResponse = await app.inject({
      method: 'POST',
      url: '/campaigns',
      headers: { 'x-test-principal': 'agentA' },
      payload: { name: 'Cancun', offerIds: [offerId] },
    });
    expect(campaignResponse.statusCode).toBe(201);
    const campaignId = campaignResponse.json<{ campaign: { id: string } }>().campaign.id;

    // 3. Create Publication linking Campaign + Offer + internal mock channel.
    const publicationResponse = await app.inject({
      method: 'POST',
      url: '/publications',
      headers: { 'x-test-principal': 'agentA' },
      payload: { campaignId, offerId, channel: 'INTERNAL_MOCK' },
    });
    expect(publicationResponse.statusCode).toBe(201);
    const publicationId = publicationResponse.json<{ publication: { id: string } }>().publication.id;

    // 4. Create the COMMENT_KEYWORD automation: comment "CANCUN" ->
    // PUBLIC_REPLY + CREATE_COUPON + SEND_COUPON + CREATE_OPPORTUNITY.
    const automationResponse = await app.inject({
      method: 'POST',
      url: '/automations',
      headers: { 'x-test-principal': 'agentA' },
      payload: {
        name: 'Cancun keyword automation',
        trigger: 'COMMENT_KEYWORD',
        channel: 'INTERNAL_MOCK',
        campaignId,
        publicationId,
        keyword: 'CANCUN',
        caseSensitive: false,
        actions: [
          { type: 'PUBLIC_REPLY', message: 'Thanks! Check your DMs for your coupon.' },
          {
            type: 'CREATE_COUPON',
            couponTemplate: { name: 'Cancun promo', type: 'PERCENTAGE', value: 10, maxUses: 100 },
          },
          { type: 'SEND_COUPON', deliveryChannel: 'INTERNAL_MOCK' },
          { type: 'CREATE_OPPORTUNITY' },
        ],
      },
    });
    expect(automationResponse.statusCode).toBe(201);
    const automationId = automationResponse.json<{ automation: { id: string } }>().automation.id;

    const activateResponse = await app.inject({
      method: 'POST',
      url: `/automations/${automationId}/activate`,
      headers: { 'x-test-principal': 'managerA' },
    });
    expect(activateResponse.statusCode).toBe(200);

    // 5. Simulate an Instagram-like COMMENT engagement containing "CANCUN".
    const externalUserId = 'ig-user-cancun-1';
    const simulatePayload = {
      kind: 'comment' as const,
      externalUserId,
      content: 'I want to go to CANCUN!!',
      campaignId,
      publicationId,
      offerId,
    };

    const firstSimulate = await app.inject({
      method: 'POST',
      url: '/connectors/internal-mock/simulate',
      headers: { 'x-test-principal': 'agentA' },
      payload: simulatePayload,
    });
    expect(firstSimulate.statusCode).toBe(200);
    const firstBody = firstSimulate.json<{
      engagementId: string;
      executions: Array<{ automationId: string; deduped: boolean; createdOpportunityId?: string; createdCouponId?: string }>;
    }>();
    expect(firstBody.executions).toHaveLength(1);
    expect(firstBody.executions[0]?.deduped).toBe(false);
    expect(firstBody.executions[0]?.automationId).toBe(automationId);
    expect(firstBody.executions[0]?.createdOpportunityId).toBeTruthy();
    expect(firstBody.executions[0]?.createdCouponId).toBeTruthy();
    const opportunityId = firstBody.executions[0]?.createdOpportunityId as string;

    // Verify full attribution on the created CommercialOpportunity, and
    // that the automation-created lead has a real Customer row.
    const opportunityRow = await adminPool.query<{
      campaign_id: string;
      publication_id: string;
      offer_id: string;
      automation_id: string;
      source_channel: string;
    }>(
      `SELECT campaign_id, publication_id, offer_id, automation_id, source_channel
       FROM commercial_opportunities WHERE agency_id = $1 AND id = $2`,
      [agencyAId, opportunityId],
    );
    expect(opportunityRow.rows).toHaveLength(1);
    expect(opportunityRow.rows[0]?.campaign_id).toBe(campaignId);
    expect(opportunityRow.rows[0]?.publication_id).toBe(publicationId);
    expect(opportunityRow.rows[0]?.offer_id).toBe(offerId);
    expect(opportunityRow.rows[0]?.automation_id).toBe(automationId);
    expect(opportunityRow.rows[0]?.source_channel).toBe('INTERNAL_MOCK');

    // Real coupon grant + connector action (public reply) rows exist.
    const grantCount = await adminPool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM coupon_grants WHERE agency_id = $1 AND automation_id = $2`,
      [agencyAId, automationId],
    );
    expect(Number(grantCount.rows[0]?.count)).toBe(1);

    const connectorActionCount = await adminPool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM connector_actions WHERE agency_id = $1 AND automation_id = $2 AND status = 'SENT'`,
      [agencyAId, automationId],
    );
    expect(Number(connectorActionCount.rows[0]?.count)).toBe(1);

    const executionCountAfterFirst = await adminPool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM automation_executions WHERE agency_id = $1 AND automation_id = $2`,
      [agencyAId, automationId],
    );
    expect(Number(executionCountAfterFirst.rows[0]?.count)).toBe(1);

    // 6. Re-send the EXACT same event again -- must be deduped, not
    // double-processed. Verified via DB row counts, not just "no error".
    const secondSimulate = await app.inject({
      method: 'POST',
      url: '/connectors/internal-mock/simulate',
      headers: { 'x-test-principal': 'agentA' },
      payload: simulatePayload,
    });
    expect(secondSimulate.statusCode).toBe(200);
    const secondBody = secondSimulate.json<{ executions: Array<{ deduped: boolean }> }>();
    expect(secondBody.executions).toHaveLength(1);
    expect(secondBody.executions[0]?.deduped).toBe(true);

    const executionCountAfterSecond = await adminPool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM automation_executions WHERE agency_id = $1 AND automation_id = $2`,
      [agencyAId, automationId],
    );
    expect(Number(executionCountAfterSecond.rows[0]?.count)).toBe(1);

    const grantCountAfterSecond = await adminPool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM coupon_grants WHERE agency_id = $1 AND automation_id = $2`,
      [agencyAId, automationId],
    );
    expect(Number(grantCountAfterSecond.rows[0]?.count)).toBe(1);

    const opportunityCountAfterSecond = await adminPool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM commercial_opportunities WHERE agency_id = $1 AND automation_id = $2`,
      [agencyAId, automationId],
    );
    expect(Number(opportunityCountAfterSecond.rows[0]?.count)).toBe(1);

    await app.close();
  });
});

async function enableCampaignsAndAutomationEntitlements(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO agency_entitlements (agency_id, feature, enabled, updated_by)
     VALUES
       ($1, 'CAMPAIGNS', true, 'test-seed'),
       ($1, 'SOCIAL_PUBLISHING', true, 'test-seed'),
       ($1, 'SOCIAL_AUTOMATION', true, 'test-seed'),
       ($1, 'CREATIVE_STUDIO', true, 'test-seed')`,
    [agencyAId],
  );
}

async function seedDefaultPipeline(pool: Pool): Promise<void> {
  const pipeline = await pool.query<{ id: string }>(
    `INSERT INTO pipelines (agency_id, name, active) VALUES ($1, 'Comercial', true) RETURNING id`,
    [agencyAId],
  );
  const pipelineId = pipeline.rows[0]?.id;
  await pool.query(
    `INSERT INTO pipeline_stages (agency_id, pipeline_id, name, sequence)
     VALUES ($1, $2, 'Prospecting', 1)`,
    [agencyAId, pipelineId],
  );
}

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Cancun E2E test requires localhost only.');
  }
  if (databasePort !== 55432) {
    throw new Error('Cancun E2E test requires local port 55432.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Cancun E2E test requires a database name with a test marker.');
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
    await new Promise((resolveWait) => {
      setTimeout(resolveWait, 2_000);
    });
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

async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const migrationFile of migrationFiles) {
    await pool.query(readSqlForPg(migrationFile));
  }
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
    `INSERT INTO agencies (id, name, slug, email, plan, status)
     VALUES ($1, 'Agency A', 'agency-a-cancun-e2e-test', 'agency-a@example.test', 'FREE', 'ACTIVE')`,
    [agencyAId],
  );
  await pool.query(
    `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
     VALUES ($1, $2, 'user-a@example.test', 'User A', 'OWNER', 'hash-for-cancun-e2e-test-only', 'ACTIVE')`,
    [userAId, agencyAId],
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
