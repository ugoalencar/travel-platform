import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { createDatabaseRuntime } from '../src/database';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-proposal-routes-postgres';
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

const principals: Record<string, AuthenticatedPrincipal> = {
  a: { userId: userAId, agencyId: agencyAId, role: UserRole.ADMIN, email: 'user-a@example.test' },
  b: { userId: userBId, agencyId: agencyBId, role: UserRole.ADMIN, email: 'user-b@example.test' },
  viewer: { userId: userAId, agencyId: agencyAId, role: UserRole.VIEWER, email: 'user-a@example.test' },
  agent: { userId: userAId, agencyId: agencyAId, role: UserRole.AGENT, email: 'user-a@example.test' },
  manager: { userId: userAId, agencyId: agencyAId, role: UserRole.MANAGER, email: 'user-a@example.test' },
  owner: { userId: userAId, agencyId: agencyAId, role: UserRole.OWNER, email: 'user-a@example.test' },
  unknownRole: {
    userId: userAId,
    agencyId: agencyAId,
    role: 'NOT_A_REAL_ROLE' as UserRole,
    email: 'user-a@example.test',
  },
  ownerAgencyB: { userId: userBId, agencyId: agencyBId, role: UserRole.OWNER, email: 'user-b@example.test' },
};

describe('Proposal HTTP routes', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let customerAId: string;
  let customerBId: string;

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
  });

  beforeEach(async () => {
    await adminPool.query('TRUNCATE TABLE proposals RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE offers RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE customers RESTART IDENTITY CASCADE');
    customerAId = await seedCustomer(agencyAId, 'Customer A');
    customerBId = await seedCustomer(agencyBId, 'Customer B');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  describe('GET /proposals', () => {
    it('returns 401 without auth', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({ method: 'GET', url: '/proposals' });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns only Agency A proposals for Agency A', async () => {
      await seedProposal(agencyAId, customerAId);
      await seedProposal(agencyBId, customerBId);

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/proposals',
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ proposals: Array<{ agencyId: string; customerName: string }> }>();
      expect(body.proposals).toHaveLength(1);
      expect(body.proposals[0]?.agencyId).toBe(agencyAId);
      expect(body.proposals[0]?.customerName).toBe('Customer A');

      await app.close();
    });
  });

  describe('GET /proposals/:id', () => {
    it('returns 200 for own tenant proposal, enriched with customer name', async () => {
      const id = await seedProposal(agencyAId, customerAId);

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/proposals/${id}`,
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ proposal: { id: string; status: string; customerName: string } }>();
      expect(body.proposal.id).toBe(id);
      expect(body.proposal.status).toBe('DRAFT');
      expect(body.proposal.customerName).toBe('Customer A');

      await app.close();
    });

    it('never returns another tenant proposal (404, no leak)', async () => {
      const bId = await seedProposal(agencyBId, customerBId);

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/proposals/${bId}`,
        headers: { 'x-test-principal': 'a' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Proposal not found', code: 'NOT_FOUND' });

      await app.close();
    });
  });

  describe('POST /proposals', () => {
    it('creates a proposal with server-computed total', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/proposals',
        headers: { 'x-test-principal': 'manager' },
        payload: { customerId: customerAId, proposedPrice: 100, discount: 10 },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{
        proposal: { agencyId: string; proposedPrice: number; discount: number; total: number; status: string };
      }>();
      expect(body.proposal.agencyId).toBe(agencyAId);
      expect(body.proposal.total).toBe(90);
      expect(body.proposal.status).toBe('DRAFT');

      await app.close();
    });

    it('returns 401 without auth', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/proposals',
        payload: { customerId: customerAId, proposedPrice: 100 },
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it.each(['agencyId', 'tenantId', 'id', 'createdAt', 'updatedAt', 'total', 'status', 'userId'] as const)(
      'rejects forbidden field "%s" with 400',
      async (field) => {
        const app = buildTestApp(runtimePool);
        const response = await app.inject({
          method: 'POST',
          url: '/proposals',
          headers: { 'x-test-principal': 'manager' },
          payload: { ...validProposalPayload(), [field]: field === 'total' ? 5 : 'x' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

        await app.close();
      },
    );

    it('rejects unknown field with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/proposals',
        headers: { 'x-test-principal': 'manager' },
        payload: { ...validProposalPayload(), notARealField: 'x' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('rejects a negative proposedPrice with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/proposals',
        headers: { 'x-test-principal': 'manager' },
        payload: { ...validProposalPayload(), proposedPrice: -10 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('rejects discount greater than proposedPrice with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/proposals',
        headers: { 'x-test-principal': 'manager' },
        payload: { ...validProposalPayload(), proposedPrice: 100, discount: 150 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('rejects missing proposedPrice with 400', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/proposals',
        headers: { 'x-test-principal': 'manager' },
        payload: { customerId: customerAId },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('rejects a customerId belonging to another tenant with 404 (no cross-tenant relation abuse)', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/proposals',
        headers: { 'x-test-principal': 'manager' },
        payload: { customerId: customerBId, proposedPrice: 100 },
      });

      expect(response.statusCode).toBe(404);

      await app.close();
    });
  });

  describe('PATCH /proposals/:id', () => {
    it('updates proposedPrice/discount and recomputes total', async () => {
      const id = await seedProposal(agencyAId, customerAId, { proposedPrice: '100.00', discount: '0.00' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/proposals/${id}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { proposedPrice: 200, discount: 20 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ proposal: { total: number } }>();
      expect(body.proposal.total).toBe(180);

      await app.close();
    });

    it('rejects setting status via PATCH with 400', async () => {
      const id = await seedProposal(agencyAId, customerAId);

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/proposals/${id}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { status: 'SENT' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it('rejects setting total via PATCH with 400', async () => {
      const id = await seedProposal(agencyAId, customerAId);

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/proposals/${id}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { total: 5 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      await app.close();
    });

    it.each(['customerId', 'offerId', 'wishId'] as const)(
      'rejects re-parenting field "%s" on update with 400',
      async (field) => {
        const id = await seedProposal(agencyAId, customerAId);

        const app = buildTestApp(runtimePool);
        const response = await app.inject({
          method: 'PATCH',
          url: `/proposals/${id}`,
          headers: { 'x-test-principal': 'manager' },
          payload: { [field]: customerAId },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

        await app.close();
      },
    );

    it('never mutates another tenant proposal (404, no-op)', async () => {
      const bId = await seedProposal(agencyBId, customerBId, { proposedPrice: '50.00' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/proposals/${bId}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { proposedPrice: 999 },
      });

      expect(response.statusCode).toBe(404);

      const row = await adminPool.query<{ proposed_price: string }>(
        'SELECT proposed_price FROM proposals WHERE id = $1',
        [bId],
      );
      expect(row.rows[0]?.proposed_price).toBe('50.00');

      await app.close();
    });
  });

  describe('Proposal lifecycle actions', () => {
    it('supports valid transitions and idempotent replay without creating a Sale', async () => {
      const draftToSent = await seedProposal(agencyAId, customerAId);
      const draftToCancelled = await seedProposal(agencyAId, customerAId);
      const sentToAccepted = await seedProposal(agencyAId, customerAId, { status: 'SENT' });
      const sentToDeclined = await seedProposal(agencyAId, customerAId, { status: 'SENT' });

      const app = buildTestApp(runtimePool);

      const send = await app.inject({
        method: 'POST',
        url: `/proposals/${draftToSent}/send`,
        headers: { 'x-test-principal': 'manager' },
      });
      expect(send.statusCode).toBe(200);
      expect(send.json<{ proposal: { status: string } }>().proposal.status).toBe('SENT');

      const sendAgain = await app.inject({
        method: 'POST',
        url: `/proposals/${draftToSent}/send`,
        headers: { 'x-test-principal': 'manager' },
      });
      expect(sendAgain.statusCode).toBe(200);
      expect(sendAgain.json<{ proposal: { status: string } }>().proposal.status).toBe('SENT');

      const cancelDraft = await app.inject({
        method: 'POST',
        url: `/proposals/${draftToCancelled}/cancel`,
        headers: { 'x-test-principal': 'manager' },
      });
      expect(cancelDraft.statusCode).toBe(200);
      expect(cancelDraft.json<{ proposal: { status: string } }>().proposal.status).toBe('CANCELLED');

      const accept = await app.inject({
        method: 'POST',
        url: `/proposals/${sentToAccepted}/accept`,
        headers: { 'x-test-principal': 'manager' },
      });
      expect(accept.statusCode).toBe(200);
      expect(accept.json<{ proposal: { status: string } }>().proposal.status).toBe('ACCEPTED');

      const decline = await app.inject({
        method: 'POST',
        url: `/proposals/${sentToDeclined}/decline`,
        headers: { 'x-test-principal': 'manager' },
      });
      expect(decline.statusCode).toBe(200);
      expect(decline.json<{ proposal: { status: string } }>().proposal.status).toBe('DECLINED');

      const salesCount = await adminPool.query<{ count: string }>(
        'SELECT count(*) FROM sales WHERE proposal_id = $1',
        [sentToAccepted],
      );
      expect(salesCount.rows[0]?.count).toBe('0');

      await app.close();
    });

    it('rejects invalid transitions and arbitrary status PATCH', async () => {
      const draftId = await seedProposal(agencyAId, customerAId);
      const acceptedId = await seedProposal(agencyAId, customerAId, { status: 'ACCEPTED' });

      const app = buildTestApp(runtimePool);

      const acceptDraft = await app.inject({
        method: 'POST',
        url: `/proposals/${draftId}/accept`,
        headers: { 'x-test-principal': 'manager' },
      });
      expect(acceptDraft.statusCode).toBe(409);

      const cancelAccepted = await app.inject({
        method: 'POST',
        url: `/proposals/${acceptedId}/cancel`,
        headers: { 'x-test-principal': 'manager' },
      });
      expect(cancelAccepted.statusCode).toBe(409);

      const statusPatch = await app.inject({
        method: 'PATCH',
        url: `/proposals/${draftId}`,
        headers: { 'x-test-principal': 'manager' },
        payload: { status: 'ACCEPTED' },
      });
      expect(statusPatch.statusCode).toBe(400);

      await app.close();
    });

    it('enforces RBAC and tenant isolation on lifecycle actions', async () => {
      const aId = await seedProposal(agencyAId, customerAId);
      const bId = await seedProposal(agencyBId, customerBId);

      const app = buildTestApp(runtimePool);

      const viewerSend = await app.inject({
        method: 'POST',
        url: `/proposals/${aId}/send`,
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(viewerSend.statusCode).toBe(403);

      const crossTenant = await app.inject({
        method: 'POST',
        url: `/proposals/${bId}/send`,
        headers: { 'x-test-principal': 'owner' },
      });
      expect(crossTenant.statusCode).toBe(404);

      await app.close();
    });
  });

  describe('RBAC', () => {
    it('allows VIEWER to GET /proposals and GET /proposals/:id', async () => {
      const id = await seedProposal(agencyAId, customerAId);

      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: '/proposals',
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(list.statusCode).toBe(200);

      const get = await app.inject({
        method: 'GET',
        url: `/proposals/${id}`,
        headers: { 'x-test-principal': 'viewer' },
      });
      expect(get.statusCode).toBe(200);

      await app.close();
    });

    it('blocks VIEWER from POST /proposals and PATCH /proposals/:id with 403', async () => {
      const id = await seedProposal(agencyAId, customerAId);

      const app = buildTestApp(runtimePool);

      const create = await app.inject({
        method: 'POST',
        url: '/proposals',
        headers: { 'x-test-principal': 'viewer' },
        payload: validProposalPayload(),
      });
      expect(create.statusCode).toBe(403);
      expect(create.json()).toMatchObject({ code: 'FORBIDDEN' });

      const update = await app.inject({
        method: 'PATCH',
        url: `/proposals/${id}`,
        headers: { 'x-test-principal': 'viewer' },
        payload: { proposedPrice: 1 },
      });
      expect(update.statusCode).toBe(403);

      await app.close();
    });

    it('blocks AGENT from POST /proposals and PATCH /proposals/:id with 403 (Proposal write floor is MANAGER)', async () => {
      const id = await seedProposal(agencyAId, customerAId);

      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: '/proposals',
        headers: { 'x-test-principal': 'agent' },
      });
      expect(list.statusCode).toBe(200);

      const create = await app.inject({
        method: 'POST',
        url: '/proposals',
        headers: { 'x-test-principal': 'agent' },
        payload: validProposalPayload(),
      });
      expect(create.statusCode).toBe(403);

      const update = await app.inject({
        method: 'PATCH',
        url: `/proposals/${id}`,
        headers: { 'x-test-principal': 'agent' },
        payload: { proposedPrice: 1 },
      });
      expect(update.statusCode).toBe(403);

      await app.close();
    });

    it.each(['manager', 'owner'] as const)(
      'allows %s to read and write via hierarchy inheritance',
      async (principalKey) => {
        const app = buildTestApp(runtimePool);

        const list = await app.inject({
          method: 'GET',
          url: '/proposals',
          headers: { 'x-test-principal': principalKey },
        });
        expect(list.statusCode).toBe(200);

        const create = await app.inject({
          method: 'POST',
          url: '/proposals',
          headers: { 'x-test-principal': principalKey },
          payload: validProposalPayload(),
        });
        expect(create.statusCode).toBe(201);
        const createdId = create.json<{ proposal: { id: string } }>().proposal.id;

        const update = await app.inject({
          method: 'PATCH',
          url: `/proposals/${createdId}`,
          headers: { 'x-test-principal': principalKey },
          payload: { notes: `${principalKey} note` },
        });
        expect(update.statusCode).toBe(200);

        await app.close();
      },
    );

    it('fails closed for an unknown/invalid role on both read and write routes', async () => {
      const id = await seedProposal(agencyAId, customerAId);

      const app = buildTestApp(runtimePool);

      const list = await app.inject({
        method: 'GET',
        url: '/proposals',
        headers: { 'x-test-principal': 'unknownRole' },
      });
      expect(list.statusCode).toBe(403);

      const get = await app.inject({
        method: 'GET',
        url: `/proposals/${id}`,
        headers: { 'x-test-principal': 'unknownRole' },
      });
      expect(get.statusCode).toBe(403);

      const create = await app.inject({
        method: 'POST',
        url: '/proposals',
        headers: { 'x-test-principal': 'unknownRole' },
        payload: validProposalPayload(),
      });
      expect(create.statusCode).toBe(403);

      await app.close();
    });

    it('keeps a high role from Agency A blocked from Agency B proposals (role does not bypass tenant isolation)', async () => {
      const bId = await seedProposal(agencyBId, customerBId, { proposedPrice: '77.00' });

      const app = buildTestApp(runtimePool);

      const get = await app.inject({
        method: 'GET',
        url: `/proposals/${bId}`,
        headers: { 'x-test-principal': 'owner' },
      });
      expect(get.statusCode).toBe(404);

      const patch = await app.inject({
        method: 'PATCH',
        url: `/proposals/${bId}`,
        headers: { 'x-test-principal': 'owner' },
        payload: { proposedPrice: 1 },
      });
      expect(patch.statusCode).toBe(404);

      const row = await adminPool.query<{ proposed_price: string }>(
        'SELECT proposed_price FROM proposals WHERE id = $1',
        [bId],
      );
      expect(row.rows[0]?.proposed_price).toBe('77.00');

      await app.close();
    });

    it('lets Agency B OWNER read only Agency B data, never Agency A', async () => {
      const aId = await seedProposal(agencyAId, customerAId);

      const app = buildTestApp(runtimePool);

      const get = await app.inject({
        method: 'GET',
        url: `/proposals/${aId}`,
        headers: { 'x-test-principal': 'ownerAgencyB' },
      });
      expect(get.statusCode).toBe(404);

      await app.close();
    });
  });

  function validProposalPayload(overrides: Partial<{ proposedPrice: number; discount: number }> = {}) {
    return {
      customerId: customerAId,
      proposedPrice: overrides.proposedPrice ?? 100,
      ...(overrides.discount !== undefined ? { discount: overrides.discount } : {}),
    };
  }

  function buildTestApp(pool: Pool) {
    return buildApp({
      authProvider: {
        authenticate(request) {
          const key = request.headers['x-test-principal'];
          return Promise.resolve(typeof key === 'string' ? principals[key] ?? null : null);
        },
      },
      validateUserAgencyAccess(userId, agencyId) {
        return Promise.resolve(
          (userId === userAId && agencyId === agencyAId) ||
            (userId === userBId && agencyId === agencyBId),
        );
      },
      database: createDatabaseRuntime(pool),
    });
  }

  async function seedCustomer(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
      [agencyId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed customer');
    return id;
  }

  async function seedProposal(
    agencyId: string,
    customerId: string,
    data: { proposedPrice?: string; discount?: string; status?: string } = {},
  ): Promise<string> {
    const proposedPrice = data.proposedPrice ?? '100.00';
    const discount = data.discount ?? '0.00';
    const total = (Number(proposedPrice) - Number(discount)).toFixed(2);
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO proposals (agency_id, customer_id, proposed_price, discount, total, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [agencyId, customerId, proposedPrice, discount, total, data.status ?? 'DRAFT'],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed proposal');
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Proposal route tests require localhost only.');
  }

  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Proposal route tests require a safe local database test port.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Proposal route tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run proposal route tests against unsafe DATABASE_URL.');
    }
  }
}

function resetDisposableDatabase(): void {
  if (process.env.CI === 'true') return;
  compose(['down', '-v']);
  compose(['up', '-d']);
}

function compose(args: readonly string[]): CommandResult {
  return run('docker', ['compose', '-f', composeFile, '-p', projectName, ...args]);
}

async function waitForHealthyContainer(): Promise<void> {
  if (process.env.CI === 'true') return;
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
        ($1, 'Agency A', 'agency-a-proposal-routes-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-proposal-routes-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-proposal-routes-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-proposal-routes-test-only', 'ACTIVE');
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
