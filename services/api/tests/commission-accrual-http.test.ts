/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-explicit-any -- HTTP/SQL fixtures */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildApp } from '../src/app';
import { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../src/auth';
import { createDatabaseRuntime } from '../src/database';
import { startDisposableDb, type DisposableDb } from './helpers/disposable-postgres';

const migrationsDir = resolve(import.meta.dirname, '../../../infrastructure/migrations');
const ALL_MIGRATIONS = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

const agencyA = '10000000-0000-4000-8000-000000000001';
const agencyB = '20000000-0000-4000-8000-000000000001';
const userA = '11000000-0000-4000-8000-000000000001';
const userB = '21000000-0000-4000-8000-000000000001';
const principal = (userId: string, agencyId: string, role: UserRole): AuthenticatedPrincipal => ({ userId, agencyId, role, email: 'u@example.test' });
const principals: Record<string, AuthenticatedPrincipal> = {
  adminA: principal(userA, agencyA, UserRole.ADMIN),
  managerA: principal(userA, agencyA, UserRole.MANAGER),
  agentA: principal(userA, agencyA, UserRole.AGENT),
  adminB: principal(userB, agencyB, UserRole.ADMIN),
};

const LADDER = [
  { fromAmount: 0, toAmount: 50_000, rate: 3 },
  { fromAmount: 50_000, toAmount: 100_000, rate: 4 },
  { fromAmount: 100_000, toAmount: null, rate: 5 },
];

describe('versioned commission rules, attributions and canonical accrual (Onda E1)', () => {
  let db: DisposableDb;
  let admin: Pool;
  let today: string;
  let month: string;
  let nextMonthDay: string;
  let employee: string;
  let employeeB: string;
  let customer: string;
  let categoryAereo: string;
  let categoryTerra: string;

  beforeAll(async () => {
    db = await startDisposableDb(ALL_MIGRATIONS);
    admin = db.adminPool;
    await admin.query(`INSERT INTO agencies (id, name, slug, email, plan, status) VALUES ($1, 'A', 'a-e1', 'a@example.test', 'FREE', 'ACTIVE'), ($2, 'B', 'b-e1', 'b@example.test', 'FREE', 'ACTIVE')`, [agencyA, agencyB]);
    await admin.query(`INSERT INTO users (id, agency_id, email, name, role, password_hash, status) VALUES ($1, $2, 'ua@example.test', 'UA', 'ADMIN', 'x', 'ACTIVE'), ($3, $4, 'ub@example.test', 'UB', 'ADMIN', 'x', 'ACTIVE')`, [userA, agencyA, userB, agencyB]);
    today = (await admin.query(`SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS d`)).rows[0].d;
    month = today.slice(0, 7);
    nextMonthDay = (await admin.query(`SELECT (date_trunc('month', $1::date) + interval '1 month' + interval '14 days')::date::text AS d`, [today])).rows[0].d;
    employee = (await admin.query(`INSERT INTO employees (agency_id, name) VALUES ($1, 'Func A') RETURNING id`, [agencyA])).rows[0].id;
    employeeB = (await admin.query(`INSERT INTO employees (agency_id, name) VALUES ($1, 'Func B') RETURNING id`, [agencyB])).rows[0].id;
    customer = (await admin.query(`INSERT INTO customers (agency_id, name, status) VALUES ($1, 'C', 'ACTIVE') RETURNING id`, [agencyA])).rows[0].id;
    categoryAereo = (await admin.query(`INSERT INTO commission_categories (agency_id, name) VALUES ($1, 'Aéreo') RETURNING id`, [agencyA])).rows[0].id;
    categoryTerra = (await admin.query(`INSERT INTO commission_categories (agency_id, name) VALUES ($1, 'Terrestre') RETURNING id`, [agencyA])).rows[0].id;
  }, 300_000);

  /** Test-only cleanup: versions are immutable, so the guard triggers are lifted just for the reset. */
  async function resetRules() {
    await admin.query('DELETE FROM commission_entries');
    await admin.query('ALTER TABLE employee_commission_rule_versions DISABLE TRIGGER ecrv_immutable');
    await admin.query('ALTER TABLE employee_commission_rule_tiers DISABLE TRIGGER ecrt_immutable');
    await admin.query('DELETE FROM employee_commission_rule_tiers');
    await admin.query('DELETE FROM employee_commission_rule_versions');
    await admin.query('ALTER TABLE employee_commission_rule_versions ENABLE TRIGGER ecrv_immutable');
    await admin.query('ALTER TABLE employee_commission_rule_tiers ENABLE TRIGGER ecrt_immutable');
    await admin.query('DELETE FROM employee_commission_rule_scopes');
    await admin.query('ALTER TABLE commission_financial_profiles DISABLE TRIGGER cfp_immutable');
    await admin.query('DELETE FROM commission_financial_profiles');
    await admin.query('ALTER TABLE commission_financial_profiles ENABLE TRIGGER cfp_immutable');
  }

  beforeEach(async () => {
    await admin.query('DELETE FROM commission_entries');
    await admin.query('DELETE FROM sale_commission_attributions');
    await admin.query(`TRUNCATE TABLE sales CASCADE`);
    await resetRules();
  });

  afterAll(async () => {
    await db?.stop();
  });

  async function call(as: string, method: 'GET' | 'POST', url: string, payload?: unknown) {
    const app = buildApp({
      authProvider: {
        authenticate(request) {
          const key = request.headers['x-test-principal'];
          return Promise.resolve(typeof key === 'string' ? principals[key] ?? null : null);
        },
      },
      validateUserAgencyAccess: (u, a) => Promise.resolve((u === userA && a === agencyA) || (u === userB && a === agencyB)),
      database: createDatabaseRuntime(db.runtimePool),
    });
    try {
      const res = await app.inject({ method, url, headers: { 'x-test-principal': as }, ...(payload !== undefined ? { payload: payload as object } : {}) });
      return { status: res.statusCode, body: res.json() as Record<string, any> };
    } finally {
      await app.close();
    }
  }

  const progressive = (extra: object = {}) => ({ effectiveFrom: today, mode: 'PERCENTAGE', calculationMetric: 'GROSS', progressive: true, tiers: LADDER, ...extra });

  async function makeSale(total: number, opts: { status?: string; saleDate?: string } = {}): Promise<string> {
    return (await admin.query(
      `INSERT INTO sales (agency_id, customer_id, user_id, amount, total, status, sale_date) VALUES ($1, $2, $3, $4, $4, $5::"SaleStatus", COALESCE($6::date, CURRENT_DATE)) RETURNING id`,
      [agencyA, customer, userA, total, opts.status ?? 'CONFIRMED', opts.saleDate ?? null],
    )).rows[0].id as string;
  }
  const attribute = (saleId: string, extra: object = {}) =>
    call('managerA', 'POST', `/sales/${saleId}/commission-attributions`, { employeeId: employee, recognitionDate: today, ...extra });
  const generate = (saleId: string) => call('managerA', 'POST', `/sales/${saleId}/commission-entries/versioned`, { employeeId: employee });
  const entry = async (saleId: string) => (await admin.query('SELECT amount::float AS amount, accumulated_before::float AS acc, status, rule_version_id FROM commission_entries WHERE sale_id = $1', [saleId])).rows[0];

  describe('rule scopes and versions', () => {
    it('only ADMIN writes rules; MANAGER reads; AGENT is refused; other agency sees nothing', async () => {
      expect((await call('managerA', 'POST', '/commission-rule-scopes', { version: progressive() })).status).toBe(403);
      expect((await call('agentA', 'GET', '/commission-rule-scopes')).status).toBe(403);
      const created = await call('adminA', 'POST', '/commission-rule-scopes', { employeeId: employee, version: progressive() });
      expect(created.status).toBe(201);
      expect((await call('managerA', 'GET', '/commission-rule-scopes')).body.scopes).toHaveLength(1);
      expect((await call('adminB', 'GET', '/commission-rule-scopes')).body.scopes).toEqual([]);
      expect((await call('adminB', 'POST', '/commission-rule-scopes', { employeeId: employee, version: progressive() })).status).toBe(404);
    });

    it('two revisions on the same day both survive; the higher version_number is in force; projection reports the superseded one', async () => {
      const scope = (await call('adminA', 'POST', '/commission-rule-scopes', { employeeId: employee, version: { effectiveFrom: today, mode: 'PERCENTAGE', value: 3 } })).body.scopeId as string;
      expect((await call('adminA', 'POST', `/commission-rule-scopes/${scope}/versions`, { effectiveFrom: today, mode: 'PERCENTAGE', value: 5, reason: 'ajuste' })).status).toBe(201);
      const view = (await call('managerA', 'GET', '/commission-rule-scopes')).body.scopes[0].versions as Array<any>;
      expect(view.map((v) => [v.versionNumber, v.isEffective])).toEqual([[1, false], [2, true]]);
      expect(view[0].supersededByVersionId).toBe(view[1].id);
      expect(view[0].effectiveUntil).toBeNull();
      const sale = await makeSale(1000);
      await attribute(sale);
      expect((await generate(sale)).body.amount).toBe(50);
    });

    it('rejects a retroactive revision, a malformed ladder, tiers on a non-progressive version and mass-assigned fields', async () => {
      expect((await call('adminA', 'POST', '/commission-rule-scopes', { employeeId: employee, version: { effectiveFrom: '2020-01-01', mode: 'PERCENTAGE', value: 3 } })).status).toBe(400);
      expect((await call('adminA', 'POST', '/commission-rule-scopes', { employeeId: employee, version: progressive({ tiers: [LADDER[0], { fromAmount: 60_000, toAmount: null, rate: 4 }] }) })).status).toBe(400);
      expect((await call('adminA', 'POST', '/commission-rule-scopes', { employeeId: employee, version: { effectiveFrom: today, mode: 'PERCENTAGE', value: 3, tiers: LADDER } })).status).toBe(400);
      expect((await call('adminA', 'POST', '/commission-rule-scopes', { employeeId: employee, agencyId: agencyB, version: progressive() })).status).toBe(400);
      expect((await admin.query('SELECT count(*)::int AS n FROM employee_commission_rule_scopes')).rows[0].n).toBe(0);
    });

    it('a second ACTIVE scope for the same employee/category is a 409', async () => {
      await call('adminA', 'POST', '/commission-rule-scopes', { employeeId: employee, categoryId: categoryAereo, version: progressive() });
      expect((await call('adminA', 'POST', '/commission-rule-scopes', { employeeId: employee, categoryId: categoryAereo, version: progressive() })).status).toBe(409);
    });

    it('hierarchy: employee+category beats employee beats agency default', async () => {
      await call('adminA', 'POST', '/commission-rule-scopes', { version: { effectiveFrom: today, mode: 'PERCENTAGE', value: 1 } });
      await call('adminA', 'POST', '/commission-rule-scopes', { employeeId: employee, version: { effectiveFrom: today, mode: 'PERCENTAGE', value: 2 } });
      await call('adminA', 'POST', '/commission-rule-scopes', { employeeId: employee, categoryId: categoryAereo, version: { effectiveFrom: today, mode: 'PERCENTAGE', value: 3 } });
      const aereo = await makeSale(1000);
      const terra = await makeSale(1000);
      await attribute(aereo, { categoryId: categoryAereo });
      await attribute(terra, { categoryId: categoryTerra });
      expect((await generate(aereo)).body.amount).toBe(30);
      expect((await generate(terra)).body.amount).toBe(20);
    });
  });

  describe('canonical accrual (never sums commission_entries)', () => {
    beforeEach(async () => {
      await call('adminA', 'POST', '/commission-rule-scopes', { employeeId: employee, version: progressive() });
    });

    it('ACC-01/03: B generated first still sees only earlier attributions; A generated later has accumulated 0; the 750,00 oracle', async () => {
      const a = await makeSale(45_000);
      const b = await makeSale(20_000);
      await attribute(a); // no entry for A yet
      await attribute(b);
      expect((await generate(b)).body.amount).toBe(750); // 45.000 accumulated: 5.000@3% + 15.000@4%
      expect((await entry(b)).acc).toBe(45_000);
      expect((await generate(a)).body.amount).toBe(1_350); // from 0: 45.000@3%
      expect((await entry(a)).acc).toBe(0);
    });

    it('the 2.900,00 oracle: accumulated 45.000 + base 70.000 crosses two tiers', async () => {
      const a = await makeSale(45_000);
      const b = await makeSale(70_000);
      await attribute(a);
      await attribute(b);
      expect((await generate(b)).body.amount).toBe(2_900);
    });

    it('META_E_LIBERACAO adds prior sales only in proportion to real receipts in the receipt month', async () => {
      await admin.query(`INSERT INTO commission_financial_profiles (agency_id,effect,effective_from,created_by)
        VALUES ($1,'META_E_LIBERACAO',$2::date,$3)`, [agencyA,today,userA]);
      const earlier=await makeSale(1000);
      const current=await makeSale(1000);
      await attribute(earlier);
      await attribute(current);
      const receivable=await admin.query<{id:string}>(`INSERT INTO receivables (agency_id,sale_id,customer_id,description,amount,due_at)
        SELECT agency_id,id,customer_id,'Partial receipt',total,now() FROM sales WHERE id=$1 RETURNING id`,[earlier]);
      const payment=await admin.query<{id:string}>(`INSERT INTO payments (agency_id,direction,amount,occurred_at,method,created_by)
        VALUES ($1,'IN',300,now(),'PIX',$2) RETURNING id`,[agencyA,userA]);
      await admin.query('INSERT INTO payment_allocations (agency_id,payment_id,receivable_id,amount) VALUES ($1,$2,$3,300)',
        [agencyA,payment.rows[0]!.id,receivable.rows[0]!.id]);
      expect((await generate(current)).body.amount).toBe(30);
      expect((await entry(current)).acc).toBe(300);
    });

    it('ACC-02: one attribution per sale and employee (a second is a 409), so a sale counts once', async () => {
      const a = await makeSale(10_000);
      expect((await attribute(a)).status).toBe(201);
      expect((await attribute(a)).status).toBe(409);
    });

    it('ACC-05: a category rule only accumulates attributions of that category', async () => {
      await resetRules();
      await call('adminA', 'POST', '/commission-rule-scopes', { employeeId: employee, categoryId: categoryAereo, version: progressive() });
      const terra = await makeSale(40_000);
      const aereo = await makeSale(20_000);
      await attribute(terra, { categoryId: categoryTerra });
      await attribute(aereo, { categoryId: categoryAereo });
      expect((await generate(aereo)).body.amount).toBe(600); // the 40.000 of the other category is ignored: 20.000@3%
      expect((await entry(aereo)).acc).toBe(0);
    });

    it('ACC-06: a new month starts from zero', async () => {
      const a = await makeSale(45_000);
      const b = await makeSale(10_000);
      await attribute(a);
      await attribute(b, { recognitionDate: nextMonthDay });
      expect((await generate(b)).body.amount).toBe(300);
      expect((await entry(b)).acc).toBe(0);
      expect(month.length).toBe(7);
    });

    it('ACC-07: cancelling an attribution removes it from future accumulations; earlier entries are untouched', async () => {
      const a = await makeSale(45_000);
      const b = await makeSale(20_000);
      const c = await makeSale(10_000);
      const attA = (await attribute(a)).body.id as string;
      await attribute(b);
      await attribute(c);
      await generate(b);
      expect((await call('managerA', 'POST', `/commission-attributions/${attA}/cancel`)).status).toBe(200);
      expect((await entry(b)).amount).toBe(750);
      expect((await generate(c)).body.amount).toBe(300); // only B (20.000) accumulates: 10.000@3%
    });

    it('ACC-08: concurrent generations for the same employee/month serialize and get distinct, coherent accumulations', async () => {
      const sales = await Promise.all([makeSale(10_000), makeSale(10_000), makeSale(10_000), makeSale(10_000)]);
      for (const s of sales) expect((await attribute(s)).status).toBe(201);
      const results = await Promise.all(sales.map((s) => generate(s)));
      expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
      const accs = (await admin.query('SELECT accumulated_before::float AS acc FROM commission_entries ORDER BY accumulated_before')).rows.map((r) => r.acc);
      expect(accs).toEqual([0, 10_000, 20_000, 30_000]);
    });

    it('ACC-09: a MARGIN rule refuses an attribution without margin and writes nothing', async () => {
      await resetRules();
      await call('adminA', 'POST', '/commission-rule-scopes', { employeeId: employee, version: progressive({ calculationMetric: 'MARGIN' }) });
      const a = await makeSale(10_000);
      await attribute(a);
      await admin.query('UPDATE sale_commission_attributions SET margin_amount = NULL');
      expect((await generate(a)).status).toBe(400);
      expect((await admin.query('SELECT count(*)::int AS n FROM commission_entries')).rows[0].n).toBe(0);
    });

    it('ACC-10: legacy entries without attribution never feed the accumulation', async () => {
      const legacy = await makeSale(90_000);
      await admin.query(`INSERT INTO commission_entries (agency_id, employee_id, sale_id, calculation_base, amount, status, rule_version_id) SELECT $1, $2, $3, 90000, 1, 'PENDING', id FROM employee_commission_rule_versions LIMIT 1`, [agencyA, employee, legacy]);
      const a = await makeSale(10_000);
      await attribute(a);
      expect((await generate(a)).body.amount).toBe(300);
    });

    it('generation requires a confirmed/paid sale and an attribution; PENDING sales are refused', async () => {
      const pending = await makeSale(10_000, { status: 'PENDING' });
      await attribute(pending);
      expect((await generate(pending)).status).toBe(409);
      const none = await makeSale(10_000);
      expect((await generate(none)).status).toBe(404);
    });

    it('a sale without any rule in force yields a PENDING_RULE entry with amount 0 (never a silent zero)', async () => {
      await resetRules();
      const a = await makeSale(10_000);
      await attribute(a);
      const res = await generate(a);
      expect(res.body).toMatchObject({ status: 'PENDING_RULE', amount: 0 });
      const again = await generate(a); // without a rule the pending entry is returned, never duplicated
      expect(again.body).toMatchObject({ status: 'PENDING_RULE', entryId: res.body.entryId });
      expect((await admin.query('SELECT count(*)::int AS n FROM commission_entries WHERE sale_id = $1', [a])).rows[0].n).toBe(1);
    });

    it('a PENDING_RULE entry is resolved in place when a rule appears (same entry, amount computed, then 409 on a repeat)', async () => {
      await resetRules();
      const a = await makeSale(10_000);
      await attribute(a);
      const pending = await generate(a);
      expect(pending.body.status).toBe('PENDING_RULE');
      expect((await call('adminA', 'POST', '/commission-rule-scopes', { employeeId: employee, version: { effectiveFrom: today, mode: 'PERCENTAGE', value: 3 } })).status).toBe(201);
      const resolved = await generate(a);
      expect(resolved.status).toBe(201);
      expect(resolved.body).toMatchObject({ status: 'PENDING', amount: 300, entryId: pending.body.entryId });
      expect(await entry(a)).toMatchObject({ amount: 300, status: 'PENDING' });
      expect((await admin.query('SELECT count(*)::int AS n FROM commission_entries WHERE sale_id = $1', [a])).rows[0].n).toBe(1);
      expect((await generate(a)).status).toBe(409);
    });

    it('tenant isolation: another agency cannot attribute or generate', async () => {
      const a = await makeSale(10_000);
      expect((await call('adminB', 'POST', `/sales/${a}/commission-attributions`, { employeeId: employeeB })).status).toBe(404);
      expect((await call('adminB', 'POST', `/sales/${a}/commission-entries/versioned`, { employeeId: employeeB })).status).toBe(404);
    });
  });
});
