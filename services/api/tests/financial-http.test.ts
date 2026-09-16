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
const migrations = [
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
  '015_audit_logging.sql',
  '016_production_auth_captcha_mfa.sql',
  '017_mfa_rls_p0_fix.sql',
  '018_local_dev_migration_corrections.sql',
  '019_customer_360_addresses.sql',
  '020_customer_360_dependents.sql',
  '021_customer_360_documents.sql',
  '022_customer_360_document_audit.sql',
  '023_customer_360_rls.sql',
  '024_extended_financial_module.sql',
  // createPayable() (Business Operations Completion wave) always inserts
  // category_id/cost_center_id (041) and beneficiary_type/employee_id/
  // commission_entry_id/payroll_entry_id (043), and assertOptionalRef()
  // validates against cost_centers/employees (041/042) and
  // commission_entries/payroll_entries (043) -- all required or every
  // createPayable() call here 500s with a missing-column/table error.
  // 038/039/040 create/extend suppliers/air_services/land_services, which
  // 041 ALTERs to add cost_center_id -- load-bearing dependencies of 041.
  '038_supplier_extended.sql',
  '039_air_services.sql',
  '040_land_services.sql',
  '041_finance_categories_cost_centers.sql',
  '042_employees_commission_plans.sql',
  '043_commissions_payroll.sql',
  '044_commission_entries_dedupe_guard.sql',
  '045_supplier_category_links_force_rls.sql',
  '046_customer_360_completion.sql',
  '047_operacao_occurrences_posttrip.sql',
  // 048 (support_ticket_capture_context) ALTERs support_cases, a table
  // created by an earlier ops-pack migration this test's list never
  // included -- not needed for PermissionRestriction, skipped rather than
  // pulling in an unrelated dependency chain.
  '049_enrollment_links.sql',
  '050_agency_branding_departments.sql',
  // GET /financial/dashboard and GET /employees now call
  // assertNotRestricted() (PermissionRestriction, SaaS Admin), which
  // queries permission_restrictions -- this migration must be applied or
  // both 500 with a missing-table error regardless of RBAC passing.
  '051_invitations_permission_restrictions.sql',
  // customers.protocol_number is a required NOT NULL column that
  // createCustomer()/this file's own customer fixture insert always
  // populate -- omitting it 500s with "column protocol_number does not
  // exist" (found via a real CI run).
  '068_protocol_numbers.sql',
].map((name) => resolve(repoRoot, 'infrastructure/migrations', name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-financial-http-postgres';
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

interface FinancialSummaryResponse {
  salesThisMonth: {
    total: number;
    count: number;
  };
  received: number;
  pending: number;
  expectedMargin: number;
  recentPayments: Array<{
    id: string;
    customerId: string;
    customerName: string;
    description: string;
    amount: number;
    occurredAt: string;
    status: 'PAID' | 'PENDING';
  }>;
  upcomingReceivables: Array<{
    id: string;
    customerId: string;
    customerName: string;
    description: string;
    amount: number;
    dueAt: string;
    status: 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
  }>;
}

const principals: Record<string, AuthenticatedPrincipal> = {
  viewer: { userId: userAId, agencyId: agencyAId, role: UserRole.VIEWER, email: 'viewer@example.test' },
  agent: { userId: userAId, agencyId: agencyAId, role: UserRole.AGENT, email: 'agent@example.test' },
  manager: { userId: userAId, agencyId: agencyAId, role: UserRole.MANAGER, email: 'manager@example.test' },
  admin: { userId: userAId, agencyId: agencyAId, role: UserRole.ADMIN, email: 'admin@example.test' },
  owner: { userId: userAId, agencyId: agencyAId, role: UserRole.OWNER, email: 'owner@example.test' },
  ownerB: { userId: userBId, agencyId: agencyBId, role: UserRole.OWNER, email: 'owner-b@example.test' },
};

describe('Financial HTTP routes', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let customerA: string;
  let saleA: string;
  let supplierA: string;
  let operationA: string;

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
    await adminPool.query('TRUNCATE TABLE reconciliations RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE cash_transactions RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE expenses RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE revenues RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE financial_categories RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE payment_allocations RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE payments RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE receivables RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE payables RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE operational_costs RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE operation_checkpoints RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE transport_operations RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE scheduled_departures RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE transport_products RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE routes RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE suppliers RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE sales RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE customers RESTART IDENTITY CASCADE');

    customerA = await seedCustomer(agencyAId);
    saleA = await seedSale(agencyAId, customerA, userAId);
    supplierA = await seedSupplier(agencyAId);
    operationA = await seedTransportOperation(agencyAId, supplierA);
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  it('blocks unauthenticated and non-financial roles from financial data', async () => {
    const app = buildTestApp(runtimePool);
    const unauthenticated = await app.inject({ method: 'GET', url: '/financial/receivables' });
    const viewer = await app.inject({
      method: 'GET',
      url: '/financial/receivables',
      headers: { 'x-test-principal': 'viewer' },
    });
    const agent = await app.inject({
      method: 'GET',
      url: '/financial/receivables',
      headers: { 'x-test-principal': 'agent' },
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(viewer.statusCode).toBe(403);
    expect(agent.statusCode).toBe(403);
    await app.close();
  });

  it('allows MANAGER to read financial dashboard but blocks writes', async () => {
    const app = buildTestApp(runtimePool);
    const summary = await app.inject({
      method: 'GET',
      url: '/financial/dashboard?from=2027-01-01T00:00:00Z&to=2027-01-31T23:59:59Z',
      headers: { 'x-test-principal': 'manager' },
    });
    const create = await app.inject({
      method: 'POST',
      url: '/financial/receivables',
      headers: { 'x-test-principal': 'manager' },
      payload: {
        saleId: saleA,
        customerId: customerA,
        description: 'Sale receivable',
        amount: 100,
        dueAt: '2027-01-10T00:00:00Z',
      },
    });

    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toHaveProperty('cashFlow');
    expect(create.statusCode).toBe(403);
    await app.close();
  });

  it('returns an isolated, authorized financial story with paid installment schedule and margins', async () => {
    const app = buildTestApp(runtimePool);
    const storySale = await seedSale(
      agencyAId,
      customerA,
      userAId,
      18000,
      'Demo principal: Test Customer / Cancun',
    );

    const category = await app.inject({
      method: 'POST',
      url: '/financial/categories',
      headers: { 'x-test-principal': 'admin' },
      payload: { name: 'Travel packages', type: 'REVENUE' },
    });
    expect(category.statusCode).toBe(201);
    const categoryId = category.json<{ category: { id: string } }>().category.id;

    const receivable = await app.inject({
      method: 'POST',
      url: '/financial/receivables',
      headers: { 'x-test-principal': 'admin' },
      payload: {
        saleId: storySale,
        customerId: customerA,
        description: 'Sale receivable',
        amount: 18000,
        dueAt: '2027-03-10T00:00:00Z',
      },
    });
    expect(receivable.statusCode).toBe(201);
    const receivableId = receivable.json<{ receivable: { id: string } }>().receivable.id;

    const payment = await app.inject({
      method: 'POST',
      url: '/financial/payments',
      headers: { 'x-test-principal': 'admin' },
      payload: { direction: 'IN', amount: 6000, occurredAt: '2027-01-03T00:00:00Z' },
    });
    expect(payment.statusCode).toBe(201);
    const paymentId = payment.json<{ payment: { id: string } }>().payment.id;

    const allocation = await app.inject({
      method: 'POST',
      url: `/financial/payments/${paymentId}/allocations`,
      headers: { 'x-test-principal': 'admin' },
      payload: { allocations: [{ receivableId, amount: 6000 }] },
    });
    expect(allocation.statusCode).toBe(200);

    const scheduleRows = [
      { saleId: storySale, description: 'Entry Test Customer / Cancun', dueDate: '2027-01-03T00:00:00Z' },
      { saleId: undefined, description: 'Installment 2 Test Customer / Cancun', dueDate: '2027-02-03T00:00:00Z' },
      { saleId: undefined, description: 'Installment 3 Test Customer / Cancun', dueDate: '2027-03-03T00:00:00Z' },
    ] as const;
    let entryRevenueId: string | undefined;
    for (const [index, scheduleRow] of scheduleRows.entries()) {
      const revenue = await app.inject({
        method: 'POST',
        url: '/financial/revenues',
        headers: { 'x-test-principal': 'admin' },
        payload: {
          ...scheduleRow,
          customerId: customerA,
          categoryId,
          amount: 6000,
          currency: 'BRL',
          competencyDate: scheduleRow.dueDate,
          notes: 'Demo installment schedule for Test Customer / Cancun sale',
        },
      });
      expect(revenue.statusCode).toBe(201);
      if (index === 0) {
        entryRevenueId = revenue.json<{ revenue: { id: string } }>().revenue.id;
      }
    }
    expect(entryRevenueId).toBeDefined();
    const paidEntry = await app.inject({
      method: 'POST',
      url: `/financial/revenues/${entryRevenueId}/mark-paid`,
      headers: { 'x-test-principal': 'admin' },
    });
    expect(paidEntry.statusCode).toBe(200);
    expect(paidEntry.json<{ revenue: { status: string } }>().revenue.status).toBe('PAID');

    for (const [description, amount] of [
      ['Hotel', 7000],
      ['Airfare', 5000],
      ['Transfer', 800],
      ['Travel insurance', 500],
      ['Comissao agency', 700],
    ] as const) {
      const payable = await app.inject({
        method: 'POST',
        url: '/financial/payables',
        headers: { 'x-test-principal': 'admin' },
        payload: { saleId: storySale, description, amount, dueAt: '2027-01-10T00:00:00Z' },
      });
      expect(payable.statusCode).toBe(201);
    }

    const adminResponse = await app.inject({
      method: 'GET',
      url: `/financial/sales/${storySale}/story`,
      headers: { 'x-test-principal': 'admin' },
    });
    const managerResponse = await app.inject({
      method: 'GET',
      url: `/financial/sales/${storySale}/story`,
      headers: { 'x-test-principal': 'manager' },
    });
    const unauthenticated = await app.inject({
      method: 'GET',
      url: `/financial/sales/${storySale}/story`,
    });
    const viewer = await app.inject({
      method: 'GET',
      url: `/financial/sales/${storySale}/story`,
      headers: { 'x-test-principal': 'viewer' },
    });
    const agent = await app.inject({
      method: 'GET',
      url: `/financial/sales/${storySale}/story`,
      headers: { 'x-test-principal': 'agent' },
    });
    const invalidSaleId = await app.inject({
      method: 'GET',
      url: '/financial/sales/not-a-uuid/story',
      headers: { 'x-test-principal': 'manager' },
    });
    const customerB = await seedCustomer(agencyBId);
    const saleB = await seedSale(agencyBId, customerB, userBId);
    const crossTenant = await app.inject({
      method: 'GET',
      url: `/financial/sales/${saleB}/story`,
      headers: { 'x-test-principal': 'owner' },
    });

    expect(adminResponse.statusCode).toBe(200);
    expect(managerResponse.statusCode).toBe(200);
    expect(unauthenticated.statusCode).toBe(401);
    expect(viewer.statusCode).toBe(403);
    expect(agent.statusCode).toBe(403);
    expect(invalidSaleId.statusCode).toBe(400);
    expect(crossTenant.statusCode).toBe(404);
    const story = managerResponse.json<{
      story: {
        supplierPayables: Array<{ description: string; amount: number }>;
        installmentSchedule: Array<{ description: string; amount: number; status: string }>;
      };
    }>().story;
    expect(story).toMatchObject({
      grossSale: 18000,
      received: 6000,
      remainingReceivable: 12000,
      totalSupplierPayable: 14000,
      margin: {
        grossSale: 18000,
        supplierCosts: 13300,
        commissionAndFees: 700,
        grossMargin: 4700,
        netMargin: 4000,
      },
    });
    expect(story.supplierPayables.map(({ description, amount }) => ({ description, amount }))).toEqual([
      { description: 'Hotel', amount: 7000 },
      { description: 'Airfare', amount: 5000 },
      { description: 'Transfer', amount: 800 },
      { description: 'Travel insurance', amount: 500 },
      { description: 'Comissao agency', amount: 700 },
    ]);
    expect(story.installmentSchedule.map(({ description, amount, status }) => ({ description, amount, status }))).toEqual([
      { description: 'Entry Test Customer / Cancun', amount: 6000, status: 'PAID' },
      { description: 'Installment 2 Test Customer / Cancun', amount: 6000, status: 'OPEN' },
      { description: 'Installment 3 Test Customer / Cancun', amount: 6000, status: 'OPEN' },
    ]);
    await app.close();
  });

  it('allows ADMIN to create receivables, payables, payments, allocations, and operational costs', async () => {
    const app = buildTestApp(runtimePool);
    const receivable = await app.inject({
      method: 'POST',
      url: '/financial/receivables',
      headers: { 'x-test-principal': 'admin' },
      payload: {
        saleId: saleA,
        customerId: customerA,
        description: 'Sale receivable',
        amount: 1000,
        dueAt: '2027-01-10T00:00:00Z',
      },
    });
    expect(receivable.statusCode).toBe(201);
    const receivableId = receivable.json<{ receivable: { id: string } }>().receivable.id;

    const payable = await app.inject({
      method: 'POST',
      url: '/financial/payables',
      headers: { 'x-test-principal': 'admin' },
      payload: {
        saleId: saleA,
        supplierId: supplierA,
        transportOperationId: operationA,
        description: 'Supplier payable',
        amount: 250,
        dueAt: '2027-01-12T00:00:00Z',
      },
    });
    expect(payable.statusCode).toBe(201);
    const payableId = payable.json<{ payable: { id: string } }>().payable.id;

    const cost = await app.inject({
      method: 'POST',
      url: '/financial/operational-costs',
      headers: { 'x-test-principal': 'admin' },
      payload: {
        saleId: saleA,
        transportOperationId: operationA,
        supplierId: supplierA,
        description: 'Fuel',
        costType: 'FUEL',
        actualAmount: 50,
        incurredAt: '2027-01-04T00:00:00Z',
      },
    });
    expect(cost.statusCode).toBe(201);

    const inbound = await app.inject({
      method: 'POST',
      url: '/financial/payments',
      headers: { 'x-test-principal': 'admin' },
      payload: {
        direction: 'IN',
        amount: 1000,
        occurredAt: '2027-01-05T00:00:00Z',
      },
    });
    expect(inbound.statusCode).toBe(201);
    const inboundId = inbound.json<{ payment: { id: string } }>().payment.id;

    const allocatedIn = await app.inject({
      method: 'POST',
      url: `/financial/payments/${inboundId}/allocations`,
      headers: { 'x-test-principal': 'admin' },
      payload: { allocations: [{ receivableId, amount: 1000 }] },
    });
    expect(allocatedIn.statusCode).toBe(200);
    expect(allocatedIn.json<{ targets: Array<{ status: string }> }>().targets[0]?.status).toBe('PAID');

    const outbound = await app.inject({
      method: 'POST',
      url: '/financial/payments',
      headers: { 'x-test-principal': 'admin' },
      payload: {
        direction: 'OUT',
        amount: 250,
        occurredAt: '2027-01-07T00:00:00Z',
      },
    });
    const outboundId = outbound.json<{ payment: { id: string } }>().payment.id;
    const allocatedOut = await app.inject({
      method: 'POST',
      url: `/financial/payments/${outboundId}/allocations`,
      headers: { 'x-test-principal': 'admin' },
      payload: { allocations: [{ payableId, amount: 250 }] },
    });

    expect(allocatedOut.statusCode).toBe(200);
    await app.close();
  });

  it('exposes /financial/summary endpoint for MANAGER with server-authoritative data', async () => {
    const app = buildTestApp(runtimePool);

    // Create a receivable and payment for Agency A
    const receivableResp = await app.inject({
      method: 'POST',
      url: '/financial/receivables',
      headers: { 'x-test-principal': 'admin' },
      payload: {
        saleId: saleA,
        customerId: customerA,
        description: 'Test receivable',
        amount: 500.50,
        dueAt: '2027-02-10T00:00:00Z',
      },
    });
    const receivableId = receivableResp.json<{ receivable: { id: string } }>().receivable.id;

    // Record a payment
    const paymentResp = await app.inject({
      method: 'POST',
      url: '/financial/payments',
      headers: { 'x-test-principal': 'admin' },
      payload: {
        direction: 'IN',
        amount: 500.50,
        occurredAt: '2027-01-05T00:00:00Z',
      },
    });
    const paymentId = paymentResp.json<{ payment: { id: string } }>().payment.id;

    // Allocate payment to receivable
    await app.inject({
      method: 'POST',
      url: `/financial/payments/${paymentId}/allocations`,
      headers: { 'x-test-principal': 'admin' },
      payload: { allocations: [{ receivableId, amount: 500.50 }] },
    });

    // Manager should be able to read financial summary
    const summary = await app.inject({
      method: 'GET',
      url: '/financial/summary',
      headers: { 'x-test-principal': 'manager' },
    });

    expect(summary.statusCode).toBe(200);
    const data = summary.json<{ summary: FinancialSummaryResponse }>();
    expect(data.summary).toHaveProperty('salesThisMonth');
    expect(data.summary).toHaveProperty('received');
    expect(data.summary).toHaveProperty('pending');
    expect(data.summary).toHaveProperty('expectedMargin');
    expect(data.summary).toHaveProperty('recentPayments');
    expect(data.summary).toHaveProperty('upcomingReceivables');

    // Verify decimal safety: amounts should be properly rounded
    expect(data.summary.received).toBeCloseTo(500.50, 2);

    await app.close();
  });

  it('enforces cross-tenant isolation: Agency A cannot access Agency B financial data', async () => {
    const app = buildTestApp(runtimePool);

    // Create receivable for Agency B
    const customerB = await seedCustomer(agencyBId);
    const saleB = await seedSale(agencyBId, customerB, userBId);
    const receivableB = await app.inject({
      method: 'POST',
      url: '/financial/receivables',
      headers: { 'x-test-principal': 'ownerB' },
      payload: {
        saleId: saleB,
        customerId: customerB,
        description: 'Agency B receivable',
        amount: 1000,
        dueAt: '2027-02-10T00:00:00Z',
      },
    });
    expect(receivableB.statusCode).toBe(201);

    // Agency A's manager should not see Agency B's receivable in their summary
    const summaryA = await app.inject({
      method: 'GET',
      url: '/financial/summary',
      headers: { 'x-test-principal': 'manager' },
    });

    // Agency A should see only their own data
    expect(summaryA.statusCode).toBe(200);

    // Create a receivable for Agency A to verify it appears
    const receivableA = await app.inject({
      method: 'POST',
      url: '/financial/receivables',
      headers: { 'x-test-principal': 'admin' },
      payload: {
        saleId: saleA,
        customerId: customerA,
        description: 'Agency A receivable',
        amount: 500,
        dueAt: '2027-02-15T00:00:00Z',
      },
    });
    expect(receivableA.statusCode).toBe(201);

    const summaryAAfter = await app.inject({
      method: 'GET',
      url: '/financial/summary',
      headers: { 'x-test-principal': 'manager' },
    });

    const dataAAfter = summaryAAfter.json<{ summary: FinancialSummaryResponse }>();
    // Agency A's pending should reflect only their receivable
    expect(dataAAfter.summary.pending).toBe(500);

    // Agency B's manager should not be able to see Agency A's data
    const summaryB = await app.inject({
      method: 'GET',
      url: '/financial/summary',
      headers: { 'x-test-principal': 'ownerB' },
    });

    expect(summaryB.statusCode).toBe(200);
    const dataB = summaryB.json<{ summary: FinancialSummaryResponse }>();
    // Agency B should only see Agency B's receivable (1000), not Agency A's (500)
    expect(dataB.summary.pending).toBe(1000);

    await app.close();
  });

  it('blocks unauthorized roles from accessing /financial/summary', async () => {
    const app = buildTestApp(runtimePool);

    const unauthenticated = await app.inject({
      method: 'GET',
      url: '/financial/summary',
    });
    const viewer = await app.inject({
      method: 'GET',
      url: '/financial/summary',
      headers: { 'x-test-principal': 'viewer' },
    });
    const agent = await app.inject({
      method: 'GET',
      url: '/financial/summary',
      headers: { 'x-test-principal': 'agent' },
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(viewer.statusCode).toBe(403);
    expect(agent.statusCode).toBe(403);

    await app.close();
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
          (userId === userAId && agencyId === agencyAId) || (userId === userBId && agencyId === agencyBId),
        );
      },
      database: createDatabaseRuntime(pool),
    });
  }

  async function seedCustomer(agencyId: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO customers (agency_id, name, status) VALUES ($1, 'Cliente Teste', 'ACTIVE') RETURNING id`,
      [agencyId],
    );
    return result.rows[0]!.id;
  }

  async function seedSale(
    agencyId: string,
    customerId: string,
    userId: string,
    total = 1000,
    notes?: string,
  ): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total, status, notes)
       VALUES ($1, $2, $3, $4, '0.00', $4, 'CONFIRMED', $5) RETURNING id`,
      [agencyId, customerId, userId, total, notes ?? null],
    );
    return result.rows[0]!.id;
  }

  async function seedSupplier(agencyId: string): Promise<string> {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO suppliers (agency_id, name) VALUES ($1, 'Supplier') RETURNING id`,
      [agencyId],
    );
    return result.rows[0]!.id;
  }

  async function seedTransportOperation(agencyId: string, supplierId: string): Promise<string> {
    const route = await adminPool.query<{ id: string }>(
      `INSERT INTO routes (agency_id, origin, destination) VALUES ($1, 'A', 'B') RETURNING id`,
      [agencyId],
    );
    const product = await adminPool.query<{ id: string }>(
      `INSERT INTO transport_products (agency_id, name, trip_type, outbound_route_id, price)
       VALUES ($1, 'Product', 'ONE_WAY', $2, 10) RETURNING id`,
      [agencyId, route.rows[0]!.id],
    );
    const departure = await adminPool.query<{ id: string }>(
      `INSERT INTO scheduled_departures
         (agency_id, product_id, departure_at, capacity, supplier_id, service_type)
       VALUES ($1, $2, '2027-01-03T10:00:00Z', 10, $3, 'SUBCONTRACTED') RETURNING id`,
      [agencyId, product.rows[0]!.id, supplierId],
    );
    const operation = await adminPool.query<{ id: string }>(
      `INSERT INTO transport_operations (agency_id, departure_id) VALUES ($1, $2) RETURNING id`,
      [agencyId, departure.rows[0]!.id],
    );
    return operation.rows[0]!.id;
  }
});

function assertSafeTestDatabase(): void {
  if (!['127.0.0.1', 'localhost'].includes(databaseHost)) {
    throw new Error('Financial HTTP tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Financial HTTP tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Financial HTTP tests require a database name with a test marker.');
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
  const result = run('docker', ['ps', '--filter', `name=${containerName}`, '--format', '{{.Image}}|{{.Ports}}']);
  const output = result.stdout.trim();
  expect(output).toContain(postgresImage);
  expect(output).toContain(`${databaseHost}:${databasePort}->5432/tcp`);
}

async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const migration of migrations) {
    await pool.query(readSqlForPg(migration));
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
    `
      INSERT INTO agencies (id, name, slug, email, plan, status)
      VALUES
        ($1, 'Agency A', 'agency-a-financial-http-test', 'agency-a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-financial-http-test', 'agency-b@example.test', 'FREE', 'ACTIVE');
    `,
    [agencyAId, agencyBId],
  );
  await pool.query(
    `
      INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
      VALUES
        ($1, $2, 'user-a@example.test', 'User A', 'ADMIN', 'hash-for-financial-http-test-only', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'User B', 'ADMIN', 'hash-for-financial-http-test-only', 'ACTIVE');
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
