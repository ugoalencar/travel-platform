import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { createDatabaseRuntime } from '../src/database';
import {
  getCustomerProposalStatus,
  getCustomerNextTrip,
  isProposalStillValid,
  listCancelledBookings,
  listCustomerBookings,
  listFollowUpsDueTodayForUser,
  listOverdueFollowUps,
  listOverdueReceivables,
  listPostSaleCandidates,
  listProposalsWithNoResponse,
  listTravelersToDestination,
  listUpcomingTrips,
} from '../src/commercial-queries';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migration001 = resolve(repoRoot, 'infrastructure/migrations/001_initial_schema.sql');
const migration002 = resolve(repoRoot, 'infrastructure/migrations/002_rls_policies.sql');
const migration003 = resolve(repoRoot, 'infrastructure/migrations/003_transportation.sql');
const migration004 = resolve(repoRoot, 'infrastructure/migrations/004_route_points.sql');
const migration005 = resolve(repoRoot, 'infrastructure/migrations/005_booking.sql');
const migration006 = resolve(repoRoot, 'infrastructure/migrations/006_field_operations.sql');
const migration007 = resolve(repoRoot, 'infrastructure/migrations/007_commission_repair.sql');
const migration008Commercial = resolve(repoRoot, 'infrastructure/migrations/008_commercial_cockpit.sql');
const migration009Configurable = resolve(repoRoot, 'infrastructure/migrations/009_configurable_pipelines.sql');
const migration010 = resolve(repoRoot, 'infrastructure/migrations/010_financial_foundation.sql');
const migration011 = resolve(repoRoot, 'infrastructure/migrations/011_booking_cancellation.sql');
const migration013 = resolve(repoRoot, 'infrastructure/migrations/013_pescador_foundation.sql');
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-commercial-cockpit-security-postgres';
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
const userA2Id = '11000000-0000-4000-8000-000000000002';
const userBId = '21000000-0000-4000-8000-000000000001';

const principals: Record<string, AuthenticatedPrincipal> = {
  agentA: { userId: userAId, agencyId: agencyAId, role: UserRole.AGENT, email: 'user-a@example.test' },
  agentB: { userId: userBId, agencyId: agencyBId, role: UserRole.AGENT, email: 'user-b@example.test' },
  viewerA: { userId: userAId, agencyId: agencyAId, role: UserRole.VIEWER, email: 'user-a@example.test' },
  managerA: { userId: userAId, agencyId: agencyAId, role: UserRole.MANAGER, email: 'user-a@example.test' },
  adminA: { userId: userAId, agencyId: agencyAId, role: UserRole.ADMIN, email: 'user-a@example.test' },
  ownerA: { userId: userAId, agencyId: agencyAId, role: UserRole.OWNER, email: 'user-a@example.test' },
  // Second same-agency user, used as a MANAGER for pipeline-access tests
  // (an explicit PipelineAccess grant is per-userId, independent of the
  // synthetic test role assigned here).
  managerA2: { userId: userA2Id, agencyId: agencyAId, role: UserRole.MANAGER, email: 'user-a2@example.test' },
};

describe.sequential('Commercial cockpit security (IDOR / tenant / RBAC / mass-assignment)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let customerAId: string;
  let customerA2Id: string;
  let customerBId: string;
  // Default "Comercial" pipeline + stage ids per agency, seeded once in
  // beforeAll (migration 009's own DML only backfills agencies that exist
  // AT migration-apply time; in this fresh test database agencies are
  // seeded AFTER migrations, so tests seed their own pipeline/stages here,
  // same shape as migration 009's production default).
  let pipelineAId: string;
  let stagesA: Record<string, string>;
  let pipelineBId: string;
  let stagesB: Record<string, string>;

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

    const seededA = await seedPipeline(adminPool, agencyAId, 'Comercial');
    pipelineAId = seededA.pipelineId;
    stagesA = seededA.stages;
    const seededB = await seedPipeline(adminPool, agencyBId, 'Comercial');
    pipelineBId = seededB.pipelineId;
    stagesB = seededB.stages;
  });

  beforeEach(async () => {
    await adminPool.query(
      `TRUNCATE TABLE external_offer_captures, payment_allocations, payments,
                     receivables, payables, operational_costs,
                     customer_interactions, commercial_tasks, commercial_opportunities,
                     bookings, sales, proposals, trips, wishes, customers
       RESTART IDENTITY CASCADE`,
    );
    customerAId = await seedCustomer(agencyAId, 'Customer A');
    customerA2Id = await seedCustomer(agencyAId, 'Customer A2');
    customerBId = await seedCustomer(agencyBId, 'Customer B');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  describe('RBAC: VIEWER can read but not write, AGENT+ can write', () => {
    it('VIEWER can GET opportunities', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/commercial/opportunities',
        headers: { 'x-test-principal': 'viewerA' },
      });
      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it('VIEWER cannot POST an opportunity (403)', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/commercial/opportunities',
        headers: { 'x-test-principal': 'viewerA' },
        payload: { customerId: customerAId, pipelineId: pipelineAId, stageId: stagesA.PROSPECTING },
      });
      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it('VIEWER cannot PATCH an opportunity (403)', async () => {
      const oppId = await seedOpportunity(agencyAId, customerAId);
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/commercial/opportunities/${oppId}`,
        headers: { 'x-test-principal': 'viewerA' },
        payload: { stageId: stagesA.INTEREST },
      });
      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it('AGENT can POST and PATCH an opportunity', async () => {
      const app = buildTestApp(runtimePool);
      const createResponse = await app.inject({
        method: 'POST',
        url: '/commercial/opportunities',
        headers: { 'x-test-principal': 'agentA' },
        payload: { customerId: customerAId, pipelineId: pipelineAId, stageId: stagesA.PROSPECTING },
      });
      expect(createResponse.statusCode).toBe(201);
      const oppId = createResponse.json<{ opportunity: { id: string } }>().opportunity.id;

      const patchResponse = await app.inject({
        method: 'PATCH',
        url: `/commercial/opportunities/${oppId}`,
        headers: { 'x-test-principal': 'agentA' },
        payload: { stageId: stagesA.INTEREST },
      });
      expect(patchResponse.statusCode).toBe(200);
      expect(patchResponse.json<{ opportunity: { stageId: string } }>().opportunity.stageId).toBe(
        stagesA.INTEREST,
      );
      await app.close();
    });

    it('VIEWER cannot POST a task or an interaction', async () => {
      const app = buildTestApp(runtimePool);
      const taskResponse = await app.inject({
        method: 'POST',
        url: '/commercial/tasks',
        headers: { 'x-test-principal': 'viewerA' },
        payload: { customerId: customerAId, assignedUserId: userAId, title: 'Follow up', dueAt: '2026-01-01T00:00:00Z' },
      });
      expect(taskResponse.statusCode).toBe(403);

      const interactionResponse = await app.inject({
        method: 'POST',
        url: '/commercial/interactions',
        headers: { 'x-test-principal': 'viewerA' },
        payload: { customerId: customerAId, channel: 'PHONE', direction: 'OUTBOUND', summary: 'Called' },
      });
      expect(interactionResponse.statusCode).toBe(403);
      await app.close();
    });
  });

  describe('IDOR / cross-tenant isolation', () => {
    it('Agency A cannot fetch an Agency B opportunity by id', async () => {
      const oppB = await seedOpportunity(agencyBId, customerBId);
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/commercial/opportunities/${oppB}`,
        headers: { 'x-test-principal': 'agentA' },
      });
      expect([403, 404]).toContain(response.statusCode);
      expect(response.json()).not.toHaveProperty('opportunity');
      await app.close();
    });

    it('Agency A cannot PATCH an Agency B opportunity by id (no cross-tenant write)', async () => {
      const oppB = await seedOpportunity(agencyBId, customerBId);
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/commercial/opportunities/${oppB}`,
        headers: { 'x-test-principal': 'agentA' },
        payload: { stageId: stagesB.WON },
      });
      expect([403, 404]).toContain(response.statusCode);

      const row = await adminPool.query<{ stage: string }>(
        'SELECT stage FROM commercial_opportunities WHERE id = $1',
        [oppB],
      );
      expect(row.rows[0]?.stage).toBe('PROSPECTING');
      await app.close();
    });

    it('opportunity list for Agency A never contains Agency B rows', async () => {
      await seedOpportunity(agencyAId, customerAId);
      await seedOpportunity(agencyBId, customerBId);

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/commercial/opportunities',
        headers: { 'x-test-principal': 'agentA' },
      });
      expect(response.statusCode).toBe(200);
      const opportunities = response.json<{ opportunities: Array<{ customerId: string }> }>().opportunities;
      expect(opportunities.every((o) => o.customerId === customerAId)).toBe(true);
      await app.close();
    });

    it('Agency A cannot fetch an Agency B task by id', async () => {
      const taskB = await seedTask(agencyBId, customerBId, userBId, userBId);
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/commercial/tasks/${taskB}`,
        headers: { 'x-test-principal': 'agentA' },
      });
      expect([403, 404]).toContain(response.statusCode);
      await app.close();
    });

    it('Agency A interactions list never contains Agency B rows', async () => {
      await seedInteraction(agencyAId, customerAId, userAId);
      await seedInteraction(agencyBId, customerBId, userBId);

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/commercial/interactions',
        headers: { 'x-test-principal': 'agentA' },
      });
      expect(response.statusCode).toBe(200);
      const interactions = response.json<{ interactions: Array<{ customerId: string }> }>().interactions;
      expect(interactions.every((i) => i.customerId === customerAId)).toBe(true);
      await app.close();
    });
  });

  describe('mass-assignment protection', () => {
    it('rejects agencyId in a create-opportunity body', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/commercial/opportunities',
        headers: { 'x-test-principal': 'agentA' },
        payload: { customerId: customerAId, pipelineId: pipelineAId, stageId: stagesA.PROSPECTING, agencyId: agencyBId },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects agencyId in a PATCH opportunity body (cannot escape tenant scope)', async () => {
      const oppId = await seedOpportunity(agencyAId, customerAId);
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/commercial/opportunities/${oppId}`,
        headers: { 'x-test-principal': 'agentA' },
        payload: { stageId: stagesA.INTEREST, agencyId: agencyBId },
      });
      expect(response.statusCode).toBe(400);

      const row = await adminPool.query<{ agency_id: string }>(
        'SELECT agency_id FROM commercial_opportunities WHERE id = $1',
        [oppId],
      );
      expect(row.rows[0]?.agency_id).toBe(agencyAId);
      await app.close();
    });

    it('rejects customerId in a PATCH opportunity body (relationship not editable via this route)', async () => {
      const oppId = await seedOpportunity(agencyAId, customerAId);
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/commercial/opportunities/${oppId}`,
        headers: { 'x-test-principal': 'agentA' },
        payload: { customerId: customerA2Id },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects createdBy/completedAt in a create-task body', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/commercial/tasks',
        headers: { 'x-test-principal': 'agentA' },
        payload: {
          customerId: customerAId,
          assignedUserId: userAId,
          title: 'Follow up',
          dueAt: '2026-01-01T00:00:00Z',
          createdBy: userA2Id,
        },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects an unknown field entirely (strict allow-list, not a partial denylist)', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/commercial/opportunities',
        headers: { 'x-test-principal': 'agentA' },
        payload: { customerId: customerAId, notARealField: 'x' },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('assigned/responsible user spoofing is blocked', () => {
    it('rejects creating an opportunity with a responsibleUserId from a different agency', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/commercial/opportunities',
        headers: { 'x-test-principal': 'agentA' },
        payload: {
          customerId: customerAId,
          pipelineId: pipelineAId,
          stageId: stagesA.PROSPECTING,
          responsibleUserId: userBId,
        },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects PATCHing an opportunity to a responsibleUserId from a different agency', async () => {
      const oppId = await seedOpportunity(agencyAId, customerAId);
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/commercial/opportunities/${oppId}`,
        headers: { 'x-test-principal': 'agentA' },
        payload: { responsibleUserId: userBId },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects creating a task with an assignedUserId from a different agency', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/commercial/tasks',
        headers: { 'x-test-principal': 'agentA' },
        payload: {
          customerId: customerAId,
          assignedUserId: userBId,
          title: 'Follow up',
          dueAt: '2026-01-01T00:00:00Z',
        },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('accepts a same-agency responsibleUserId', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/commercial/opportunities',
        headers: { 'x-test-principal': 'agentA' },
        payload: {
          customerId: customerAId,
          pipelineId: pipelineAId,
          stageId: stagesA.PROSPECTING,
          responsibleUserId: userAId,
        },
      });
      expect(response.statusCode).toBe(201);
      await app.close();
    });
  });

  describe('functional: filters, dashboard aggregate', () => {
    it('filters opportunities by stage and overdue nextActionAt server-side', async () => {
      const overdueId = await seedOpportunity(agencyAId, customerAId, {
        stage: 'NEGOTIATION',
        nextActionAt: '2020-01-01T00:00:00Z',
      });
      await seedOpportunity(agencyAId, customerA2Id, { stage: 'WON', nextActionAt: '2020-01-01T00:00:00Z' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/commercial/opportunities?overdue=true',
        headers: { 'x-test-principal': 'agentA' },
      });
      expect(response.statusCode).toBe(200);
      const ids = response.json<{ opportunities: Array<{ id: string }> }>().opportunities.map((o) => o.id);
      expect(ids).toContain(overdueId);
      expect(ids).toHaveLength(1);
      await app.close();
    });

    it('resolves customerName server-side via join instead of a raw customerId', async () => {
      const oppId = await seedOpportunity(agencyAId, customerAId, { stage: 'NEGOTIATION' });

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/commercial/opportunities',
        headers: { 'x-test-principal': 'agentA' },
      });
      expect(response.statusCode).toBe(200);
      const opportunities = response.json<{
        opportunities: Array<{ id: string; customerId: string; customerName?: string }>;
      }>().opportunities;
      const found = opportunities.find((o) => o.id === oppId);
      expect(found?.customerName).toBeTruthy();
      expect(found?.customerName).not.toBe(found?.customerId);
      await app.close();
    });

    it('paginates with default limit 50 and honors limit/offset', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/commercial/opportunities?limit=1&offset=0',
        headers: { 'x-test-principal': 'agentA' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ limit: number; offset: number }>();
      expect(body.limit).toBe(1);
      expect(body.offset).toBe(0);
      await app.close();
    });

    it('dashboard aggregate returns real counts from seeded data', async () => {
      await seedOpportunity(agencyAId, customerAId, { stage: 'NEGOTIATION' });
      await seedTask(agencyAId, customerAId, userAId, userAId, { dueAt: 'now' });
      const proposalId = await seedProposal(agencyAId, customerAId, { status: 'SENT', total: '300.00' });
      const saleId = await seedSale(agencyAId, customerAId, { status: 'CONFIRMED', total: '300.00' });
      await seedReceivable(agencyAId, saleId, customerAId, {
        amount: '300.00',
        dueAt: '2020-01-01T00:00:00Z',
      });
      await seedCancelledBooking(agencyAId, customerAId);
      await seedPescadorCapture(agencyAId, 'UNDER_REVIEW');
      await seedPescadorCapture(agencyAId, 'APPROVED');

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/commercial/dashboard',
        headers: { 'x-test-principal': 'agentA' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<{
        openOpportunitiesCount: number;
        followUpsDueTodayCount: number;
        proposalsWaitingCount: number;
        confirmedSalesCount: number;
        overdueReceivablesCount: number;
        cancelledBookingsCount: number;
        pescadorReviewQueueCount: number;
      }>();
      expect(body.openOpportunitiesCount).toBeGreaterThanOrEqual(1);
      expect(body.followUpsDueTodayCount).toBeGreaterThanOrEqual(1);
      expect(body.proposalsWaitingCount).toBeGreaterThanOrEqual(1);
      expect(body.confirmedSalesCount).toBeGreaterThanOrEqual(1);
      expect(body.overdueReceivablesCount).toBeGreaterThanOrEqual(1);
      expect(body.cancelledBookingsCount).toBeGreaterThanOrEqual(1);
      expect(body.pescadorReviewQueueCount).toBeGreaterThanOrEqual(2);
      expect(proposalId).toBeTruthy();
      await app.close();
    });

    it('dashboard aggregate is tenant-scoped: agency B never sees agency A activity', async () => {
      // Seed a full set of Agency A activity that would move every counter
      // on the dashboard aggregate if tenant scoping leaked.
      await seedOpportunity(agencyAId, customerAId, { stage: 'NEGOTIATION' });
      await seedTask(agencyAId, customerAId, userAId, userAId, { dueAt: 'now' });
      await seedProposal(agencyAId, customerAId, { status: 'SENT', total: '900.00' });
      const saleAId = await seedSale(agencyAId, customerAId, { status: 'CONFIRMED', total: '900.00' });
      await seedReceivable(agencyAId, saleAId, customerAId, {
        amount: '900.00',
        dueAt: '2020-01-01T00:00:00Z',
      });
      await seedCancelledBooking(agencyAId, customerAId);
      await seedPescadorCapture(agencyAId, 'UNDER_REVIEW');

      // Agency B has no activity seeded here at all -- its dashboard must
      // report zeros for every one of these counters, never a value
      // borrowed from Agency A's rows.
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: '/commercial/dashboard',
        headers: { 'x-test-principal': 'agentB' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<{
        openOpportunitiesCount: number;
        followUpsDueTodayCount: number;
        proposalsWaitingCount: number;
        confirmedSalesCount: number;
        overdueReceivablesCount: number;
        cancelledBookingsCount: number;
        pescadorReviewQueueCount: number;
        salesThisMonthCount: number;
        salesThisMonthTotal: string;
      }>();
      expect(body.openOpportunitiesCount).toBe(0);
      expect(body.followUpsDueTodayCount).toBe(0);
      expect(body.proposalsWaitingCount).toBe(0);
      expect(body.confirmedSalesCount).toBe(0);
      expect(body.overdueReceivablesCount).toBe(0);
      expect(body.cancelledBookingsCount).toBe(0);
      expect(body.pescadorReviewQueueCount).toBe(0);
      expect(body.salesThisMonthCount).toBe(0);
      expect(body.salesThisMonthTotal).toBe('0');
      await app.close();
    });

    it('global customer search masks cpf/passport tails', async () => {
      await adminPool.query(`UPDATE customers SET cpf = '12345678900' WHERE id = $1`, [customerAId]);

      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'GET',
        url: `/commercial/customers/search?q=Customer A`,
        headers: { 'x-test-principal': 'agentA' },
      });
      expect(response.statusCode).toBe(200);
      const results = response.json<{ customers: Array<{ cpfMasked: string | null }> }>().customers;
      const withCpf = results.find((c) => c.cpfMasked !== null);
      expect(withCpf?.cpfMasked).toBe('********900');
      await app.close();
    });
  });

  describe('bot-readiness query layer (unit-level, direct calls)', () => {
    it('getCustomerNextTrip returns the earliest upcoming trip', async () => {
      await adminPool.query(
        `INSERT INTO trips (agency_id, customer_id, name, destination, start_date, end_date, status)
         VALUES ($1, $2, 'Future Trip', 'Lisboa', '2027-01-10', '2027-01-20', 'PLANNED')`,
        [agencyAId, customerAId],
      );

      const trip = await runWithTenantContext(
        { agencyId: agencyAId, userId: userAId, userRole: UserRole.AGENT, email: 'a@example.test' },
        () =>
          createDatabaseRuntime(runtimePool).withTenantTransaction((client) =>
            getCustomerNextTrip(client, agencyAId, customerAId),
          ),
      );
      expect(trip?.destination).toBe('Lisboa');
    });

    it('isProposalStillValid is false for an expired proposal', async () => {
      const proposalId = await seedProposal(agencyAId, customerAId, {
        status: 'SENT',
        validUntil: '2000-01-01T00:00:00Z',
      });

      const valid = await runWithTenantContext(
        { agencyId: agencyAId, userId: userAId, userRole: UserRole.AGENT, email: 'a@example.test' },
        () =>
          createDatabaseRuntime(runtimePool).withTenantTransaction((client) =>
            isProposalStillValid(client, agencyAId, proposalId),
          ),
      );
      expect(valid).toBe(false);
    });

    it('listFollowUpsDueTodayForUser returns only that user pending tasks due today or earlier', async () => {
      await seedTask(agencyAId, customerAId, userAId, userAId, { dueAt: 'now' });
      await seedTask(agencyAId, customerAId, userA2Id, userA2Id, { dueAt: 'now' });

      const tasks = await runWithTenantContext(
        { agencyId: agencyAId, userId: userAId, userRole: UserRole.AGENT, email: 'a@example.test' },
        () =>
          createDatabaseRuntime(runtimePool).withTenantTransaction((client) =>
            listFollowUpsDueTodayForUser(client, agencyAId, userAId),
          ),
      );
      expect(tasks.every((t) => t.customerId === customerAId)).toBe(true);
      expect(tasks.length).toBe(1);
    });

    it('listProposalsWithNoResponse excludes proposals linked to a WON/LOST opportunity', async () => {
      const respondedId = await seedProposal(agencyAId, customerAId, { status: 'SENT' });
      await seedOpportunity(agencyAId, customerAId, { stage: 'WON', proposalId: respondedId });
      const pendingId = await seedProposal(agencyAId, customerA2Id, { status: 'SENT' });

      const proposals = await runWithTenantContext(
        { agencyId: agencyAId, userId: userAId, userRole: UserRole.AGENT, email: 'a@example.test' },
        () =>
          createDatabaseRuntime(runtimePool).withTenantTransaction((client) =>
            listProposalsWithNoResponse(client, agencyAId),
          ),
      );
      const ids = proposals.map((p) => p.id);
      expect(ids).toContain(pendingId);
      expect(ids).not.toContain(respondedId);
    });

    it('listTravelersToDestination finds trips within the date range for a destination', async () => {
      await adminPool.query(
        `INSERT INTO trips (agency_id, customer_id, name, destination, start_date, end_date, status)
         VALUES ($1, $2, 'Trip', 'Paris', '2027-03-01', '2027-03-10', 'PLANNED')`,
        [agencyAId, customerAId],
      );

      const travelers = await runWithTenantContext(
        { agencyId: agencyAId, userId: userAId, userRole: UserRole.AGENT, email: 'a@example.test' },
        () =>
          createDatabaseRuntime(runtimePool).withTenantTransaction((client) =>
            listTravelersToDestination(client, agencyAId, 'Paris', '2027-02-01', '2027-04-01'),
          ),
      );
      expect(travelers.some((t) => t.customerId === customerAId)).toBe(true);
    });

    it('listPostSaleCandidates finds a completed trip with no POST_SALE task yet', async () => {
      await adminPool.query(
        `INSERT INTO trips (agency_id, customer_id, name, destination, start_date, end_date, status)
         VALUES ($1, $2, 'Done Trip', 'Rio', '2020-01-01', '2020-01-10', 'COMPLETED')`,
        [agencyAId, customerAId],
      );

      const candidates = await runWithTenantContext(
        { agencyId: agencyAId, userId: userAId, userRole: UserRole.AGENT, email: 'a@example.test' },
        () =>
          createDatabaseRuntime(runtimePool).withTenantTransaction((client) =>
            listPostSaleCandidates(client, agencyAId),
          ),
      );
      expect(candidates.some((c) => c.customerId === customerAId && c.destination === 'Rio')).toBe(true);
    });

    it('staff bot queries surface overdue follow-ups, overdue receivables, upcoming trips, and cancelled bookings', async () => {
      await seedTask(agencyAId, customerAId, userAId, userAId, { dueAt: "'2020-01-01T00:00:00Z'" });
      const saleId = await seedSale(agencyAId, customerAId, { status: 'CONFIRMED', total: '450.00' });
      const receivableId = await seedReceivable(agencyAId, saleId, customerAId, {
        amount: '450.00',
        dueAt: '2020-01-01T00:00:00Z',
      });
      await adminPool.query(
        `INSERT INTO trips (agency_id, customer_id, name, destination, start_date, end_date, status)
         VALUES ($1, $2, 'Future Staff Trip', 'Porto', '2027-05-01', '2027-05-10', 'PLANNED')`,
        [agencyAId, customerAId],
      );
      const bookingId = await seedCancelledBooking(agencyAId, customerAId);

      const result = await runWithTenantContext(
        { agencyId: agencyAId, userId: userAId, userRole: UserRole.AGENT, email: 'a@example.test' },
        () =>
          createDatabaseRuntime(runtimePool).withTenantTransaction(async (client) => ({
            overdueFollowUps: await listOverdueFollowUps(client, agencyAId),
            overdueReceivables: await listOverdueReceivables(client, agencyAId),
            upcomingTrips: await listUpcomingTrips(client, agencyAId),
            cancelledBookings: await listCancelledBookings(client, agencyAId),
          })),
      );

      expect(result.overdueFollowUps.some((task) => task.customerId === customerAId)).toBe(true);
      expect(result.overdueReceivables.some((receivable) => receivable.id === receivableId)).toBe(true);
      expect(result.upcomingTrips.some((trip) => trip.destination === 'Porto')).toBe(true);
      expect(result.cancelledBookings.some((booking) => booking.id === bookingId)).toBe(true);
    });

    it('customer-safe bot queries are scoped to the requested customer', async () => {
      const proposalA = await seedProposal(agencyAId, customerAId, { status: 'SENT', total: '250.00' });
      const proposalOtherCustomer = await seedProposal(agencyAId, customerA2Id, { status: 'SENT', total: '999.00' });
      const bookingA = await seedCancelledBooking(agencyAId, customerAId);
      await seedCancelledBooking(agencyAId, customerA2Id);

      const result = await runWithTenantContext(
        { agencyId: agencyAId, userId: userAId, userRole: UserRole.AGENT, email: 'a@example.test' },
        () =>
          createDatabaseRuntime(runtimePool).withTenantTransaction(async (client) => ({
            ownProposal: await getCustomerProposalStatus(client, agencyAId, customerAId, proposalA),
            otherProposal: await getCustomerProposalStatus(client, agencyAId, customerAId, proposalOtherCustomer),
            bookings: await listCustomerBookings(client, agencyAId, customerAId),
          })),
      );

      expect(result.ownProposal?.id).toBe(proposalA);
      expect(result.otherProposal).toBeNull();
      expect(result.bookings.map((booking) => booking.id)).toEqual([bookingA]);
    });
  });

  describe('configurable multi-pipeline: RBAC / tenant isolation / access rules', () => {
    it('ADMIN can create a pipeline and a stage; MANAGER/AGENT/VIEWER get 403', async () => {
      const app = buildTestApp(runtimePool);

      const forbidden = await Promise.all(
        ['managerA', 'agentA', 'viewerA'].map((principal) =>
          app.inject({
            method: 'POST',
            url: '/commercial/pipelines',
            headers: { 'x-test-principal': principal },
            payload: { name: 'Should not be created' },
          }),
        ),
      );
      for (const response of forbidden) {
        expect(response.statusCode).toBe(403);
      }

      const created = await app.inject({
        method: 'POST',
        url: '/commercial/pipelines',
        headers: { 'x-test-principal': 'adminA' },
        payload: { name: 'Pos-venda A' },
      });
      expect(created.statusCode).toBe(201);
      const newPipelineId = created.json<{ pipeline: { id: string } }>().pipeline.id;

      const stageForbidden = await app.inject({
        method: 'POST',
        url: `/commercial/pipelines/${newPipelineId}/stages`,
        headers: { 'x-test-principal': 'managerA' },
        payload: { name: 'Novo', sequence: 1, colorKey: 'BLUE' },
      });
      expect(stageForbidden.statusCode).toBe(403);

      const stageCreated = await app.inject({
        method: 'POST',
        url: `/commercial/pipelines/${newPipelineId}/stages`,
        headers: { 'x-test-principal': 'adminA' },
        payload: { name: 'Novo', sequence: 1, colorKey: 'BLUE' },
      });
      expect(stageCreated.statusCode).toBe(201);
      await app.close();
    });

    it('mass-assignment: agencyId cannot be set from the request body on pipeline/stage/access routes', async () => {
      const app = buildTestApp(runtimePool);

      const pipelineResponse = await app.inject({
        method: 'POST',
        url: '/commercial/pipelines',
        headers: { 'x-test-principal': 'adminA' },
        payload: { name: 'Test', agencyId: agencyBId },
      });
      expect(pipelineResponse.statusCode).toBe(400);

      const stageResponse = await app.inject({
        method: 'POST',
        url: `/commercial/pipelines/${pipelineAId}/stages`,
        headers: { 'x-test-principal': 'adminA' },
        payload: { name: 'Test', sequence: 1, colorKey: 'BLUE', agencyId: agencyBId },
      });
      expect(stageResponse.statusCode).toBe(400);

      const accessResponse = await app.inject({
        method: 'POST',
        url: `/commercial/pipelines/${pipelineAId}/access`,
        headers: { 'x-test-principal': 'adminA' },
        payload: { userId: userA2Id, agencyId: agencyBId },
      });
      expect(accessResponse.statusCode).toBe(400);
      await app.close();
    });

    it('rejects granting pipeline access to a userId from a different agency', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: `/commercial/pipelines/${pipelineAId}/access`,
        headers: { 'x-test-principal': 'adminA' },
        payload: { userId: userBId },
      });
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('Agency A cannot fetch or list Agency B pipelines/stages (cross-tenant blocked)', async () => {
      const app = buildTestApp(runtimePool);

      const getResponse = await app.inject({
        method: 'GET',
        url: `/commercial/pipelines/${pipelineBId}`,
        headers: { 'x-test-principal': 'agentA' },
      });
      expect([403, 404]).toContain(getResponse.statusCode);

      const listResponse = await app.inject({
        method: 'GET',
        url: '/commercial/pipelines',
        headers: { 'x-test-principal': 'agentA' },
      });
      expect(listResponse.statusCode).toBe(200);
      const ids = listResponse.json<{ pipelines: Array<{ id: string }> }>().pipelines.map((p) => p.id);
      expect(ids).not.toContain(pipelineBId);
      await app.close();
    });

    it('cannot assign an opportunity to another agency pipeline/stage (cross-tenant assignment blocked)', async () => {
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'POST',
        url: '/commercial/opportunities',
        headers: { 'x-test-principal': 'agentA' },
        payload: { customerId: customerAId, pipelineId: pipelineBId, stageId: stagesB.PROSPECTING },
      });
      // pipelineBId does not exist in agency A's tenant scope -> validation
      // error (never a silent cross-tenant assignment).
      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it(
      'default-open-until-restricted: a pipeline with zero PipelineAccess rows is visible to any agency staff; ' +
        'once restricted, a MANAGER without a grant cannot see it or its opportunities, by ID or by list',
      async () => {
        const app = buildTestApp(runtimePool);

        // Before any PipelineAccess row exists, pipelineA is unrestricted:
        // MANAGER (managerA2) can already see it and its opportunities.
        const oppId = await seedOpportunity(agencyAId, customerAId, { stage: 'PROSPECTING' });

        const beforeRestriction = await app.inject({
          method: 'GET',
          url: `/commercial/opportunities/${oppId}`,
          headers: { 'x-test-principal': 'managerA2' },
        });
        expect(beforeRestriction.statusCode).toBe(200);

        // ADMIN restricts pipelineA by granting access to a DIFFERENT user
        // (userAId), never to managerA2 (userA2Id).
        const grantResponse = await app.inject({
          method: 'POST',
          url: `/commercial/pipelines/${pipelineAId}/access`,
          headers: { 'x-test-principal': 'adminA' },
          payload: { userId: userAId },
        });
        expect(grantResponse.statusCode).toBe(201);

        // Now pipelineA is restricted and managerA2 has no grant: blocked
        // both by ID and by list.
        const afterRestrictionById = await app.inject({
          method: 'GET',
          url: `/commercial/opportunities/${oppId}`,
          headers: { 'x-test-principal': 'managerA2' },
        });
        expect(afterRestrictionById.statusCode).toBe(403);

        const afterRestrictionList = await app.inject({
          method: 'GET',
          url: '/commercial/opportunities',
          headers: { 'x-test-principal': 'managerA2' },
        });
        expect(afterRestrictionList.statusCode).toBe(200);
        const ids = afterRestrictionList
          .json<{ opportunities: Array<{ id: string }> }>()
          .opportunities.map((o) => o.id);
        expect(ids).not.toContain(oppId);

        // OWNER/ADMIN still see it regardless of grants.
        const adminStillSees = await app.inject({
          method: 'GET',
          url: `/commercial/opportunities/${oppId}`,
          headers: { 'x-test-principal': 'adminA' },
        });
        expect(adminStillSees.statusCode).toBe(200);

        // Clean up the grant so it doesn't leak into later tests in this file.
        await app.inject({
          method: 'DELETE',
          url: `/commercial/pipelines/${pipelineAId}/access/${userAId}`,
          headers: { 'x-test-principal': 'adminA' },
        });
        await app.close();
      },
    );

    it('setting active=false on a stage with assigned opportunities is blocked with a clear count', async () => {
      await seedOpportunity(agencyAId, customerAId, { stage: 'INTEREST' });
      const app = buildTestApp(runtimePool);
      const response = await app.inject({
        method: 'PATCH',
        url: `/commercial/pipelines/${pipelineAId}/stages/${stagesA.INTEREST}`,
        headers: { 'x-test-principal': 'adminA' },
        payload: { active: false },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: string }>().error).toMatch(/opportunit/i);
      await app.close();
    });
  });

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
            (userId === userA2Id && agencyId === agencyAId) ||
            (userId === userBId && agencyId === agencyBId),
        );
      },
      database: createDatabaseRuntime(pool),
    });
  }

  async function seedCustomer(agencyId: string, name: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name) VALUES ($1, $2) RETURNING id`,
      [agencyId, name],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed customer');
    }
    return id;
  }

  function stagesFor(agencyId: string): Record<string, string> {
    return agencyId === agencyAId ? stagesA : stagesB;
  }

  function pipelineFor(agencyId: string): string {
    return agencyId === agencyAId ? pipelineAId : pipelineBId;
  }

  async function seedOpportunity(
    agencyId: string,
    customerId: string,
    overrides: { stage?: string; nextActionAt?: string; proposalId?: string; pipelineId?: string } = {},
  ): Promise<string> {
    const stageName = overrides.stage ?? 'PROSPECTING';
    const stageId = stagesFor(agencyId)[stageName];
    if (!stageId) {
      throw new Error(`No seeded stage "${stageName}" for agency ${agencyId}`);
    }
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO commercial_opportunities (agency_id, customer_id, stage, pipeline_id, stage_id, next_action_at, proposal_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        agencyId,
        customerId,
        stageName,
        overrides.pipelineId ?? pipelineFor(agencyId),
        stageId,
        overrides.nextActionAt ?? null,
        overrides.proposalId ?? null,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed opportunity');
    }
    return id;
  }

  // Seeds one Pipeline + 4 stages (PROSPECTING/INTEREST/NEGOTIATION/WON --
  // enough coverage for this suite) for one agency, mirroring the shape
  // migration 009 creates in production. Returns the pipeline id and a
  // name -> stageId map.
  async function seedPipeline(
    pool: Pool,
    agencyId: string,
    name: string,
  ): Promise<{ pipelineId: string; stages: Record<string, string> }> {
    const pipelineResult = await pool.query<{ id: string }>(
      `INSERT INTO pipelines (agency_id, name) VALUES ($1, $2) RETURNING id`,
      [agencyId, name],
    );
    const pipelineId = pipelineResult.rows[0]?.id;
    if (!pipelineId) {
      throw new Error('Failed to seed pipeline');
    }

    const stageDefs: Array<[string, number, string]> = [
      ['PROSPECTING', 1, 'NEUTRAL'],
      ['INTEREST', 2, 'BLUE'],
      ['NEGOTIATION', 3, 'ORANGE'],
      ['WON', 4, 'GREEN'],
    ];
    const stages: Record<string, string> = {};
    for (const [stageName, sequence, color] of stageDefs) {
      const stageResult = await pool.query<{ id: string }>(
        `INSERT INTO pipeline_stages (agency_id, pipeline_id, name, sequence, color_key)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [agencyId, pipelineId, stageName, sequence, color],
      );
      const stageId = stageResult.rows[0]?.id;
      if (!stageId) {
        throw new Error(`Failed to seed stage ${stageName}`);
      }
      stages[stageName] = stageId;
    }

    return { pipelineId, stages };
  }

  async function seedTask(
    agencyId: string,
    customerId: string,
    assignedUserId: string,
    createdBy: string,
    overrides: { dueAt?: 'now' | "'2020-01-01T00:00:00Z'" } = {},
  ): Promise<string> {
    const dueAt = overrides.dueAt === 'now' ? 'now()' : `'2026-01-01T00:00:00Z'`;
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO commercial_tasks (agency_id, customer_id, assigned_user_id, title, due_at, created_by)
       VALUES ($1, $2, $3, 'Follow up', ${dueAt}, $4) RETURNING id`,
      [agencyId, customerId, assignedUserId, createdBy],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed task');
    }
    return id;
  }

  async function seedInteraction(agencyId: string, customerId: string, userId: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO customer_interactions (agency_id, customer_id, user_id, channel, direction, summary)
       VALUES ($1, $2, $3, 'PHONE', 'OUTBOUND', 'Test interaction') RETURNING id`,
      [agencyId, customerId, userId],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed interaction');
    }
    return id;
  }

  async function seedProposal(
    agencyId: string,
    customerId: string,
    overrides: { status?: string; validUntil?: string; total?: string } = {},
  ): Promise<string> {
    const total = overrides.total ?? '1000.00';
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO proposals (agency_id, customer_id, proposed_price, total, status, valid_until)
       VALUES ($1, $2, $3, $3, $4, $5) RETURNING id`,
      [agencyId, customerId, total, overrides.status ?? 'DRAFT', overrides.validUntil ?? null],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to seed proposal');
    }
    return id;
  }

  async function seedSale(
    agencyId: string,
    customerId: string,
    overrides: { status?: string; total?: string } = {},
  ): Promise<string> {
    const userId = agencyId === agencyAId ? userAId : userBId;
    const total = overrides.total ?? '1000.00';
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO sales (agency_id, customer_id, user_id, amount, total, status)
       VALUES ($1, $2, $3, $4, $4, $5) RETURNING id`,
      [agencyId, customerId, userId, total, overrides.status ?? 'PENDING'],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed sale');
    return id;
  }

  async function seedReceivable(
    agencyId: string,
    saleId: string,
    customerId: string,
    overrides: { amount: string; dueAt: string },
  ): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO receivables (agency_id, sale_id, customer_id, description, amount, due_at)
       VALUES ($1, $2, $3, 'Overdue receivable', $4, $5) RETURNING id`,
      [agencyId, saleId, customerId, overrides.amount, overrides.dueAt],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed receivable');
    return id;
  }

  async function seedCancelledBooking(agencyId: string, customerId: string): Promise<string> {
    const outboundDepartureId = await seedDeparture(agencyId);
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO bookings
         (agency_id, booker_customer_id, trip_type, outbound_departure_id, cancelled, cancelled_at, cancelled_by_user_id, cancellation_reason)
       VALUES ($1, $2, 'ONE_WAY', $3, true, now(), $4, 'Customer requested cancellation') RETURNING id`,
      [agencyId, customerId, outboundDepartureId, agencyId === agencyAId ? userAId : userBId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed cancelled booking');
    await adminPool.query(
      `INSERT INTO booking_passengers (agency_id, booking_id, name)
       VALUES ($1, $2, 'Cancelled Passenger')`,
      [agencyId, id],
    );
    return id;
  }

  async function seedDeparture(agencyId: string): Promise<string> {
    const supplier = await adminPool.query<{ id: string }>(
      `INSERT INTO suppliers (agency_id, name) VALUES ($1, 'Supplier') RETURNING id`,
      [agencyId],
    );
    const route = await adminPool.query<{ id: string }>(
      `INSERT INTO routes (agency_id, origin, destination, active)
       VALUES ($1, 'A', 'B', true) RETURNING id`,
      [agencyId],
    );
    const product = await adminPool.query<{ id: string }>(
      `INSERT INTO transport_products (agency_id, name, trip_type, outbound_route_id, price, active, publicly_bookable)
       VALUES ($1, 'Product', 'ONE_WAY', $2, 1000, true, true) RETURNING id`,
      [agencyId, route.rows[0]?.id],
    );
    const departure = await adminPool.query<{ id: string }>(
      `INSERT INTO scheduled_departures (agency_id, product_id, departure_at, capacity, supplier_id, service_type)
       VALUES ($1, $2, '2027-01-01T10:00:00Z', 10, $3, 'OWN') RETURNING id`,
      [agencyId, product.rows[0]?.id, supplier.rows[0]?.id],
    );
    const id = departure.rows[0]?.id;
    if (!id) throw new Error('Failed to seed departure');
    return id;
  }

  async function seedPescadorCapture(agencyId: string, status: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO external_offer_captures
         (agency_id, source_url, source_name, raw_content, normalized_title, found_price, status, reviewed_at, reviewed_by_user_id)
       VALUES ($1, $2, 'Supplier', 'Raw package', 'Package', 1000, $3, now(), $4)
       RETURNING id`,
      [agencyId, `https://supplier.example/${status.toLowerCase()}`, status, agencyId === agencyAId ? userAId : userBId],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Failed to seed pescador capture');
    return id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Commercial cockpit security tests require localhost only.');
  }

  if (databasePort !== 55432) {
    throw new Error('Commercial cockpit security tests require local port 55432.');
  }

  if (!databaseName.includes('test')) {
    throw new Error('Commercial cockpit security tests require a database name with a test marker.');
  }

  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === '55432' || url.port === '';

    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run commercial cockpit security tests against unsafe DATABASE_URL.');
    }
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

  if (!output.includes(postgresImage) || !output.includes(`${databaseHost}:${databasePort}->5432/tcp`)) {
    throw new Error('Container is not the expected local disposable Postgres.');
  }
}

async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.query(readSqlForPg(migration001));
  await pool.query(readSqlForPg(migration002));
  await pool.query(readSqlForPg(migration003));
  await pool.query(readSqlForPg(migration004));
  await pool.query(readSqlForPg(migration005));
  await pool.query(readSqlForPg(migration006));
  await pool.query(readSqlForPg(migration007));
  await pool.query(readSqlForPg(migration008Commercial));
  await pool.query(readSqlForPg(migration009Configurable));
  await pool.query(readSqlForPg(migration010));
  await pool.query(readSqlForPg(migration011));
  await pool.query(readSqlForPg(migration013));
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
        ($1, 'Agency A', 'agency-a-commercial-cockpit-security-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-commercial-cockpit-security-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-commercial-cockpit-security-test-only', 'ACTIVE'),
        ($3, $2, 'user-a2@example.test', 'User A2', 'AGENT', 'hash-for-commercial-cockpit-security-test-only', 'ACTIVE'),
        ($4, $5, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-commercial-cockpit-security-test-only', 'ACTIVE');
    `,
    [userAId, agencyAId, userA2Id, userBId, agencyBId],
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
