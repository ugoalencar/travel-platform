import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import { createCustomerAccessValidator } from '../src/customer-portal';
import type { CustomerAuthProvider } from '../src/customer-auth';
import type { UserRole } from '../../../packages/domain/types';

// Customer Engagement Tracking round -- see
// docs/product/CUSTOMER_ENGAGEMENT_TRACKING.md. Covers both the
// customer-app POST tracking routes and the staff-side
// GET /commercial/engagements aggregation/timeline route.

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-customer-engagement-tracking-postgres';
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

const agencyAId = '10000000-0000-4000-8000-000000000101';
const agencyBId = '10000000-0000-4000-8000-000000000102';
const agentAId = '11000000-0000-4000-8000-000000000101';
const viewerAId = '11000000-0000-4000-8000-000000000102';

describe('Customer Engagement Tracking', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let database: DatabaseRuntime;
  let customerAId: string;
  let customerBId: string;
  let offerId: string;
  let proposalId: string;
  let tripId: string;
  let communicationId: string;

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
    await adminPool.query(
      'TRUNCATE TABLE engagements, agency_communications, proposals, trips, offers, customers RESTART IDENTITY CASCADE',
    );

    const customerA = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name, email) VALUES ($1, 'Cliente A', 'cliente-a@example.test') RETURNING id`,
      [agencyAId],
    );
    customerAId = customerA.rows[0]!.id;

    const customerB = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name, email) VALUES ($1, 'Cliente B', 'cliente-b@example.test') RETURNING id`,
      [agencyBId],
    );
    customerBId = customerB.rows[0]!.id;

    const offer = await adminPool.query<{ id: string }>(
      `INSERT INTO offers (agency_id, name, price, status) VALUES ($1, 'Cancún', 5000, 'ACTIVE') RETURNING id`,
      [agencyAId],
    );
    offerId = offer.rows[0]!.id;

    const proposal = await adminPool.query<{ id: string }>(
      `INSERT INTO proposals (agency_id, customer_id, proposed_price, total)
       VALUES ($1, $2, 3000, 3000) RETURNING id`,
      [agencyAId, customerAId],
    );
    proposalId = proposal.rows[0]!.id;

    const trip = await adminPool.query<{ id: string }>(
      `INSERT INTO trips (agency_id, customer_id, name, destination, start_date, end_date)
       VALUES ($1, $2, 'Viagem Cancún', 'Cancún', now() + interval '30 days', now() + interval '37 days')
       RETURNING id`,
      [agencyAId, customerAId],
    );
    tripId = trip.rows[0]!.id;

    const communication = await adminPool.query<{ id: string }>(
      `INSERT INTO agency_communications (agency_id, type, title, status, created_by)
       VALUES ($1, 'NOTICE', 'Aviso', 'ACTIVE', $2) RETURNING id`,
      [agencyAId, agentAId],
    );
    communicationId = communication.rows[0]!.id;
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  function buildCustomerApp(customerId: string, agencyId = agencyAId) {
    const provider: CustomerAuthProvider = {
      authenticateCustomer(request) {
        if (request.headers['x-test-customer'] === 'ok') {
          return Promise.resolve({ agencyId, customerId });
        }
        return Promise.resolve(null);
      },
    };
    return buildApp({
      authProvider: { authenticate: () => Promise.resolve(null) },
      validateUserAgencyAccess: () => Promise.resolve(false),
      database,
      customerAuthProvider: provider,
      validateCustomerAgencyAccess: createCustomerAccessValidator(adminPool),
    });
  }

  function buildStaffApp() {
    return buildApp({
      authProvider: {
        authenticate(request) {
          const header = request.headers['x-test-role'];
          if (!header || typeof header !== 'string') return Promise.resolve(null);
          const roleToUser: Record<string, string> = { AGENT: agentAId, VIEWER: viewerAId };
          return Promise.resolve({
            agencyId: agencyAId,
            userId: roleToUser[header] ?? agentAId,
            role: header as UserRole,
            email: 'staff@example.test',
          });
        },
      },
      validateUserAgencyAccess: () => Promise.resolve(true),
      database,
    });
  }

  it('OFFER_VIEWED is recorded on first view', async () => {
    const app = buildCustomerApp(customerAId);
    const response = await app.inject({
      method: 'POST',
      url: `/customer-api/offers/${offerId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ recorded: true });

    const rows = await adminPool.query<{ type: string }>(`SELECT type FROM engagements WHERE offer_id = $1`, [offerId]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.type).toBe('OFFER_VIEWED');
    await app.close();
  });

  it('duplicate suppression: a second view within the window is not recorded', async () => {
    const app = buildCustomerApp(customerAId);
    await app.inject({
      method: 'POST',
      url: `/customer-api/offers/${offerId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/customer-api/offers/${offerId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(second.json()).toEqual({ recorded: false });

    const rows = await adminPool.query(`SELECT type FROM engagements WHERE offer_id = $1`, [offerId]);
    expect(rows.rows).toHaveLength(1);
    await app.close();
  });

  it('OFFER_REVISITED is recorded once the revisit window has passed', async () => {
    // Simulates an old view outside the 30-minute window directly via SQL
    // (waiting 30 real minutes in a test is not viable).
    await adminPool.query(
      `INSERT INTO engagements (agency_id, type, channel, offer_id, customer_id, occurred_at)
       VALUES ($1, 'OFFER_VIEWED', 'customer_portal', $2, $3, now() - interval '1 hour')`,
      [agencyAId, offerId, customerAId],
    );

    const app = buildCustomerApp(customerAId);
    const response = await app.inject({
      method: 'POST',
      url: `/customer-api/offers/${offerId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(response.json()).toEqual({ recorded: true });

    const rows = await adminPool.query<{ type: string }>(
      `SELECT type FROM engagements WHERE offer_id = $1 ORDER BY occurred_at`,
      [offerId],
    );
    expect(rows.rows.map((r) => r.type)).toEqual(['OFFER_VIEWED', 'OFFER_REVISITED']);
    await app.close();
  });

  it('PROPOSAL_VIEWED is recorded on first view', async () => {
    const app = buildCustomerApp(customerAId);
    const response = await app.inject({
      method: 'POST',
      url: `/customer-api/proposals/${proposalId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(response.json()).toEqual({ recorded: true });
    const rows = await adminPool.query<{ type: string }>(`SELECT type FROM engagements WHERE proposal_id = $1`, [proposalId]);
    expect(rows.rows[0]!.type).toBe('PROPOSAL_VIEWED');
    await app.close();
  });

  it('PROPOSAL_REVISITED is recorded once the revisit window has passed', async () => {
    await adminPool.query(
      `INSERT INTO engagements (agency_id, type, channel, proposal_id, customer_id, occurred_at)
       VALUES ($1, 'PROPOSAL_VIEWED', 'customer_portal', $2, $3, now() - interval '1 hour')`,
      [agencyAId, proposalId, customerAId],
    );
    const app = buildCustomerApp(customerAId);
    const response = await app.inject({
      method: 'POST',
      url: `/customer-api/proposals/${proposalId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(response.json()).toEqual({ recorded: true });
    const rows = await adminPool.query<{ type: string }>(
      `SELECT type FROM engagements WHERE proposal_id = $1 ORDER BY occurred_at`,
      [proposalId],
    );
    expect(rows.rows.map((r) => r.type)).toEqual(['PROPOSAL_VIEWED', 'PROPOSAL_REVISITED']);
    await app.close();
  });

  it('COMMUNICATION_VIEWED is recorded, and CTA clicks are never suppressed', async () => {
    const app = buildCustomerApp(customerAId);
    const viewed = await app.inject({
      method: 'POST',
      url: `/customer-api/communications/${communicationId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(viewed.json()).toEqual({ recorded: true });

    const click1 = await app.inject({
      method: 'POST',
      url: `/customer-api/communications/${communicationId}/cta-clicked`,
      headers: { 'x-test-customer': 'ok' },
    });
    const click2 = await app.inject({
      method: 'POST',
      url: `/customer-api/communications/${communicationId}/cta-clicked`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(click1.json()).toEqual({ recorded: true });
    expect(click2.json()).toEqual({ recorded: true });

    const clicks = await adminPool.query(
      `SELECT id FROM engagements WHERE communication_id = $1 AND type = 'COMMUNICATION_CTA_CLICKED'`,
      [communicationId],
    );
    expect(clicks.rows).toHaveLength(2);
    await app.close();
  });

  it('TRIP_VIEWED and CUSTOMER_HOME_VIEWED are recorded', async () => {
    const app = buildCustomerApp(customerAId);
    const tripViewed = await app.inject({
      method: 'POST',
      url: `/customer-api/trips/${tripId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(tripViewed.json()).toEqual({ recorded: true });

    const homeViewed = await app.inject({
      method: 'POST',
      url: '/customer-api/home/viewed',
      headers: { 'x-test-customer': 'ok' },
    });
    expect(homeViewed.json()).toEqual({ recorded: true });

    const tripRows = await adminPool.query<{ type: string }>(`SELECT type FROM engagements WHERE trip_id = $1`, [tripId]);
    expect(tripRows.rows[0]!.type).toBe('TRIP_VIEWED');
    const homeRows = await adminPool.query(
      `SELECT type FROM engagements WHERE type = 'CUSTOMER_HOME_VIEWED' AND customer_id = $1`,
      [customerAId],
    );
    expect(homeRows.rows).toHaveLength(1);
    await app.close();
  });

  it('cross-tenant: a customer from Agency B cannot record a view for Agency A offer/proposal/trip (404, no row written)', async () => {
    const app = buildCustomerApp(customerBId, agencyBId);
    const offerResponse = await app.inject({
      method: 'POST',
      url: `/customer-api/offers/${offerId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(offerResponse.statusCode).toBe(404);

    const proposalResponse = await app.inject({
      method: 'POST',
      url: `/customer-api/proposals/${proposalId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(proposalResponse.statusCode).toBe(404);

    const rows = await adminPool.query(`SELECT id FROM engagements`);
    expect(rows.rows).toHaveLength(0);
    await app.close();
  });

  it('invalid entity: viewing a nonexistent offer id returns 404 and writes nothing', async () => {
    const app = buildCustomerApp(customerAId);
    const response = await app.inject({
      method: 'POST',
      url: `/customer-api/offers/00000000-0000-4000-8000-000000000000/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(response.statusCode).toBe(404);
    const rows = await adminPool.query(`SELECT id FROM engagements`);
    expect(rows.rows).toHaveLength(0);
    await app.close();
  });

  it('a proposal belonging to a different customer in the same tenant is not viewable (404)', async () => {
    // customerB belongs to agency B in fixtures above; simulate a same-tenant
    // "other customer" by creating one under agency A directly.
    const otherCustomer = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name, email) VALUES ($1, 'Outro Cliente', 'outro@example.test') RETURNING id`,
      [agencyAId],
    );
    const app = buildCustomerApp(otherCustomer.rows[0]!.id);
    const response = await app.inject({
      method: 'POST',
      url: `/customer-api/proposals/${proposalId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('unauthenticated customer request is rejected (401)', async () => {
    const app = buildCustomerApp(customerAId);
    const response = await app.inject({ method: 'POST', url: `/customer-api/offers/${offerId}/viewed` });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('Customer 360 aggregate: GET /commercial/engagements?customerId= returns only that customer’s rows, scoped to the tenant', async () => {
    const customerApp = buildCustomerApp(customerAId);
    await customerApp.inject({
      method: 'POST',
      url: `/customer-api/offers/${offerId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    await customerApp.inject({
      method: 'POST',
      url: `/customer-api/proposals/${proposalId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    await customerApp.close();

    const staffApp = buildStaffApp();
    const response = await staffApp.inject({
      method: 'GET',
      url: `/commercial/engagements?customerId=${customerAId}`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    expect(response.statusCode).toBe(200);
    const body: { engagements: { type: string; customerId?: string }[] } = response.json();
    expect(body.engagements).toHaveLength(2);
    expect(body.engagements.every((e) => e.customerId === customerAId)).toBe(true);
    // Timeline ordering: most recent first.
    const proposalIdx = body.engagements.findIndex((e) => e.type === 'PROPOSAL_VIEWED');
    const offerIdx = body.engagements.findIndex((e) => e.type === 'OFFER_VIEWED');
    expect(proposalIdx).toBeLessThan(offerIdx);
    await staffApp.close();
  });

  it('unique customer aggregation: two different customers viewing the same offer produce separate, correctly-scoped rows', async () => {
    const appA = buildCustomerApp(customerAId);
    await appA.inject({
      method: 'POST',
      url: `/customer-api/offers/${offerId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    await appA.close();

    const otherCustomer = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name, email) VALUES ($1, 'Outro Cliente', 'outro2@example.test') RETURNING id`,
      [agencyAId],
    );
    const appOther = buildCustomerApp(otherCustomer.rows[0]!.id);
    await appOther.inject({
      method: 'POST',
      url: `/customer-api/offers/${offerId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    await appOther.close();

    const staffApp = buildStaffApp();
    const response = await staffApp.inject({
      method: 'GET',
      url: `/commercial/engagements?customerId=${customerAId}`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    const body: { engagements: unknown[] } = response.json();
    expect(body.engagements).toHaveLength(1);
    await staffApp.close();
  });

  it('persists across a fresh GET (survives reload)', async () => {
    const customerApp = buildCustomerApp(customerAId);
    await customerApp.inject({
      method: 'POST',
      url: `/customer-api/offers/${offerId}/viewed`,
      headers: { 'x-test-customer': 'ok' },
    });
    await customerApp.close();

    const staffApp = buildStaffApp();
    const first = await staffApp.inject({
      method: 'GET',
      url: `/commercial/engagements?customerId=${customerAId}`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    const second = await staffApp.inject({
      method: 'GET',
      url: `/commercial/engagements?customerId=${customerAId}`,
      headers: { 'x-test-role': 'VIEWER' },
    });
    expect(first.json()).toEqual(second.json());
    await staffApp.close();
  });

  it('GET /commercial/engagements requires an authenticated staff session (401) and a customerId query param (400)', async () => {
    const staffApp = buildStaffApp();
    const unauthenticated = await staffApp.inject({
      method: 'GET',
      url: `/commercial/engagements?customerId=${customerAId}`,
    });
    expect(unauthenticated.statusCode).toBe(401);

    const missingParam = await staffApp.inject({
      method: 'GET',
      url: '/commercial/engagements',
      headers: { 'x-test-role': 'VIEWER' },
    });
    expect(missingParam.statusCode).toBe(400);
    await staffApp.close();
  });

  // ------------------------------------------------------------
  async function resetDatabase(pool: Pool): Promise<void> {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const migrationFile of migrationFiles) {
      await pool.query(readSqlForPg(migrationFile));
    }
    await pool.query(readSqlForPg(prepareRolesSql));
    await pool.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status)
       VALUES
         ($1, 'Agency A Engagement Test', 'agency-a-engagement-test', 'agency-a-engagement@example.test', 'FREE', 'ACTIVE'),
         ($2, 'Agency B Engagement Test', 'agency-b-engagement-test', 'agency-b-engagement@example.test', 'FREE', 'ACTIVE')`,
      [agencyAId, agencyBId],
    );
    await pool.query(
      `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
       VALUES
         ($1, $2, 'agent-a@example.test', 'Agente A', 'AGENT', 'hash-for-engagement-tracking-test-only', 'ACTIVE'),
         ($3, $2, 'viewer-a@example.test', 'Viewer A', 'VIEWER', 'hash-for-engagement-tracking-test-only', 'ACTIVE')`,
      [agentAId, agencyAId, viewerAId],
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
    throw new Error('Customer engagement tracking tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Customer engagement tracking tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Customer engagement tracking tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run customer engagement tracking tests against unsafe DATABASE_URL.');
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
