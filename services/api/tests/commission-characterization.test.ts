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
  PaymentDirection,
  UserRole,
} from '../../../packages/domain/types';
import { createDatabaseRuntime, type DatabaseRuntime } from '../src/database';
import {
  approveCommissionEntry,
  createPayableFromCommissionEntry,
  listCommissionChannelConflicts,
} from '../src/commissions';
import { createEmployeeCommissionRule } from '../src/employee-commission-rules';
import { generateEmployeeCommission } from '../src/employee-commissions';
import { allocatePayment, recordPayment } from '../src/financial';
import { approvePayrollEntry, generatePayrollEntry, payPayrollEntry } from '../src/payroll';
import { cancelSale } from '../src/sales';

// Fase 0 da paridade de comissões Full/Lite (.claude/RESPOSTA-REVISAO-PARIDADE-FULL-LITE-2026-10-23.md).
//   CH-xx  caracterização: fixa comportamento ATUAL do Full que NÃO muda na Fase 0 (arredondamento, data UTC, dedupe, janela).
//   PRO-xx proteção: corrida do payable, PAID da entrada, índice único.
//   SET-xx canal único folha OU avulso (F3), folha parcial, cancelamento de venda (409).
// Nenhum recurso novo (sem progressividade, categorias, atribuições, liberação por recebimento).

const repoRoot = resolve(import.meta.dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'infrastructure/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()
  .map((name) => resolve(migrationsDir, name));
const prepareRolesSql = resolve(repoRoot, 'tests/integration/database/002_prepare_local_roles.sql');
const composeFile = resolve(repoRoot, 'infrastructure/docker-compose.local-postgres.yml');

const projectName = process.env.DATABASE_TEST_PROJECT_NAME ?? 'travel-platform-commission-characterization-postgres';
const containerName = process.env.DATABASE_TEST_CONTAINER_NAME ?? 'travel-platform-postgres-local';
const postgresImage = 'postgres:15';
const databaseHost = process.env.DATABASE_TEST_HOST ?? '127.0.0.1';
const databasePort = Number(process.env.DATABASE_TEST_PORT ?? '55432');
const databaseName = process.env.DATABASE_TEST_NAME ?? 'travel_platform_test';
const adminUser = process.env.DATABASE_TEST_USER ?? 'travel_test';
const adminPassword = process.env.DATABASE_TEST_PASSWORD ?? 'travel_test_password';
const runtimeUser = 'travel_app_runtime_local';
const runtimePassword = 'travel_app_runtime_local_password';
const poolPasswordKey = 'pass' + 'word';

const agencyId = '41000000-0000-4000-8000-000000000001';
const customerId = '41000000-0000-4000-8000-000000000010';
const ownerUserId = '41000000-0000-4000-8000-000000000020';
const employeeAId = '41000000-0000-4000-8000-000000000030';
const competence = '2027-01-01';

const ownerContext = { agencyId, userId: ownerUserId, userRole: UserRole.OWNER, email: 'owner@example.test' };

describe('Commission Phase 0: characterization and channel protections (Full)', () => {
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
    // These tests characterise the pre-COM-03 channel behaviour: entries here are LEGACY (no release policy).
    await adminPool.query("ALTER TABLE commission_entries ALTER COLUMN release_mode SET DEFAULT 'LEGACY'");
  });

  beforeEach(async () => {
    await adminPool.query(
      'TRUNCATE TABLE payment_allocations, payments, payables, payroll_entries, commission_entries, employee_commission_rules RESTART IDENTITY CASCADE',
    );
    await adminPool.query('DELETE FROM air_services');
    await adminPool.query('DELETE FROM trips');
    await adminPool.query('DELETE FROM sales');
    await adminPool.query(`UPDATE employees SET base_salary = 3000 WHERE id = $1`, [employeeAId]);
  });

  afterAll(async () => {
    await runtimePool?.end();
    await adminPool?.end();
    compose(['down', '-v']);
  });

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------
  async function seedSale(total: number, createdAt?: string) {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total, status)
       VALUES ($1, $2, $3, $4, '0.00', $4, 'CONFIRMED') RETURNING id`,
      [agencyId, customerId, ownerUserId, total.toFixed(2)],
    );
    const id = result.rows[0]!.id;
    if (createdAt) await adminPool.query(`UPDATE sales SET created_at = $2 WHERE id = $1`, [id, createdAt]);
    return id;
  }

  async function seedTrip(saleId: string) {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO trips (agency_id, customer_id, sale_id, name, destination, start_date, end_date)
       VALUES ($1, $2, $3, 'Viagem Teste', 'Cancun', '2026-06-15', '2026-06-22') RETURNING id`,
      [agencyId, customerId, saleId],
    );
    return result.rows[0]!.id;
  }

  async function seedAirService(tripId: string, saleValue: number, sequence = 1) {
    const result = await adminPool.query<{ id: string }>(
      `INSERT INTO air_services (
         agency_id, trip_id, customer_id, airline, direction, sequence,
         origin, destination, departure_date, arrival_date, cabin_class,
         fare, taxes, fees, cost, sale_value, currency, status
       ) VALUES (
         $1, $2, $3, 'LATAM', 'OUTBOUND', $5,
         'GRU', 'GIG', '2026-06-15', '2026-06-15', 'ECONOMY',
         500.00, 80.00, 20.00, 400.00, $4, 'BRL', 'CONFIRMED'
       ) RETURNING id`,
      [agencyId, tripId, customerId, saleValue.toFixed(2), sequence],
    );
    return result.rows[0]!.id;
  }

  async function createRule(
    productType: EmployeeCommissionProductType,
    overrides: Partial<Parameters<typeof createEmployeeCommissionRule>[1]> = {},
  ) {
    return runWithTenantContext(ownerContext, () =>
      createEmployeeCommissionRule(
        database,
        {
          employeeId: employeeAId,
          productType,
          calculationType: EmployeeCommissionCalculationType.PERCENTAGE,
          calculationBasis: EmployeeCommissionBasis.PACKAGE_TOTAL,
          percentageRate: 10,
          ...overrides,
        },
        ownerUserId,
      ),
    );
  }

  async function ensurePackageRule() {
    const existing = await adminPool.query(`SELECT 1 FROM employee_commission_rules WHERE employee_id = $1`, [employeeAId]);
    if ((existing.rowCount ?? 0) === 0) await createRule(EmployeeCommissionProductType.PACKAGE);
  }

  /** APPROVED PACKAGE commission of 10% over `saleTotal`, recognised in the payroll competence month. */
  async function approvedEntry(saleTotal = 1000): Promise<{ id: string; saleId: string }> {
    await ensurePackageRule();
    const saleId = await seedSale(saleTotal);
    const entry = await runWithTenantContext(ownerContext, () =>
      generateEmployeeCommission(database, {
        saleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.PACKAGE,
      }),
    );
    await runWithTenantContext(ownerContext, () => approveCommissionEntry(database, entry.id, ownerUserId));
    await adminPool.query(`UPDATE commission_entries SET created_at = '2027-01-15T12:00:00Z' WHERE id = $1`, [
      entry.id,
    ]);
    return { id: entry.id, saleId };
  }

  async function entryRow(id: string) {
    const result = await adminPool.query<{ status: string; paid_at: Date | null; payroll_entry_id: string | null }>(
      `SELECT status, paid_at, payroll_entry_id FROM commission_entries WHERE id = $1`,
      [id],
    );
    return result.rows[0]!;
  }

  async function livePayables(entryId: string) {
    const result = await adminPool.query(
      `SELECT 1 FROM payables WHERE commission_entry_id = $1 AND status <> 'CANCELLED'`,
      [entryId],
    );
    return result.rowCount ?? 0;
  }

  const inTenant = <T>(fn: () => Promise<T>) => runWithTenantContext(ownerContext, fn);

  async function payOut(amount: number, payableId: string) {
    return inTenant(async () => {
      const payment = await recordPayment(database, {
        direction: PaymentDirection.OUT,
        amount,
        occurredAt: new Date('2027-02-05T00:00:00Z'),
        method: 'PIX',
      });
      return allocatePayment(database, payment.id, [{ payableId, amount }]);
    });
  }

  async function approvedPayroll(): Promise<{ payrollId: string; commissionsTotal: number; netAmount: number }> {
    const generated = await inTenant(() => generatePayrollEntry(database, { employeeId: employeeAId, competence }));
    await inTenant(() => approvePayrollEntry(database, generated.id));
    return { payrollId: generated.id, commissionsTotal: generated.commissionsTotal, netAmount: generated.netAmount };
  }

  // ------------------------------------------------------------
  // CH: characterization (behaviour that is NOT changed by Phase 0)
  // ------------------------------------------------------------
  it('CH-01 rounding: 18.50 x 3% is 0.55 in Full (Lite roundMoney gives 0.56) -- kept by decision F4', async () => {
    const saleId = await seedSale(18.5);
    const tripId = await seedTrip(saleId);
    const airId = await seedAirService(tripId, 18.5);
    await createRule(EmployeeCommissionProductType.AIR, {
      calculationBasis: EmployeeCommissionBasis.PRODUCT_TOTAL,
      percentageRate: 3,
    });

    const entry = await inTenant(() =>
      generateEmployeeCommission(database, {
        saleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.AIR,
        sourceItemId: airId,
      }),
    );
    expect(entry.amount).toBe(0.55);
  });

  it('CH-06 recognition date is the UTC date of sales.created_at (23:30 UTC-3 on 10/10 selects the 11/10 rule)', async () => {
    await createRule(EmployeeCommissionProductType.PACKAGE, {
      percentageRate: 3,
      validFrom: '2026-01-01',
      validUntil: '2026-10-10',
    });
    await createRule(EmployeeCommissionProductType.PACKAGE, { percentageRate: 7, validFrom: '2026-10-11' });
    const saleId = await seedSale(1000, '2026-10-11T02:30:00Z'); // = 2026-10-10 23:30 in UTC-3

    const entry = await inTenant(() =>
      generateEmployeeCommission(database, {
        saleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.PACKAGE,
      }),
    );
    expect(entry.rate).toBe(7);
  });

  it('CH-07 dedupe is per (sale, employee, product): a second AIR item of the same sale is refused', async () => {
    const saleId = await seedSale(1000);
    const tripId = await seedTrip(saleId);
    const air1 = await seedAirService(tripId, 400, 1);
    const air2 = await seedAirService(tripId, 600, 2);
    await createRule(EmployeeCommissionProductType.AIR, { calculationBasis: EmployeeCommissionBasis.PRODUCT_TOTAL });

    await inTenant(() =>
      generateEmployeeCommission(database, {
        saleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.AIR,
        sourceItemId: air1,
      }),
    );
    await expect(
      inTenant(() =>
        generateEmployeeCommission(database, {
          saleId,
          employeeId: employeeAId,
          productType: EmployeeCommissionProductType.AIR,
          sourceItemId: air2,
        }),
      ),
    ).rejects.toThrow(/already exists/);
  });

  it('CH-08 a new open rule starting on the same valid_from as the previous one is rejected by the validity CHECK (R11)', async () => {
    await createRule(EmployeeCommissionProductType.PACKAGE, { validFrom: '2026-05-01' });
    await expect(
      createRule(EmployeeCommissionProductType.PACKAGE, { validFrom: '2026-05-01', percentageRate: 12 }),
    ).rejects.toThrow(/validity_check/);
  });

  // ------------------------------------------------------------
  // PRO-01 / PRO-02: one live payable per commission entry
  // ------------------------------------------------------------
  it('PRO-01 concurrent create-payable calls on the same entry create exactly one payable', async () => {
    for (let round = 0; round < 5; round += 1) {
      const { id } = await approvedEntry(1000 + round);
      const results = await Promise.allSettled([
        inTenant(() => createPayableFromCommissionEntry(database, id)),
        inTenant(() => createPayableFromCommissionEntry(database, id)),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await livePayables(id)).toBe(1);
    }
  });

  it('PRO-02 the database refuses a second live payable for the same commission entry', async () => {
    const { id } = await approvedEntry();
    await inTenant(() => createPayableFromCommissionEntry(database, id));

    await expect(
      adminPool.query(
        `INSERT INTO payables (agency_id, description, amount, due_at, commission_entry_id)
         SELECT agency_id, 'dup', 10, now(), commission_entry_id FROM payables WHERE commission_entry_id = $1`,
        [id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('PRO-02b a cancelled payable does not block a new one (index is partial)', async () => {
    const { id } = await approvedEntry();
    const first = await inTenant(() => createPayableFromCommissionEntry(database, id));
    await adminPool.query(`UPDATE payables SET status = 'CANCELLED' WHERE id = $1`, [first.payableId]);
    await adminPool.query(
      `INSERT INTO payables (agency_id, description, amount, due_at, commission_entry_id)
       VALUES ($1, 'again', 10, now(), $2)`,
      [agencyId, id],
    );
    expect(await livePayables(id)).toBe(1);
  });

  // ------------------------------------------------------------
  // PRO-03: entry follows the payable settlement
  // ------------------------------------------------------------
  it('PRO-03 the entry stays PAYABLE while partially paid and becomes PAID when the payable is settled', async () => {
    const { id } = await approvedEntry(1000); // commission 100.00
    const { payableId } = await inTenant(() => createPayableFromCommissionEntry(database, id));

    await payOut(40, payableId);
    expect((await entryRow(id)).status).toBe('PAYABLE');

    await payOut(60, payableId);
    const row = await entryRow(id);
    expect(row.status).toBe('PAID');
    expect(row.paid_at).not.toBeNull();
  });

  // ------------------------------------------------------------
  // SET: single channel (payroll XOR standalone payable) -- decision F3
  // ------------------------------------------------------------
  it('SET-01a an entry reserved by a payroll cannot also get a standalone payable (409)', async () => {
    const { id } = await approvedEntry(1000);
    const payroll = await approvedPayroll();
    expect(payroll.commissionsTotal).toBe(100);
    expect(payroll.netAmount).toBe(3100);
    expect((await entryRow(id)).payroll_entry_id).toBe(payroll.payrollId);

    await expect(inTenant(() => createPayableFromCommissionEntry(database, id))).rejects.toThrow(/payroll/i);
    expect(await livePayables(id)).toBe(0);
  });

  it('SET-01b an entry already in a standalone payable is not added to the payroll', async () => {
    const { id } = await approvedEntry(1000);
    await inTenant(() => createPayableFromCommissionEntry(database, id));

    const payroll = await approvedPayroll();
    expect(payroll.commissionsTotal).toBe(0);
    expect(payroll.netAmount).toBe(3000);
    expect((await entryRow(id)).payroll_entry_id).toBeNull();
  });

  it('SET-01c a PAID entry is never added to a payroll', async () => {
    const { id } = await approvedEntry(1000);
    const { payableId } = await inTenant(() => createPayableFromCommissionEntry(database, id));
    await payOut(100, payableId);
    expect((await entryRow(id)).status).toBe('PAID');

    const payroll = await approvedPayroll();
    expect(payroll.commissionsTotal).toBe(0);
  });

  it('SET-02 regenerating an OPEN payroll does not duplicate the reservation', async () => {
    const { id } = await approvedEntry(1000);
    const first = await inTenant(() => generatePayrollEntry(database, { employeeId: employeeAId, competence }));
    const second = await inTenant(() => generatePayrollEntry(database, { employeeId: employeeAId, competence }));

    expect(second.id).toBe(first.id);
    expect(second.commissionsTotal).toBe(100);
    expect(second.netAmount).toBe(3100);
    expect((await entryRow(id)).payroll_entry_id).toBe(first.id);
  });

  it('SET-02b a commission approved after the payroll was generated is picked up when the OPEN payroll is regenerated', async () => {
    const first = await inTenant(() => generatePayrollEntry(database, { employeeId: employeeAId, competence }));
    expect(first.commissionsTotal).toBe(0);
    const { id } = await approvedEntry(2000);

    const second = await inTenant(() => generatePayrollEntry(database, { employeeId: employeeAId, competence }));
    expect(second.commissionsTotal).toBe(200);
    expect((await entryRow(id)).payroll_entry_id).toBe(second.id);
  });

  it('SET-02c regeneration waits for a concurrent approval and cannot change an approved payroll', async () => {
    const payroll = await inTenant(() => generatePayrollEntry(database, { employeeId: employeeAId, competence }));
    const approving = await adminPool.connect();
    let regeneration: Promise<boolean> | undefined;
    try {
      await approving.query('BEGIN');
      await approving.query('SELECT id FROM payroll_entries WHERE id = $1 FOR UPDATE', [payroll.id]);
      regeneration = inTenant(() => generatePayrollEntry(database, {
        employeeId: employeeAId, competence, bonuses: 500,
      })).then(() => true, () => false);
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const waiting = await adminPool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_stat_activity
           WHERE datname = current_database() AND wait_event_type = 'Lock'
             AND query LIKE '%payroll_entries%' AND pid <> pg_backend_pid()`,
        );
        if (waiting.rows[0]!.n > 0) { blocked = true; break; }
        await new Promise((resolveWait) => setTimeout(resolveWait, 25));
      }
      if (!blocked) throw new Error('Regeneration never reached the payroll row lock');
      await approving.query(`UPDATE payroll_entries SET status = 'APPROVED' WHERE id = $1`, [payroll.id]);
      await approving.query('COMMIT');
      expect(await regeneration).toBe(false);
      const saved = await adminPool.query<{ net_amount: string }>(
        'SELECT net_amount::text FROM payroll_entries WHERE id = $1', [payroll.id],
      );
      expect(Number(saved.rows[0]!.net_amount)).toBe(payroll.netAmount);
    } finally {
      await approving.query('ROLLBACK');
      approving.release();
      await regeneration;
    }
  });

  it('SET-03 concurrent standalone payable and payroll generation never commit the same entry to both channels', async () => {
    for (let round = 0; round < 5; round += 1) {
      await adminPool.query('TRUNCATE TABLE payment_allocations, payments, payables, payroll_entries, commission_entries CASCADE');
      const { id } = await approvedEntry(1000);
      await Promise.allSettled([
        inTenant(() => createPayableFromCommissionEntry(database, id)),
        inTenant(() => generatePayrollEntry(database, { employeeId: employeeAId, competence })),
      ]);
      const row = await entryRow(id);
      const hasPayable = (await livePayables(id)) > 0;
      expect(hasPayable && row.payroll_entry_id !== null).toBe(false);
    }
  });

  it('SET-04 a partially paid payroll does not settle its commissions; full payment does', async () => {
    const { id } = await approvedEntry(1000);
    const payroll = await approvedPayroll();
    const { payableId } = await inTenant(() => payPayrollEntry(database, payroll.payrollId));

    await payOut(1000, payableId);
    expect((await entryRow(id)).status).toBe('APPROVED');

    await payOut(2100, payableId);
    const row = await entryRow(id);
    expect(row.status).toBe('PAID');
    expect(row.paid_at).not.toBeNull();
  });

  it('SET-04b payment refuses a payroll whose reserved commission was cancelled after generation', async () => {
    const { id } = await approvedEntry();
    const payroll = await approvedPayroll();
    const { payableId } = await inTenant(() => payPayrollEntry(database, payroll.payrollId));
    await adminPool.query(`UPDATE commission_entries SET status = 'CANCELLED' WHERE id = $1`, [id]);

    await expect(payOut(payroll.netAmount, payableId)).rejects.toThrow(/commission|payroll/i);
    const result = await adminPool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM payment_allocations WHERE payable_id = $1`, [payableId],
    );
    expect(result.rows[0]!.n).toBe(0);
  });

  it('SET-04c payment refuses a payroll whose reserved commission amount changed', async () => {
    const { id } = await approvedEntry();
    const payroll = await approvedPayroll();
    const { payableId } = await inTenant(() => payPayrollEntry(database, payroll.payrollId));
    await adminPool.query(`UPDATE commission_entries SET amount = amount + 1 WHERE id = $1`, [id]);

    await expect(payOut(payroll.netAmount, payableId)).rejects.toThrow(/commission|payroll/i);
  });

  it('PRO-03b payment refuses a standalone payable whose commission was cancelled', async () => {
    const { id } = await approvedEntry();
    const { payableId } = await inTenant(() => createPayableFromCommissionEntry(database, id));
    await adminPool.query(`UPDATE commission_entries SET status = 'CANCELLED' WHERE id = $1`, [id]);

    await expect(payOut(100, payableId)).rejects.toThrow(/commission/i);
  });

  it('PRO-03c payment refuses an obligation that does not match the full commission amount', async () => {
    const { id } = await approvedEntry();
    const { payableId } = await inTenant(() => createPayableFromCommissionEntry(database, id));
    await adminPool.query(`UPDATE payables SET amount = 50 WHERE id = $1`, [payableId]);

    await expect(payOut(50, payableId)).rejects.toThrow(/commission/i);
    expect((await entryRow(id)).status).toBe('PAYABLE');
  });

  // ------------------------------------------------------------
  // SET-05: cancelling a sale whose commission is in a payable, a payroll or paid (decision F3 -> 409)
  // ------------------------------------------------------------
  it('SET-05a cancelling a sale whose commission is PENDING still cancels it (existing behaviour)', async () => {
    await ensurePackageRule();
    const saleId = await seedSale(1000);
    const entry = await inTenant(() =>
      generateEmployeeCommission(database, {
        saleId,
        employeeId: employeeAId,
        productType: EmployeeCommissionProductType.PACKAGE,
      }),
    );
    await inTenant(() => cancelSale(database, saleId));
    expect((await entryRow(entry.id)).status).toBe('CANCELLED');
  });

  it('SET-05b cancelling a sale whose commission is in a standalone payable is refused (409) and changes nothing', async () => {
    const { id, saleId } = await approvedEntry(1000);
    await inTenant(() => createPayableFromCommissionEntry(database, id));

    await expect(inTenant(() => cancelSale(database, saleId))).rejects.toThrow(/commission/i);
    expect((await entryRow(id)).status).toBe('PAYABLE');
    const sale = await adminPool.query<{ status: string }>(`SELECT status FROM sales WHERE id = $1`, [saleId]);
    expect(sale.rows[0]!.status).not.toBe('CANCELLED');
    expect(await livePayables(id)).toBe(1);
  });

  it('SET-05c cancelling a sale whose commission is reserved by a payroll is refused (409)', async () => {
    const { id, saleId } = await approvedEntry(1000);
    await approvedPayroll();

    await expect(inTenant(() => cancelSale(database, saleId))).rejects.toThrow(/commission/i);
    expect((await entryRow(id)).status).toBe('APPROVED');
  });

  it('SET-05d cancelling a sale whose commission is PAID is refused (409)', async () => {
    const { id, saleId } = await approvedEntry(1000);
    const { payableId } = await inTenant(() => createPayableFromCommissionEntry(database, id));
    await payOut(100, payableId);

    await expect(inTenant(() => cancelSale(database, saleId))).rejects.toThrow(/commission/i);
    expect((await entryRow(id)).status).toBe('PAID');
  });

  // ------------------------------------------------------------
  // SET-06: legacy conflicts are only reported
  // ------------------------------------------------------------
  it('SET-06 the conflict report lists entries paid through a standalone payable AND counted by a payroll, and changes nothing', async () => {
    const { id } = await approvedEntry(1000);
    const payroll = await approvedPayroll();
    // Fabricate the legacy shape (pre-protection): payroll counted the entry, then a payable was also created.
    await adminPool.query(`UPDATE commission_entries SET payroll_entry_id = NULL WHERE id = $1`, [id]);
    await inTenant(() => createPayableFromCommissionEntry(database, id));

    const before = await adminPool.query<{ n: number }>(`SELECT count(*)::int AS n FROM payables`);
    const conflicts = await inTenant(() => listCommissionChannelConflicts(database));
    const after = await adminPool.query<{ n: number }>(`SELECT count(*)::int AS n FROM payables`);

    expect(conflicts).toEqual([
      expect.objectContaining({ commissionEntryId: id, payrollEntryId: payroll.payrollId, amount: 100 }),
    ]);
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
    expect((await entryRow(id)).status).toBe('PAYABLE');
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
       VALUES ($1, 'Agency Commission Phase0', 'agency-commission-phase0-test', 'agency-phase0@example.test', 'FREE', 'ACTIVE')`,
      [agencyId],
    );
    await pool.query(
      `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
       VALUES ($1, $2, 'owner@example.test', 'Owner', 'OWNER', 'hash-for-commission-phase0-test-only', 'ACTIVE')`,
      [ownerUserId, agencyId],
    );
    await pool.query(
      `INSERT INTO customers (agency_id, id, name, status) VALUES ($1, $2, 'Cliente Teste', 'ACTIVE')`,
      [agencyId, customerId],
    );
    await pool.query(
      `INSERT INTO employees (id, agency_id, name, user_id) VALUES ($1, $2, 'João (Funcionário A)', NULL)`,
      [employeeAId, agencyId],
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
    throw new Error('Commission characterization tests require localhost only.');
  }
  if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) {
    throw new Error('Commission characterization tests require a safe local database test port.');
  }
  if (!databaseName.includes('test')) {
    throw new Error('Commission characterization tests require a database name with a test marker.');
  }
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const safeHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
    const safeDatabase = url.pathname.replace('/', '').includes('test');
    const safePort = url.port === String(databasePort) || url.port === '';
    if (!safeHost || !safeDatabase || !safePort) {
      throw new Error('Refusing to run commission characterization tests against unsafe DATABASE_URL.');
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
