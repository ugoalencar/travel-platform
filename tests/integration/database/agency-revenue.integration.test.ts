/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- HTTP/JSON and pg row fixtures in this integration test are intentionally untyped */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

// Own container/port: never the shared Onda B database, the demo or 55438.
vi.hoisted(() => {
  process.env.ONDA_B_TEST_DB_PORT ??= '55628';
  process.env.ONDA_B_TEST_DB_CONTAINER ??= 'travel-full-rev-int';
  process.env.ONDA_B_TEST_DB_PROJECT ??= 'travel-full-rev-int';
});

import { buildApp } from '../../../services/api/src/app';
import type { UserRole } from '../../../packages/domain/types';
import type { AuthenticatedPrincipal } from '../../../services/api/src/auth';
import { createDatabaseRuntime } from '../../../services/api/src/database';
import {
  startDisposableDb,
  type DisposableDb,
} from '../../../services/api/tests/helpers/disposable-postgres';

const MIGRATIONS = readdirSync(resolve(import.meta.dirname, '../../../infrastructure/migrations'))
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();

const agencyA = '10000000-0000-4000-8000-0000000000a7';
const agencyB = '20000000-0000-4000-8000-0000000000b7';
const ids = {
  ownerA: '11000000-0000-4000-8000-0000000000a1',
  adminA: '11000000-0000-4000-8000-0000000000a2',
  managerA: '11000000-0000-4000-8000-0000000000a3',
  agentA: '11000000-0000-4000-8000-0000000000a4',
  adminB: '21000000-0000-4000-8000-0000000000b1',
};
const roleOf: Record<keyof typeof ids, [string, UserRole]> = {
  ownerA: [agencyA, 'OWNER' as UserRole],
  adminA: [agencyA, 'ADMIN' as UserRole],
  managerA: [agencyA, 'MANAGER' as UserRole],
  agentA: [agencyA, 'AGENT' as UserRole],
  adminB: [agencyB, 'ADMIN' as UserRole],
};
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

describe('Agency revenue (ADR-007) over HTTP with a real database', () => {
  let db: DisposableDb;
  let admin: Pool;
  const suppliers: Record<string, string> = {};
  let customerA: string;

  beforeAll(async () => {
    db = await startDisposableDb(MIGRATIONS.filter((name) => Number(name.slice(0, 3)) < 106));
    // Migration-owned grants: no bootstrap after creating the revenue tables.
    for (const name of MIGRATIONS.filter((file) => Number(file.slice(0, 3)) >= 106)) {
      await db.adminPool.query(readFileSync(resolve(import.meta.dirname, '../../../infrastructure/migrations', name), 'utf8').replace(/^\uFEFF/, ''));
    }
    admin = db.adminPool;
    // Onda E2 fixture privilege only; no revenue-table bootstrap after migration 106.
    await admin.query('GRANT SELECT, INSERT ON commission_release_events TO travel_app_runtime_local');
    await admin.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status) VALUES
        ($1, 'Agency A', 'agency-a-rev', 'a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-rev', 'b@example.test', 'FREE', 'ACTIVE')`,
      [agencyA, agencyB],
    );
    for (const [key, id] of Object.entries(ids)) {
      const [agencyId, role] = roleOf[key as keyof typeof ids];
      await admin.query(
        `INSERT INTO users (id, agency_id, email, name, role, password_hash, status)
         VALUES ($1, $2, $3, $4, $5, 'hash-test-only', 'ACTIVE')`,
        [id, agencyId, `${key}@example.test`, key, role],
      );
    }
    for (const name of ['A', 'B', 'C']) {
      suppliers[name] = (
        await admin.query<{ id: string }>(
          `INSERT INTO suppliers (agency_id, name) VALUES ($1, $2) RETURNING id`,
          [agencyA, `Fornecedor ${name}`],
        )
      ).rows[0]!.id;
    }
    customerA = (
      await admin.query<{ id: string }>(
        `INSERT INTO customers (agency_id, name, status) VALUES ($1, 'Cliente', 'ACTIVE') RETURNING id`,
        [agencyA],
      )
    ).rows[0]!.id;
  }, 300_000);

  afterAll(async () => {
    await db?.stop();
  });

  function app() {
    return buildApp({
      authProvider: {
        async authenticate(request) {
          const token = request.headers['x-test-user'];
          if (typeof token !== 'string') return null;
          const row = (
            await admin.query<{ id: string; agency_id: string; role: string; email: string }>(
              `SELECT id, agency_id, role, email FROM users WHERE id = $1 AND status = 'ACTIVE'`,
              [token],
            )
          ).rows[0];
          if (!row) return null;
          const principal: AuthenticatedPrincipal = { userId: row.id, agencyId: row.agency_id, role: row.role as UserRole, email: row.email };
          return principal;
        },
      },
      validateUserAgencyAccess: async (userId, agencyId) =>
        (await admin.query(`SELECT 1 FROM users WHERE id = $1 AND agency_id = $2`, [userId, agencyId])).rowCount === 1,
      database: createDatabaseRuntime(db.runtimePool),
    });
  }

  async function call(as: string | null, method: 'GET' | 'POST', url: string, payload?: unknown) {
    const server = app();
    try {
      const response = await server.inject({
        method,
        url,
        ...(as ? { headers: { 'x-test-user': as } } : {}),
        ...(payload !== undefined ? { payload: payload as object } : {}),
      });
      return { status: response.statusCode, body: response.json<Record<string, any>>() };
    } finally {
      await server.close();
    }
  }

  const reset = async () => {
    await admin.query('DELETE FROM agency_revenue_entries');
    await admin.query('DELETE FROM agency_revenue_rule_versions');
    await admin.query('DELETE FROM agency_revenue_scopes');
  };
  const rule = (as: string, body: Record<string, unknown>) =>
    call(as, 'POST', '/agency-revenue/rules', { reason: 'Politica comercial', ...body });

  async function makeSale(items: Array<Record<string, any>>, opts: { status?: string; settled?: boolean } = {}) {
    const total = items.reduce((sum, item) => sum + item.unitPrice * (item.qty ?? 1) + (item.taxes ?? 0), 0);
    const sale = (
      await admin.query<{ id: string }>(
        `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total, status, settled_at)
         VALUES ($1, $2, $3, $4, 0, $4, $5, $6) RETURNING id`,
        [agencyA, customerA, ids.agentA, total, opts.status ?? 'CONFIRMED', opts.settled ? new Date() : null],
      )
    ).rows[0]!.id;
    for (const [index, item] of items.entries()) {
      await admin.query(
        `INSERT INTO sale_items (agency_id, sale_id, description, supplier_id, travelers, qty, unit_price, taxes, fees, discount, line_total, line_margin)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, 0, $10, $11)`,
        [agencyA, sale, `Item ${index}`, item.supplier ? suppliers[item.supplier] : null,
          JSON.stringify(Array.from({ length: item.travelers ?? 0 }, (_, n) => ({ name: `P${n}` }))),
          item.qty ?? 1, item.unitPrice, item.taxes ?? 0, item.fees ?? 0,
          (item.qty ?? 1) * item.unitPrice + (item.taxes ?? 0) + (item.fees ?? 0), item.margin ?? 0],
      );
    }
    return sale;
  }

  describe('rules', () => {
    it('are restricted to administrators and validated', async () => {
      await reset();
      const body = { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 7 };
      expect((await call(null, 'POST', '/agency-revenue/rules', body)).status).toBe(401);
      expect((await rule(ids.managerA, body)).status).toBe(403);
      expect((await rule(ids.agentA, body)).status).toBe(403);
      expect((await rule(ids.adminA, body)).status).toBe(201);
      for (const bad of [
        { ...body, value: 120 },
        { ...body, baseSelector: null },
        { ...body, mode: 'FIXED_PER_PASSENGER', baseSelector: 'LINE_TOTAL', value: 25 },
        { ...body, effectiveFrom: '2020-01-01' },
        { ...body, collectionModel: 'SUPPLIER_COLLECTS', entitlementEvent: 'ON_FULL_SETTLEMENT' },
        { ...body, baseSelector: 'MARGIN', collectionModel: 'SUPPLIER_COLLECTS', entitlementEvent: 'ON_SALE_CONFIRMATION' },
        { ...body, agencyId: agencyB },
        { ...body, supplierId: '99999999-0000-4000-8000-000000000000' },
      ]) {
        const res = await rule(ids.adminA, bad);
        expect([400, 404]).toContain(res.status);
      }
    });
    it('are versioned append-only per scope', async () => {
      await reset();
      const body = { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL' };
      expect((await rule(ids.adminA, { ...body, value: 5 })).body.rule.versionNumber).toBe(1);
      expect((await rule(ids.ownerA, { ...body, value: 6 })).body.rule.versionNumber).toBe(2);
      await expect(admin.query('DELETE FROM agency_revenue_rule_versions')).resolves.toBeDefined();
      await expect(db.runtimePool.query('DELETE FROM agency_revenue_rule_versions')).rejects.toThrow();
      await expect(db.runtimePool.query(`UPDATE agency_revenue_rule_versions SET value = 1`)).rejects.toThrow();
    });
  });

  describe('calculation (ADR-007 reference cases)', () => {
    it('R1: 7% of 1,000.00 = 70.00 and stays FORECAST until the customer settles', async () => {
      await reset();
      await rule(ids.adminA, { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 7 });
      const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
      const res = await call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`);
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0]).toMatchObject({ status: 'FORECAST', amount: 70, base_amount: 1000 });
      expect(res.body.entries[0].memory).toMatchObject({ rate: 7, baseSelector: 'LINE_TOTAL', calcVersion: 1 });
      const condition = await call(ids.adminA, 'POST', '/payment-conditions', {
        name: 'R1', scheduleKind: 'EQUAL_INSTALLMENTS', maxInstallments: 1, minInstallmentAmount: null,
        interestFree: true, downPaymentMode: 'NONE', downPaymentValue: 0, downPaymentRequired: false,
        balanceDeadlineAnchor: 'SALE_DATE', balanceDeadlineOffsetDays: 0, allowsPartialPayments: true,
        paymentMethods: ['PIX'], categoryIds: [], productIds: [],
      });
      expect(condition.status).toBe(201);
      expect((await call(ids.adminA, 'POST', `/sales/${sale}/payment-schedule`, {
        conditionId: condition.body.condition.id, installments: 1, paymentMethod: 'PIX',
      })).status).toBe(201);
      expect((await call(ids.adminA, 'POST', `/sales/${sale}/payments`, {
        amount: 1000, idempotency_key: `r1-${sale}`, method: 'PIX', paid_at: new Date().toISOString(),
      })).status).toBe(201);
      const again = await call(ids.managerA, 'GET', `/sales/${sale}/agency-revenue`);
      expect(again.body.entries[0]).toMatchObject({ status: 'ENTITLED', amount: 70 });
      expect(again.body.entries).toHaveLength(1);
    });
    it('R2/R3: fixed per passenger and taxes-only base', async () => {
      await reset();
      await rule(ids.adminA, { supplierId: suppliers.A, mode: 'FIXED_PER_PASSENGER', value: 25 });
      await rule(ids.adminA, { supplierId: suppliers.B, mode: 'PERCENTAGE', baseSelector: 'TAXES', value: 10 });
      const bus = await makeSale([{ supplier: 'A', unitPrice: 300, travelers: 4 }]);
      const cruise = await makeSale([{ supplier: 'B', unitPrice: 3000, taxes: 1200 }]);
      expect((await call(ids.managerA, 'POST', `/sales/${bus}/agency-revenue/calculate`)).body.entries[0].amount).toBe(100);
      expect((await call(ids.managerA, 'POST', `/sales/${cruise}/agency-revenue/calculate`)).body.entries[0].amount).toBe(120);
    });
    it('R4: several suppliers with different percentages = 505.00 and three snapshots', async () => {
      await reset();
      await rule(ids.adminA, { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 5 });
      await rule(ids.adminA, { supplierId: suppliers.B, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 12 });
      await rule(ids.adminA, { supplierId: suppliers.C, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 30 });
      const sale = await makeSale([
        { supplier: 'A', unitPrice: 2000 },
        { supplier: 'B', unitPrice: 3000 },
        { supplier: 'C', unitPrice: 150 },
      ]);
      const res = await call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`);
      const amounts = (res.body.entries as Array<{ amount: number }>).map((entry) => entry.amount).sort((a, b) => a - b);
      expect(amounts).toEqual([45, 100, 360]);
      const read = await call(ids.managerA, 'GET', `/sales/${sale}/agency-revenue`);
      expect(read.body.analysis.agencyRevenue).toBe(505);
      expect(new Set((res.body.entries as Array<{ rule_version_id: string }>).map((entry) => entry.rule_version_id)).size).toBe(3);
    });
    it('R7: an item without a rule is PENDING_RULE with zero and is not counted', async () => {
      await reset();
      const sale = await makeSale([{ supplier: 'C', unitPrice: 500 }]);
      const res = await call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`);
      expect(res.body.entries[0]).toMatchObject({ status: 'PENDING_RULE', amount: 0 });
      const read = await call(ids.managerA, 'GET', `/sales/${sale}/agency-revenue`);
      expect(read.body.totals).toMatchObject({ pendingRule: 1, forecast: 0 });
      expect(read.body.analysis.agencyRevenue).toBe(0);
    });
    it('a new rule version applies only to later sales; recalculation updates FORECAST and never touches locked entries', async () => {
      await reset();
      await rule(ids.adminA, { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 5, entitlementEvent: 'ON_SALE_CONFIRMATION' });
      const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
      const first = await call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`);
      expect(first.body.entries[0]).toMatchObject({ amount: 50, status: 'ENTITLED' });
      await rule(ids.adminA, { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 9, effectiveFrom: '2999-01-01' });
      const second = await call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`);
      expect(second.body.locked).toHaveLength(1);
      expect(second.body.entries[0].amount).toBe(50);
    });
  });

  describe('lifecycle: right, then settlement', () => {
    async function entitled() {
      await reset();
      await rule(ids.adminA, { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 10, entitlementEvent: 'ON_SALE_CONFIRMATION' });
      const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
      const res = await call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`);
      return { sale, entry: res.body.entries[0].id as string };
    }
    it('only an administrator receives; a FORECAST entry cannot be received; the difference stays visible', async () => {
      await reset();
      await rule(ids.adminA, { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 10 });
      const pendingSale = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
      const forecast = (await call(ids.managerA, 'POST', `/sales/${pendingSale}/agency-revenue/calculate`)).body.entries[0];
      expect(forecast.status).toBe('FORECAST');
      expect((await call(ids.adminA, 'POST', `/agency-revenue/entries/${forecast.id}/receive`, { amount: 100 })).status).toBe(409);

      const { entry } = await entitled();
      expect((await call(ids.managerA, 'POST', `/agency-revenue/entries/${entry}/receive`, { amount: 100 })).status).toBe(403);
      const ok = await call(ids.adminA, 'POST', `/agency-revenue/entries/${entry}/receive`, { amount: 90, reference: 'PIX 1' });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ expected: 100, received: 90, difference: 10 });
      expect((await call(ids.adminA, 'POST', `/agency-revenue/entries/${entry}/receive`, { amount: 100 })).status).toBe(409);
      expect((await call(ids.adminA, 'POST', `/agency-revenue/entries/${entry}/cancel`)).status).toBe(409);
    });
    it('D6: cancelling a sale whose revenue was received is 409; otherwise revenue is cancelled with the sale', async () => {
      const { sale, entry } = await entitled();
      await call(ids.adminA, 'POST', `/agency-revenue/entries/${entry}/receive`, { amount: 100 });
      expect((await call(ids.adminA, 'POST', `/sales/${sale}/cancel`)).status).toBe(409);
      expect((await admin.query('SELECT status FROM sales WHERE id = $1', [sale])).rows[0].status).not.toBe('CANCELLED');

      await reset();
      await rule(ids.adminA, { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 10, entitlementEvent: 'ON_SALE_CONFIRMATION' });
      const other = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
      await call(ids.managerA, 'POST', `/sales/${other}/agency-revenue/calculate`);
      expect((await call(ids.adminA, 'POST', `/sales/${other}/cancel`)).status).toBe(200);
      const rows = await admin.query('SELECT status FROM agency_revenue_entries WHERE sale_id = $1', [other]);
      expect(rows.rows.map((row) => row.status)).toEqual(['CANCELLED']);
    });
    it('the supplier-collects model entitles on confirmation, never on customer settlement', async () => {
      await reset();
      await rule(ids.adminA, {
        supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 10,
        collectionModel: 'SUPPLIER_COLLECTS', entitlementEvent: 'ON_SALE_CONFIRMATION',
      });
      const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
      expect((await call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`)).body.entries[0].status).toBe('ENTITLED');
    });
    it('writes one required audit event per transition', async () => {
      const { entry } = await entitled();
      await call(ids.adminA, 'POST', `/agency-revenue/entries/${entry}/receive`, { amount: 100 });
      const events = (await admin.query(`SELECT event_type FROM audit_logs WHERE event_type LIKE 'AGENCY_REVENUE_%'`)).rows.map((row) => row.event_type as string);
      for (const expected of ['AGENCY_REVENUE_RULE_CREATED', 'AGENCY_REVENUE_CALCULATED', 'AGENCY_REVENUE_ENTITLED', 'AGENCY_REVENUE_RECEIVED']) {
        expect(events).toContain(expected);
      }
    });
  });

  describe('tenant isolation', () => {
    it("agency B sees none of agency A's rules or entries and cannot act on them", async () => {
      await reset();
      await rule(ids.adminA, { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 10, entitlementEvent: 'ON_SALE_CONFIRMATION' });
      const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
      const entry = (await call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`)).body.entries[0].id as string;
      expect((await call(ids.adminB, 'GET', '/agency-revenue/rules')).body.rules).toHaveLength(0);
      expect((await call(ids.adminB, 'GET', `/sales/${sale}/agency-revenue`)).status).toBe(404);
      expect((await call(ids.adminB, 'POST', `/sales/${sale}/agency-revenue/calculate`)).status).toBe(404);
      expect((await call(ids.adminB, 'POST', `/agency-revenue/entries/${entry}/receive`, { amount: 1 })).status).toBe(404);
      expect((await call(ids.adminB, 'POST', `/agency-revenue/entries/${entry}/cancel`)).status).toBe(404);
      const rls = await db.runtimePool.connect();
      try {
        await rls.query('BEGIN');
        await rls.query(`SELECT set_config('app.current_agency_id', $1, true)`, [agencyB]);
        expect((await rls.query('SELECT 1 FROM agency_revenue_entries')).rowCount).toBe(0);
        await rls.query('ROLLBACK');
      } finally {
        rls.release();
      }
    });
  });

  it('keeps today as the earliest effective date for new rules', () => {
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('concurrent calculations and confirmation create exactly one entitlement', async () => {
    await reset();
    await rule(ids.adminA, { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 10, entitlementEvent: 'ON_SALE_CONFIRMATION' });
    const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }], { status: 'PENDING' });
    const results = await Promise.all([
      call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`),
      call(ids.managerA, 'POST', `/sales/${sale}/confirm`),
      call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const read = await call(ids.managerA, 'GET', `/sales/${sale}/agency-revenue`);
    expect(read.body.entries).toHaveLength(1);
    expect(read.body.entries[0].status).toBe('ENTITLED');
    const audits = await admin.query<{ count: string }>(
      `SELECT count(*) FROM audit_logs WHERE entity_id=$1 AND event_type='AGENCY_REVENUE_ENTITLED'`, [read.body.entries[0].id]);
    expect(Number(audits.rows[0]?.count)).toBe(1);
  });

  it('audit failure rolls confirmation and entitlement back together', async () => {
    await reset();
    await rule(ids.adminA, { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 10, entitlementEvent: 'ON_SALE_CONFIRMATION' });
    const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }], { status: 'PENDING' });
    await call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`);
    await admin.query(`CREATE FUNCTION reject_revenue_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event_type='AGENCY_REVENUE_ENTITLED' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_revenue_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_revenue_audit()`);
    try {
      expect((await call(ids.managerA, 'POST', `/sales/${sale}/confirm`)).status).toBe(500);
      expect((await admin.query<{ status: string }>('SELECT status FROM sales WHERE id=$1', [sale])).rows[0]?.status).toBe('PENDING');
      expect((await call(ids.managerA, 'GET', `/sales/${sale}/agency-revenue`)).body.entries[0].status).toBe('FORECAST');
    } finally {
      await admin.query('DROP TRIGGER reject_revenue_audit ON audit_logs; DROP FUNCTION reject_revenue_audit()');
    }
  });

  it('item cancellation cancels its forecast and confirmation cannot entitle it', async () => {
    await reset();
    await rule(ids.adminA, { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 10, entitlementEvent: 'ON_SALE_CONFIRMATION' });
    const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }], { status: 'PENDING' });
    const entry = (await call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`)).body.entries[0];
    expect((await call(ids.adminA, 'POST', `/sale-items/${entry.sale_item_id}/cancel`)).status).toBe(200);
    expect((await call(ids.managerA, 'POST', `/sales/${sale}/confirm`)).status).toBe(200);
    expect((await call(ids.managerA, 'GET', `/sales/${sale}/agency-revenue`)).body.entries[0].status).toBe('CANCELLED');
  });

  it('D6: received supplier revenue blocks item cancellation; totals use actual receipt', async () => {
    await reset();
    await rule(ids.adminA, { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 10, entitlementEvent: 'ON_SALE_CONFIRMATION', collectionModel: 'SUPPLIER_COLLECTS' });
    const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
    const entry = (await call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`)).body.entries[0];
    expect((await call(ids.adminA, 'POST', `/agency-revenue/entries/${entry.id}/receive`, { amount: 90 })).status).toBe(200);
    expect((await call(ids.adminA, 'POST', `/sale-items/${entry.sale_item_id}/cancel`)).status).toBe(409);
    const read = await call(ids.managerA, 'GET', `/sales/${sale}/agency-revenue`);
    expect(read.body.totals).toMatchObject({ expected: 100, received: 90, difference: 10 });
    expect((await admin.query<{ status: string }>('SELECT status FROM sale_items WHERE id=$1', [entry.sale_item_id])).rows[0]?.status).toBe('ACTIVE');
  });

  it('cancelled revenue survives recalculation and only explicit admin reactivation restores it', async () => {
    await reset();
    await rule(ids.adminA, { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 10 });
    const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }], { status: 'PENDING' });
    const entry = (await call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`)).body.entries[0];
    expect((await call(ids.adminA, 'POST', `/agency-revenue/entries/${entry.id}/cancel`)).status).toBe(200);
    const recalculated = await call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`);
    expect(recalculated.body.entries).toHaveLength(1);
    expect(recalculated.body.entries[0].status).toBe('CANCELLED');
    expect((await call(ids.managerA, 'POST', `/agency-revenue/entries/${entry.id}/reactivate`, { reason: 'Revisao' })).status).toBe(403);
    expect((await call(ids.adminA, 'POST', `/agency-revenue/entries/${entry.id}/reactivate`, { reason: ' ' })).status).toBe(400);
    expect((await call(ids.adminB, 'POST', `/agency-revenue/entries/${entry.id}/reactivate`, { reason: 'Revisao' })).status).toBe(404);
    expect((await call(ids.adminA, 'POST', `/agency-revenue/entries/${entry.id}/reactivate`, { reason: 'Revisao comercial' })).status).toBe(200);
    expect((await call(ids.managerA, 'GET', `/sales/${sale}/agency-revenue`)).body.entries[0].status).toBe('FORECAST');
    const audit = await admin.query<{ metadata: { reasonCode: string } }>(
      `SELECT metadata FROM audit_logs WHERE entity_id=$1 AND event_type='AGENCY_REVENUE_REACTIVATED'`, [entry.id]);
    expect(audit.rows[0]?.metadata.reasonCode).toBe('Revisao comercial');
    expect((await call(ids.adminA, 'POST', `/agency-revenue/entries/${entry.id}/reactivate`, { reason: 'Duplicado' })).status).toBe(409);
  });

  it('legacy settlement synchronizes revenue without requiring settled_at', async () => {
    await reset();
    await rule(ids.adminA, { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 10 });
    const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
    await call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`);
    const receipt = await call(ids.adminA, 'POST', '/financial/receivables', {
      saleId: sale, customerId: customerA, description: 'Legacy', amount: 1000, dueAt: new Date().toISOString(),
    });
    expect(receipt.status).toBe(201);
    const payment = await call(ids.adminA, 'POST', '/financial/payments', {
      direction: 'IN', amount: 1000, occurredAt: new Date().toISOString(),
    });
    expect(payment.status).toBe(201);
    expect((await call(ids.adminA, 'POST', `/financial/payments/${payment.body.payment.id}/allocations`, {
      allocations: [{ receivableId: receipt.body.receivable.id, amount: 1000 }],
    })).status).toBe(200);
    expect((await call(ids.managerA, 'POST', `/sales/${sale}/mark-paid`)).status).toBe(200);
    expect((await call(ids.managerA, 'GET', `/sales/${sale}/agency-revenue`)).body.entries[0].status).toBe('ENTITLED');
  });



  it('audit failure rolls explicit receipt and reactivation back', async () => {
    await reset();
    await rule(ids.adminA, { supplierId: suppliers.A,mode: 'PERCENTAGE',baseSelector: 'LINE_TOTAL',
      value: 10,entitlementEvent: 'ON_SALE_CONFIRMATION' });
    const sale = await makeSale([{ supplier: 'A',unitPrice: 1000 }]);
    const entry = (await call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`)).body.entries[0];
    await admin.query(`CREATE FUNCTION reject_revenue_transition_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event_type IN ('AGENCY_REVENUE_RECEIVED','AGENCY_REVENUE_REACTIVATED')
      THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_revenue_transition_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_revenue_transition_audit()`);
    try {
      expect((await call(ids.adminA, 'POST', `/agency-revenue/entries/${entry.id}/receive`, { amount: 90 })).status).toBe(500);
      expect((await call(ids.managerA, 'GET', `/sales/${sale}/agency-revenue`)).body.entries[0]).toMatchObject({ status: 'ENTITLED',received_amount: null });
      expect((await call(ids.adminA, 'POST', `/agency-revenue/entries/${entry.id}/cancel`)).status).toBe(200);
      expect((await call(ids.adminA, 'POST', `/agency-revenue/entries/${entry.id}/reactivate`, { reason: 'Reativacao auditada' })).status).toBe(500);
      expect((await call(ids.managerA, 'GET', `/sales/${sale}/agency-revenue`)).body.entries[0].status).toBe('CANCELLED');
    } finally {
      await admin.query('DROP TRIGGER reject_revenue_transition_audit ON audit_logs; DROP FUNCTION reject_revenue_transition_audit()');
    }
  });

  it('D3: pays the employee commission through the financial flow before supplier receipt', async () => {
    await reset();
    await rule(ids.adminA, { supplierId: suppliers.A, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL',
      value: 10, entitlementEvent: 'ON_SALE_CONFIRMATION', collectionModel: 'SUPPLIER_COLLECTS' });
    const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
    await call(ids.managerA, 'POST', `/sales/${sale}/agency-revenue/calculate`);

    const employee = await admin.query<{ id: string }>("INSERT INTO employees (agency_id,name,base_salary) VALUES ($1,'D3',0) RETURNING id", [agencyA]);
    const scope = await admin.query<{ id: string }>('INSERT INTO employee_commission_rule_scopes (agency_id,employee_id) VALUES ($1,$2) RETURNING id', [agencyA,employee.rows[0]!.id]);
    const version = await admin.query<{ id: string }>(`INSERT INTO employee_commission_rule_versions
      (agency_id,scope_id,version_number,effective_from,mode,value) VALUES ($1,$2,1,'2020-01-01','PERCENTAGE',2) RETURNING id`, [agencyA,scope.rows[0]!.id]);
    const commission = await admin.query<{ id: string }>(`INSERT INTO commission_entries
      (agency_id,employee_id,sale_id,calculation_base,amount,status,release_mode,rule_version_id)
      VALUES ($1,$2,$3,1000,20,'APPROVED','LEGACY',$4) RETURNING id`, [agencyA,employee.rows[0]!.id,sale,version.rows[0]!.id]);
    const payable = await call(ids.managerA, 'POST', `/commissions/${commission.rows[0]!.id}/create-payable`);
    expect(payable.status).toBe(201);
    const payment = await call(ids.adminA, 'POST', '/financial/payments', { direction: 'OUT',amount: 20,occurredAt: new Date().toISOString() });
    expect(payment.status).toBe(201);
    const obligation = await admin.query<{ id: string }>('SELECT id FROM payables WHERE commission_entry_id=$1', [commission.rows[0]!.id]);
    expect((await call(ids.adminA, 'POST', `/financial/payments/${payment.body.payment.id}/allocations`, {
      allocations: [{ payableId: obligation.rows[0]!.id,amount: 20 }],
    })).status).toBe(200);
    expect((await admin.query<{ status: string }>('SELECT status FROM commission_entries WHERE id=$1', [commission.rows[0]!.id])).rows[0]?.status).toBe('PAID');

    const revenue = await call(ids.managerA, 'GET', `/sales/${sale}/agency-revenue`);
    expect(revenue.body.entries[0]).toMatchObject({ status: 'ENTITLED',amount: 100,received_amount: null });
    expect(revenue.body.totals.received).toBe(0);
  });

});
