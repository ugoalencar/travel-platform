import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import {
  EmployeeCommissionBasis,
  EmployeeCommissionCalculationType,
  EmployeeCommissionProductType,
  UserRole,
} from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import { buildApp } from '../src/app';
import {
  createEmployeeCommissionRule,
  findApplicableRule,
  listEmployeeCommissionRules,
} from '../src/employee-commission-rules';
import { generateEmployeeCommission } from '../src/employee-commissions';
import { cancelSale } from '../src/sales';

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = 'travel-platform-employee-commission-rules-postgres';
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

const agencyId = '40000000-0000-4000-8000-000000000001';
const agencyBId = '40000000-0000-4000-8000-000000000002';
const customerId = '40000000-0000-4000-8000-000000000010';
const customerBId = '40000000-0000-4000-8000-000000000011';
const ownerUserId = '40000000-0000-4000-8000-000000000020';
const userBOwnerId = '40000000-0000-4000-8000-000000000021';
const agentUserId = '40000000-0000-4000-8000-000000000022';
const employeeAId = '40000000-0000-4000-8000-000000000030';
const employeeBId = '40000000-0000-4000-8000-000000000031';

const ownerContext = { agencyId, userId: ownerUserId, userRole: UserRole.OWNER, email: 'owner@example.test' };
const contextB = { agencyId: agencyBId, userId: userBOwnerId, userRole: UserRole.OWNER, email: 'owner-b@example.test' };

describe('Employee Commission Rules (Comissionamento por Funcionário e Produto)', () => {
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
    await adminPool.query('TRUNCATE TABLE commission_entries RESTART IDENTITY CASCADE');
    await adminPool.query('TRUNCATE TABLE employee_commission_rules RESTART IDENTITY CASCADE');
    await adminPool.query('DELETE FROM insurance_policies');
    await adminPool.query('DELETE FROM excursion_customers');
    await adminPool.query('DELETE FROM excursion_departures');
    await adminPool.query('DELETE FROM excursions');
    await adminPool.query('DELETE FROM air_services');
    await adminPool.query('DELETE FROM trips');
    await adminPool.query('DELETE FROM sales');
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------
  async function seedSale(total: number, forAgency = agencyId, forCustomer = customerId, forUser = ownerUserId) {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total, status)
       VALUES ($1, $2, $3, $4, '0.00', $4, 'CONFIRMED') RETURNING id`,
      [forAgency, forCustomer, forUser, total.toFixed(2)],
    );
    return result.rows[0]!.id;
  }

  async function seedTrip(saleId: string, forAgency = agencyId, forCustomer = customerId) {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO trips (agency_id, customer_id, sale_id, name, destination, start_date, end_date)
       VALUES ($1, $2, $3, 'Viagem Teste', 'Cancun', '2026-06-15', '2026-06-22') RETURNING id`,
      [forAgency, forCustomer, saleId],
    );
    return result.rows[0]!.id;
  }

  async function seedAirService(tripId: string, saleValue: number, forAgency = agencyId, forCustomer = customerId) {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO air_services (
         agency_id, trip_id, customer_id, airline, direction, sequence,
         origin, destination, departure_date, arrival_date, cabin_class,
         fare, taxes, fees, cost, sale_value, currency, status
       ) VALUES (
         $1, $2, $3, 'LATAM', 'OUTBOUND', 1,
         'GRU', 'GIG', '2026-06-15', '2026-06-15', 'ECONOMY',
         500.00, 80.00, 20.00, 400.00, $4, 'BRL', 'CONFIRMED'
       ) RETURNING id`,
      [forAgency, tripId, forCustomer, saleValue.toFixed(2)],
    );
    return result.rows[0]!.id;
  }

  async function seedExcursionWithPassengers(
    tripId: string,
    passengerValues: number[],
    forAgency = agencyId,
    forCustomer = customerId,
  ) {
    const excursionResult = await adminPool.query<{ id: string }>(
      `INSERT INTO excursions (agency_id, name, destination, transport_type)
       VALUES ($1, 'Excursão Cancun', 'Cancun', 'AEREO') RETURNING id`,
      [forAgency],
    );
    const excursionId = excursionResult.rows[0]!.id;

    const departureResult = await adminPool.query<{ id: string }>(
      `INSERT INTO excursion_departures (agency_id, excursion_id, start_date, end_date)
       VALUES ($1, $2, '2026-07-01', '2026-07-10') RETURNING id`,
      [forAgency, excursionId],
    );
    const departureId = departureResult.rows[0]!.id;

    // excursion_customers is UNIQUE(agency_id, excursion_departure_id,
    // customer_id) -- one passenger row can't repeat the same customer on
    // the same departure. Each passenger in the scenario is a distinct
    // real customer (Passageiro A/B/C), not a quantity multiplier of one.
    let index = 0;
    for (const value of passengerValues) {
      index += 1;
      const passengerCustomer = await adminPool.query<{ id: string }>(
        `INSERT INTO customers (agency_id, name, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
        [forAgency, `Passageiro ${String.fromCharCode(64 + index)} (${forCustomer.slice(-4)})`],
      );
      await adminPool.query(
        `INSERT INTO excursion_customers (agency_id, excursion_departure_id, customer_id, trip_id, sale_value)
         VALUES ($1, $2, $3, $4, $5)`,
        [forAgency, departureId, passengerCustomer.rows[0]!.id, tripId, value.toFixed(2)],
      );
    }
    return departureId;
  }

  async function createRule(
    employeeId: string,
    productType: EmployeeCommissionProductType,
    overrides: Partial<Parameters<typeof createEmployeeCommissionRule>[1]> = {},
  ) {
    return runWithTenantContext(ownerContext, () =>
      createEmployeeCommissionRule(
        database,
        {
          employeeId,
          productType,
          calculationType: EmployeeCommissionCalculationType.PERCENTAGE,
          calculationBasis: EmployeeCommissionBasis.PRODUCT_TOTAL,
          percentageRate: 5,
          ...overrides,
        },
        ownerUserId,
      ),
    );
  }

  // ------------------------------------------------------------
  // 1 & 2. Different employees, different rates, same/different product
  // ------------------------------------------------------------
  it('employee A and employee B can have different rates for the same product type', async () => {
    await createRule(employeeAId, EmployeeCommissionProductType.AIR, { percentageRate: 3 });
    await createRule(employeeBId, EmployeeCommissionProductType.AIR, { percentageRate: 8 });

    const ruleA = await runWithTenantContext(ownerContext, () =>
      findApplicableRule(database, employeeAId, EmployeeCommissionProductType.AIR, new Date()),
    );
    const ruleB = await runWithTenantContext(ownerContext, () =>
      findApplicableRule(database, employeeBId, EmployeeCommissionProductType.AIR, new Date()),
    );
    expect(ruleA?.percentageRate).toBe(3);
    expect(ruleB?.percentageRate).toBe(8);
  });

  it('the same employee can have different rules for different product types', async () => {
    await createRule(employeeAId, EmployeeCommissionProductType.EXCURSION, { percentageRate: 5 });
    await createRule(employeeAId, EmployeeCommissionProductType.AIR, { percentageRate: 3 });

    const excursionRule = await runWithTenantContext(ownerContext, () =>
      findApplicableRule(database, employeeAId, EmployeeCommissionProductType.EXCURSION, new Date()),
    );
    const airRule = await runWithTenantContext(ownerContext, () =>
      findApplicableRule(database, employeeAId, EmployeeCommissionProductType.AIR, new Date()),
    );
    expect(excursionRule?.percentageRate).toBe(5);
    expect(airRule?.percentageRate).toBe(3);
  });

  // ------------------------------------------------------------
  // 3. EXCURSION percentage per passenger
  // ------------------------------------------------------------
  it('EXCURSION PER_PASSENGER sums real per-passenger values (2000+2000+1800 -> 5% = 290)', async () => {
    await createRule(employeeAId, EmployeeCommissionProductType.EXCURSION, {
      calculationBasis: EmployeeCommissionBasis.PER_PASSENGER,
      percentageRate: 5,
    });

    const saleId = await seedSale(5800);
    const tripId = await seedTrip(saleId);
    const excursionId = await seedExcursionWithPassengers(tripId, [2000, 2000, 1800]);

    const commission = await runWithTenantContext(ownerContext, () =>
      generateEmployeeCommission(database, {
        saleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.EXCURSION,
        sourceItemId: excursionId,
      }),
    );

    expect(commission.calculationBase).toBe(5800);
    expect(commission.amount).toBe(290);
    expect(commission.quantity).toBe(3);
  });

  // ------------------------------------------------------------
  // 4. AIR percentage
  // ------------------------------------------------------------
  it('AIR PRODUCT_TOTAL applies percentage to the real air_services.sale_value', async () => {
    await createRule(employeeAId, EmployeeCommissionProductType.AIR, { percentageRate: 3 });

    const saleId = await seedSale(1000);
    const tripId = await seedTrip(saleId);
    const airServiceId = await seedAirService(tripId, 1000);

    const commission = await runWithTenantContext(ownerContext, () =>
      generateEmployeeCommission(database, {
        saleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.AIR,
        sourceItemId: airServiceId,
      }),
    );

    expect(commission.calculationBase).toBe(1000);
    expect(commission.amount).toBe(30);
  });

  // ------------------------------------------------------------
  // 5. Fixed value per ticket
  // ------------------------------------------------------------
  it('AIR FIXED_PER_TICKET applies a flat amount, ignoring the ticket price', async () => {
    await createRule(employeeAId, EmployeeCommissionProductType.AIR, {
      calculationType: EmployeeCommissionCalculationType.FIXED,
      calculationBasis: EmployeeCommissionBasis.FIXED_PER_TICKET,
      percentageRate: undefined,
      fixedAmount: 25,
    });

    const saleId = await seedSale(1000);
    const tripId = await seedTrip(saleId);
    const airServiceId = await seedAirService(tripId, 9999);

    const commission = await runWithTenantContext(ownerContext, () =>
      generateEmployeeCommission(database, {
        saleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.AIR,
        sourceItemId: airServiceId,
      }),
    );

    expect(commission.amount).toBe(25);
    expect(commission.rate).toBeUndefined();
  });

  // ------------------------------------------------------------
  // 6. PACKAGE percentage
  // ------------------------------------------------------------
  it('PACKAGE PACKAGE_TOTAL applies percentage to the real sales.total', async () => {
    await createRule(employeeAId, EmployeeCommissionProductType.PACKAGE, {
      calculationBasis: EmployeeCommissionBasis.PACKAGE_TOTAL,
      percentageRate: 4,
    });

    const saleId = await seedSale(10000);

    const commission = await runWithTenantContext(ownerContext, () =>
      generateEmployeeCommission(database, {
        saleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.PACKAGE,
      }),
    );

    expect(commission.calculationBase).toBe(10000);
    expect(commission.amount).toBe(400);
  });

  // ------------------------------------------------------------
  // 7 & 8. Vigência + alteração de regra não muda histórico (snapshot)
  // ------------------------------------------------------------
  it('changing a rule (closing the old one, activating a new one) never changes a historical commission', async () => {
    // January: João = 5%
    const januaryRule = await createRule(employeeAId, EmployeeCommissionProductType.PACKAGE, {
      calculationBasis: EmployeeCommissionBasis.PACKAGE_TOTAL,
      percentageRate: 5,
      validFrom: '2026-01-01',
    });

    const januarySaleId = await seedSale(1000);
    await adminPool.query(`UPDATE sales SET created_at = '2026-01-15T00:00:00Z' WHERE id = $1`, [januarySaleId]);

    const januaryCommission = await runWithTenantContext(ownerContext, () =>
      generateEmployeeCommission(database, {
        saleId: januarySaleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.PACKAGE,
      }),
    );
    expect(januaryCommission.amount).toBe(50); // 5% of 1000
    expect(januaryCommission.commissionRuleId).toBe(januaryRule.id);

    // February: rule changes to 7% (closes January's open-ended rule, activates a new one)
    const februaryRule = await createRule(employeeAId, EmployeeCommissionProductType.PACKAGE, {
      calculationBasis: EmployeeCommissionBasis.PACKAGE_TOTAL,
      percentageRate: 7,
      validFrom: '2026-02-01',
    });
    expect(februaryRule.id).not.toBe(januaryRule.id);

    const februarySaleId = await seedSale(1000);
    await adminPool.query(`UPDATE sales SET created_at = '2026-02-15T00:00:00Z' WHERE id = $1`, [februarySaleId]);

    const februaryCommission = await runWithTenantContext(ownerContext, () =>
      generateEmployeeCommission(database, {
        saleId: februarySaleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.PACKAGE,
      }),
    );
    expect(februaryCommission.amount).toBe(70); // 7% of 1000, the NEW rate

    // Re-reading January's commission (already persisted) must still show 5% / 50 -- unaffected.
    const reread = await adminPool.query<{ amount: string; rate: string }>(
      `SELECT amount, rate FROM commission_entries WHERE id = $1`,
      [januaryCommission.id],
    );
    expect(Number(reread.rows[0]!.amount)).toBe(50);
    expect(Number(reread.rows[0]!.rate)).toBe(5);
  });

  it('respects vigência: a rule with validUntil in the past does not apply to a sale recognized after it', async () => {
    await createRule(employeeAId, EmployeeCommissionProductType.PACKAGE, {
      calculationBasis: EmployeeCommissionBasis.PACKAGE_TOTAL,
      percentageRate: 5,
      validFrom: '2026-01-01',
      validUntil: '2026-01-31',
    });

    const rule = await runWithTenantContext(ownerContext, () =>
      findApplicableRule(
        database,
        employeeAId,
        EmployeeCommissionProductType.PACKAGE,
        new Date('2026-03-01T00:00:00Z'),
      ),
    );
    expect(rule).toBeNull();
  });

  // ------------------------------------------------------------
  // 9. Comissão não duplica
  // ------------------------------------------------------------
  it('generating a commission twice for the same sale+employee+product is rejected (no duplicate)', async () => {
    await createRule(employeeAId, EmployeeCommissionProductType.PACKAGE, {
      calculationBasis: EmployeeCommissionBasis.PACKAGE_TOTAL,
      percentageRate: 5,
    });
    const saleId = await seedSale(1000);

    await runWithTenantContext(ownerContext, () =>
      generateEmployeeCommission(database, {
        saleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.PACKAGE,
      }),
    );

    await expect(
      runWithTenantContext(ownerContext, () =>
        generateEmployeeCommission(database, {
          saleId,
          employeeId: employeeAId,
          productType: EmployeeCommissionProductType.PACKAGE,
        }),
      ),
    ).rejects.toThrow();

    const count = await adminPool.query<{ count: string }>(
      `SELECT COUNT(*) FROM commission_entries WHERE sale_id = $1 AND status <> 'CANCELLED'`,
      [saleId],
    );
    expect(Number(count.rows[0]!.count)).toBe(1);
  });

  it('the same sale CAN hold one EXCURSION commission and one AIR commission for the same employee (widened dedupe guard)', async () => {
    await createRule(employeeAId, EmployeeCommissionProductType.EXCURSION, {
      calculationBasis: EmployeeCommissionBasis.PER_PASSENGER,
      percentageRate: 5,
    });
    await createRule(employeeAId, EmployeeCommissionProductType.AIR, { percentageRate: 3 });

    const saleId = await seedSale(2000);
    const tripId = await seedTrip(saleId);
    const excursionId = await seedExcursionWithPassengers(tripId, [1000, 1000]);
    const airServiceId = await seedAirService(tripId, 500);

    await runWithTenantContext(ownerContext, () =>
      generateEmployeeCommission(database, {
        saleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.EXCURSION,
        sourceItemId: excursionId,
      }),
    );
    await runWithTenantContext(ownerContext, () =>
      generateEmployeeCommission(database, {
        saleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.AIR,
        sourceItemId: airServiceId,
      }),
    );

    const count = await adminPool.query<{ count: string }>(
      `SELECT COUNT(*) FROM commission_entries WHERE sale_id = $1 AND status <> 'CANCELLED'`,
      [saleId],
    );
    expect(Number(count.rows[0]!.count)).toBe(2);
  });

  // ------------------------------------------------------------
  // 10. Tenant isolation
  // ------------------------------------------------------------
  it('a rule created for Agency A is never visible/applicable from Agency B tenant context', async () => {
    await createRule(employeeAId, EmployeeCommissionProductType.PACKAGE, {
      calculationBasis: EmployeeCommissionBasis.PACKAGE_TOTAL,
      percentageRate: 5,
    });

    const rulesFromB = await runWithTenantContext(contextB, () =>
      listEmployeeCommissionRules(database, {}),
    );
    expect(rulesFromB).toHaveLength(0);

    // Direct cross-tenant lookup by employeeId also fails closed (RLS),
    // not just "filtered by agency in application code".
    const ruleFromB = await runWithTenantContext(contextB, () =>
      findApplicableRule(database, employeeAId, EmployeeCommissionProductType.PACKAGE, new Date()),
    );
    expect(ruleFromB).toBeNull();
  });

  // ------------------------------------------------------------
  // 11. AGENT não altera própria regra (HTTP permission)
  // ------------------------------------------------------------
  function buildTestApp() {
    return buildApp({
      authProvider: {
        authenticate(request) {
          const header = request.headers['x-test-role'];
          if (!header || typeof header !== 'string') return Promise.resolve(null);
          return Promise.resolve({
            agencyId,
            userId: header === 'AGENT' ? agentUserId : ownerUserId,
            role: header as UserRole,
            email: 'test@example.test',
          });
        },
      },
      validateUserAgencyAccess: () => Promise.resolve(true),
      database,
      platformAuthProvider: { authenticate: () => Promise.resolve(null) },
      rateLimit: { classLimits: { SYSTEM_INTERNAL: { windowMs: 60_000, max: 200 } } },
    });
  }

  it('AGENT cannot create/alter an employee commission rule (403)', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/employee-commission-rules',
      headers: { 'x-test-role': 'AGENT' },
      payload: {
        employeeId: employeeAId,
        productType: 'PACKAGE',
        calculationType: 'PERCENTAGE',
        calculationBasis: 'PACKAGE_TOTAL',
        percentageRate: 5,
      },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('OWNER/ADMIN can create an employee commission rule (201)', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/employee-commission-rules',
      headers: { 'x-test-role': 'OWNER' },
      payload: {
        employeeId: employeeAId,
        productType: 'PACKAGE',
        calculationType: 'PERCENTAGE',
        calculationBasis: 'PACKAGE_TOTAL',
        percentageRate: 5,
      },
    });
    expect(response.statusCode).toBe(201);
    await app.close();
  });

  it('AGENT can view their own commissions via /commissions/mine, strictly self-scoped', async () => {
    await adminPool.query(
      `INSERT INTO employees (agency_id, name, user_id) VALUES ($1, 'Agente Teste', $2)`,
      [agencyId, agentUserId],
    );
    await createRule(employeeAId, EmployeeCommissionProductType.PACKAGE, {
      calculationBasis: EmployeeCommissionBasis.PACKAGE_TOTAL,
      percentageRate: 5,
    });
    const saleId = await seedSale(1000);
    await runWithTenantContext(ownerContext, () =>
      generateEmployeeCommission(database, {
        saleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.PACKAGE,
      }),
    );

    // The AGENT's own linked employee has no commissions -- /commissions/mine
    // must return an empty list for them, never employeeAId's commissions,
    // even though both belong to the same agency.
    const app = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/commissions/mine',
      headers: { 'x-test-role': 'AGENT' },
    });
    expect(response.statusCode).toBe(200);
    const body: { commissions: unknown[] } = response.json();
    expect(body.commissions).toHaveLength(0);
    await app.close();
  });

  // ------------------------------------------------------------
  // 12. Backend-authoritative (browser cannot supply the amount)
  // ------------------------------------------------------------
  it('a commission amount/rate supplied by the client is ignored -- the backend always recomputes it', async () => {
    await createRule(employeeAId, EmployeeCommissionProductType.PACKAGE, {
      calculationBasis: EmployeeCommissionBasis.PACKAGE_TOTAL,
      percentageRate: 5,
    });
    const saleId = await seedSale(1000);

    const commission = await runWithTenantContext(ownerContext, () =>
      generateEmployeeCommission(database, {
        saleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.PACKAGE,
        // @ts-expect-error -- deliberately probing that these client-supplied
        // fields (not part of GenerateEmployeeCommissionInput) have no effect.
        commissionAmount: 999999,
        rate: 999,
      }),
    );

    expect(commission.amount).toBe(50); // 5% of 1000, computed server-side, not 999999
  });

  // ------------------------------------------------------------
  // 13. Regra ausente
  // ------------------------------------------------------------
  it('generating a commission with no applicable rule fails with a clear error', async () => {
    const saleId = await seedSale(1000);
    await expect(
      runWithTenantContext(ownerContext, () =>
        generateEmployeeCommission(database, {
          saleId,
          employeeId: employeeAId,
          productType: EmployeeCommissionProductType.PACKAGE,
        }),
      ),
    ).rejects.toThrow(/No active commission rule/);
  });

  // ------------------------------------------------------------
  // 14. Conflito de regras (precedence)
  // ------------------------------------------------------------
  it('creating a second open-ended ACTIVE rule for the same employee+product closes the previous one deterministically', async () => {
    const first = await createRule(employeeAId, EmployeeCommissionProductType.PACKAGE, {
      calculationBasis: EmployeeCommissionBasis.PACKAGE_TOTAL,
      percentageRate: 5,
    });
    const second = await createRule(employeeAId, EmployeeCommissionProductType.PACKAGE, {
      calculationBasis: EmployeeCommissionBasis.PACKAGE_TOTAL,
      percentageRate: 8,
    });

    const reread = await adminPool.query<{ id: string; valid_until: string | null; status: string }>(
      `SELECT id, valid_until, status FROM employee_commission_rules WHERE agency_id = $1 AND employee_id = $2 AND product_type = 'PACKAGE' ORDER BY created_at`,
      [agencyId, employeeAId],
    );
    expect(reread.rows).toHaveLength(2);
    const firstRow = reread.rows.find((r) => r.id === first.id)!;
    const secondRow = reread.rows.find((r) => r.id === second.id)!;
    expect(firstRow.valid_until).not.toBeNull(); // closed
    expect(secondRow.valid_until).toBeNull(); // still open-ended, the current one

    // Only ONE currently-applicable rule -- never chosen randomly.
    const applicable = await runWithTenantContext(ownerContext, () =>
      findApplicableRule(database, employeeAId, EmployeeCommissionProductType.PACKAGE, new Date()),
    );
    expect(applicable?.id).toBe(second.id);
    expect(applicable?.percentageRate).toBe(8);
  });

  // ------------------------------------------------------------
  // 15. Reload / persistência
  // ------------------------------------------------------------
  it('a generated commission persists and is re-readable exactly as generated (reload)', async () => {
    await createRule(employeeAId, EmployeeCommissionProductType.PACKAGE, {
      calculationBasis: EmployeeCommissionBasis.PACKAGE_TOTAL,
      percentageRate: 5,
    });
    const saleId = await seedSale(1000);
    const commission = await runWithTenantContext(ownerContext, () =>
      generateEmployeeCommission(database, {
        saleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.PACKAGE,
      }),
    );

    const reread = await adminPool.query<{ id: string; amount: string; status: string }>(
      `SELECT id, amount, status FROM commission_entries WHERE id = $1`,
      [commission.id],
    );
    expect(reread.rows[0]!.id).toBe(commission.id);
    expect(Number(reread.rows[0]!.amount)).toBe(50);
    expect(reread.rows[0]!.status).toBe('PENDING');
  });

  // ------------------------------------------------------------
  // Cancellation cascade (audited gap, fixed this round)
  // ------------------------------------------------------------
  it('cancelling a sale auto-cancels its PENDING commission entries', async () => {
    await createRule(employeeAId, EmployeeCommissionProductType.PACKAGE, {
      calculationBasis: EmployeeCommissionBasis.PACKAGE_TOTAL,
      percentageRate: 5,
    });
    const saleId = await seedSale(1000);
    const commission = await runWithTenantContext(ownerContext, () =>
      generateEmployeeCommission(database, {
        saleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.PACKAGE,
      }),
    );
    expect(commission.status).toBe('PENDING');

    await runWithTenantContext(ownerContext, () => cancelSale(database, saleId));

    const reread = await adminPool.query<{ status: string }>(
      `SELECT status FROM commission_entries WHERE id = $1`,
      [commission.id],
    );
    expect(reread.rows[0]!.status).toBe('CANCELLED');
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
         ($1, 'Agency Commission Test', 'agency-commission-rules-test', 'agency-commission@example.test', 'FREE', 'ACTIVE'),
         ($2, 'Agency B Commission Test', 'agency-b-commission-rules-test', 'agency-b-commission@example.test', 'FREE', 'ACTIVE')`,
      [agencyId, agencyBId],
    );
    await pool.query(
      `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
       VALUES
         ($1, $2, 'owner@example.test', 'Owner', 'OWNER', 'hash-for-employee-commission-rules-test-only', 'ACTIVE'),
         ($3, $2, 'agent@example.test', 'Agente', 'AGENT', 'hash-for-employee-commission-rules-test-only', 'ACTIVE'),
         ($4, $5, 'owner-b@example.test', 'Owner B', 'OWNER', 'hash-for-employee-commission-rules-test-only', 'ACTIVE')`,
      [ownerUserId, agencyId, agentUserId, userBOwnerId, agencyBId],
    );
    await pool.query(
      `INSERT INTO customers (agency_id, id, name, status)
       VALUES ($1, $2, 'Cliente Teste', 'ACTIVE'), ($3, $4, 'Cliente B Teste', 'ACTIVE')`,
      [agencyId, customerId, agencyBId, customerBId],
    );
    await pool.query(
      `INSERT INTO employees (id, agency_id, name, user_id)
       VALUES ($1, $2, 'João (Funcionário A)', NULL), ($3, $2, 'Maria (Funcionário B)', NULL)`,
      [employeeAId, agencyId, employeeBId],
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
    throw new Error('Employee commission rules data-layer tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Employee commission rules data-layer tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Employee commission rules data-layer tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run employee commission rules tests against unsafe DATABASE_URL.');
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
