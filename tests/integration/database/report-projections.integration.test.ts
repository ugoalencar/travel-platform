/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- HTTP/JSON and pg row fixtures in this integration test are intentionally untyped */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

// Own container/port: never the shared Onda B database, the demo or 55438.
vi.hoisted(() => {
  process.env.ONDA_B_TEST_DB_PORT ??= '55631';
  process.env.ONDA_B_TEST_DB_CONTAINER ??= 'travel-full-proj-int';
  process.env.ONDA_B_TEST_DB_PROJECT ??= 'travel-full-proj-int';
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

const agencyA = '10000000-0000-4000-8000-0000000000a9';
const agencyB = '20000000-0000-4000-8000-0000000000b9';
const ids = {
  adminA: '11000000-0000-4000-8000-0000000000a2',
  managerA: '11000000-0000-4000-8000-0000000000a3',
  agentA: '11000000-0000-4000-8000-0000000000a4',
  adminB: '21000000-0000-4000-8000-0000000000b1',
};
const roleOf: Record<keyof typeof ids, [string, UserRole]> = {
  adminA: [agencyA, 'ADMIN' as UserRole],
  managerA: [agencyA, 'MANAGER' as UserRole],
  agentA: [agencyA, 'AGENT' as UserRole],
  adminB: [agencyB, 'ADMIN' as UserRole],
};
const civil = (offsetDays: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + offsetDays * 86400000));

describe('Report projections (Frente 9) over HTTP with a real database', () => {
  let db: DisposableDb;
  let admin: Pool;
  let supplier: string;
  let customerA: string;

  beforeAll(async () => {
    db = await startDisposableDb(MIGRATIONS);
    admin = db.adminPool;
    await admin.query(
      `INSERT INTO agencies (id, name, slug, email, plan, status) VALUES
        ($1, 'Agency A', 'agency-a-proj', 'a@example.test', 'FREE', 'ACTIVE'),
        ($2, 'Agency B', 'agency-b-proj', 'b@example.test', 'FREE', 'ACTIVE')`,
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
    supplier = (await admin.query<{ id: string }>(`INSERT INTO suppliers (agency_id, name) VALUES ($1, '=Fornecedor') RETURNING id`, [agencyA])).rows[0]!.id;
    customerA = (await admin.query<{ id: string }>(`INSERT INTO customers (agency_id, name, status) VALUES ($1, 'Cliente', 'ACTIVE') RETURNING id`, [agencyA])).rows[0]!.id;
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
          const row = (await admin.query<{ id: string; agency_id: string; role: string; email: string }>(
            `SELECT id, agency_id, role, email FROM users WHERE id = $1 AND status = 'ACTIVE'`, [token])).rows[0];
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

  async function get(as: string | null, url: string) {
    const server = app();
    try {
      const res = await server.inject({ url, ...(as ? { headers: { 'x-test-user': as } } : {}) });
      const type = String(res.headers['content-type'] ?? '');
      return { status: res.statusCode, headers: res.headers, text: res.body, body: type.includes('json') ? res.json<Record<string, any>>() : {} };
    } finally {
      await server.close();
    }
  }
  async function post(as: string, url: string, payload?: unknown) {
    const server = app();
    try {
      const res = await server.inject({ method: 'POST', url, headers: { 'x-test-user': as }, ...(payload !== undefined ? { payload: payload as object } : {}) });
      return { status: res.statusCode, body: res.json<Record<string, any>>() };
    } finally {
      await server.close();
    }
  }

  const reset = async () => {
    for (const table of ['agency_revenue_entries', 'agency_revenue_rule_versions', 'agency_revenue_scopes', 'payment_allocations', 'payments', 'receivables']) {
      await admin.query(`DELETE FROM ${table}`);
    }
  };

  async function makeSale(opts: { destination?: string; origin?: string; total?: number; status?: string; saleDate?: string; items?: Array<{ supplier?: boolean; price: number }> }) {
    const total = opts.total ?? 1000;
    const sale = (
      await admin.query<{ id: string }>(
        `INSERT INTO sales (agency_id, customer_id, user_id, amount, discount, total, status, destination_text, origin_text, sale_date)
         VALUES ($1, $2, $3, $4, 0, $4, $5, $6, $7, COALESCE($8::date, CURRENT_DATE)) RETURNING id`,
        [agencyA, customerA, ids.agentA, total, opts.status ?? 'CONFIRMED', opts.destination ?? null, opts.origin ?? null, opts.saleDate ?? null],
      )
    ).rows[0]!.id;
    for (const [index, item] of (opts.items ?? []).entries()) {
      await admin.query(
        `INSERT INTO sale_items (agency_id, sale_id, description, supplier_id, qty, unit_price, line_total, line_margin)
         VALUES ($1, $2, $3, $4, 1, $5, $5, 0)`,
        [agencyA, sale, `Item ${index}`, item.supplier ? supplier : null, item.price],
      );
    }
    return sale;
  }
  async function makeReceivable(saleId: string, dueOffset: number, amount: number, paid = 0, installment = 1) {
    const id = (
      await admin.query<{ id: string }>(
        `INSERT INTO receivables (agency_id, sale_id, customer_id, description, amount, due_at, due_date, status, installment_number, installment_count)
         VALUES ($1, $2, $3, 'Parcela', $4, ($5::date)::timestamp AT TIME ZONE 'UTC', $5::date, $6, $7, 2) RETURNING id`,
        [agencyA, saleId, customerA, amount, civil(dueOffset), paid > 0 ? 'PARTIALLY_PAID' : 'OPEN', installment],
      )
    ).rows[0]!.id;
    if (paid > 0) {
      const payment = (await admin.query<{ id: string }>(`INSERT INTO payments (agency_id, direction, amount, occurred_at, created_by) VALUES ($1, 'IN', $2, now(), $3) RETURNING id`, [agencyA, paid, ids.adminA])).rows[0]!.id;
      await admin.query(`INSERT INTO payment_allocations (agency_id, payment_id, receivable_id, amount) VALUES ($1, $2, $3, $4)`, [agencyA, payment, id, paid]);
    }
    return id;
  }

  describe('access', () => {
    it('requires authentication and MANAGER+, validates filters', async () => {
      for (const path of ['receivables-projection', 'revenue-forecast', 'supplier-balances', 'commissions-projection']) {
        expect((await get(null, `/reports/${path}`)).status).toBe(401);
        expect((await get(ids.agentA, `/reports/${path}`)).status).toBe(403);
        expect((await get(ids.managerA, `/reports/${path}`)).status).toBe(200);
      }
      expect((await get(ids.managerA, '/reports/receivables-projection?saleFrom=2026-13-99x')).status).toBe(400);
      expect((await get(ids.managerA, '/reports/receivables-projection?agencyId=' + agencyB)).status).toBe(400);
      expect((await get(ids.managerA, '/reports/receivables-projection?status=HACK')).status).toBe(400);
    });
  });

  describe('source restrictions apply to the projections too', () => {
    it('a role restriction or a per-user REVOKE blocks the receivables projection and the commissions projection', async () => {
      await reset();
      await admin.query('DELETE FROM permission_restrictions');
      await admin.query('DELETE FROM user_permission_overrides');
      expect((await get(ids.managerA, '/reports/receivables-projection')).status).toBe(200);
      await admin.query(`INSERT INTO user_permission_overrides (agency_id, user_id, resource, action, effect, reason, created_by_user_id)
        VALUES ($1, $2, 'financial', 'receivables.read', 'REVOKE', 'teste', $3)`, [agencyA, ids.managerA, ids.adminA]);
      expect((await get(ids.managerA, '/reports/receivables-projection')).status).toBe(403);
      expect((await get(ids.adminA, '/reports/receivables-projection')).status).toBe(200);
      await admin.query('DELETE FROM user_permission_overrides');
      await admin.query(`INSERT INTO permission_restrictions (agency_id, role, resource, action, created_by_user_id) VALUES ($1, 'MANAGER', 'employees', 'view', $2)`, [agencyA, ids.adminA]);
      expect((await get(ids.managerA, '/reports/commissions-projection')).status).toBe(403);
      await admin.query('DELETE FROM permission_restrictions');
      expect((await get(ids.managerA, '/reports/commissions-projection')).status).toBe(200);
    });
    it('all projections accept supplier and product filters', async () => {
      for (const path of ['receivables-projection', 'commissions-projection']) {
        expect((await get(ids.managerA, `/reports/${path}?supplierId=${supplier}`)).status).toBe(200);
        expect((await get(ids.managerA, `/reports/${path}?productId=x`)).status).toBe(200);
      }
      expect((await get(ids.managerA, `/reports/revenue-forecast?supplierId=${supplier}`)).status).toBe(200);
    });
  });

  describe('receivables projection', () => {
    it('open balance after a partial payment, late separated, filtered by destination', async () => {
      await reset();
      const gramado = await makeSale({ destination: 'Gramado, RS', total: 1000 });
      await makeReceivable(gramado, -5, 500, 200);
      await makeReceivable(gramado, 20, 500, 0, 2);
      const other = await makeSale({ destination: 'Lisboa', total: 800 });
      await makeReceivable(other, 20, 800);

      const all = await get(ids.managerA, '/reports/receivables-projection');
      expect(all.body.late).toEqual({ count: 1, openBalance: 300 });
      expect(all.body.totalOpen).toBe(1600);

      const filtered = await get(ids.managerA, '/reports/receivables-projection?destination=gramado');
      expect(filtered.body.late.openBalance).toBe(300);
      expect(filtered.body.totalOpen).toBe(800);
      expect(filtered.body.byMonth.reduce((sum: number, row: any) => sum + row.openBalance, 0)).toBe(500);
    });
    it('a LIKE wildcard in a filter is literal, and CSV is formula-safe with private headers', async () => {
      await reset();
      const sale = await makeSale({ destination: 'Gramado' });
      await makeReceivable(sale, 10, 100);
      expect((await get(ids.managerA, '/reports/receivables-projection?destination=%25')).body.totalOpen).toBe(0);
      const csv = await get(ids.managerA, '/reports/receivables-projection?format=csv');
      expect(csv.status).toBe(200);
      expect(csv.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(csv.headers['cache-control']).toBe('private, no-store');
      expect(csv.text.replace(/^﻿/, '').split('\r\n')[0]).toBe('period,openBalance,count');
    });
  });

  describe('revenue forecast and supplier balances', () => {
    it('separates contracted / projected / undefined, ignores PENDING_RULE, and exposes the supplier difference', async () => {
      await reset();
      const rule = await post(ids.adminA, '/agency-revenue/rules', { supplierId: supplier, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 10, entitlementEvent: 'ON_SALE_CONFIRMATION', reason: 'x' });
      expect(rule.status).toBe(201);
      // contracted: confirmed sale, ON_SALE_CONFIRMATION -> ENTITLED (10% of 1000 = 100)
      const confirmed = await makeSale({ items: [{ supplier: true, price: 1000 }] });
      await post(ids.managerA, `/sales/${confirmed}/agency-revenue/calculate`);
      // projected: pending sale -> FORECAST for ON_SALE_CONFIRMATION has no date => undefined
      const pending = await makeSale({ status: 'PENDING', items: [{ supplier: true, price: 400 }] });
      await post(ids.managerA, `/sales/${pending}/agency-revenue/calculate`);
      // no rule for the item without supplier -> PENDING_RULE, never counted
      const noRule = await makeSale({ items: [{ price: 999 }] });
      await post(ids.managerA, `/sales/${noRule}/agency-revenue/calculate`);

      const forecast = await get(ids.managerA, '/reports/revenue-forecast');
      expect(forecast.body.contracted.total).toBe(100);
      expect(forecast.body.undefined.total).toBe(40);
      expect(forecast.body.projected.total).toBe(0);
      expect(forecast.body.grandTotal).toBe(140);

      const entry = (await admin.query<{ id: string }>(`SELECT id FROM agency_revenue_entries WHERE sale_id = $1`, [confirmed])).rows[0]!.id;
      await post(ids.adminA, `/agency-revenue/entries/${entry}/receive`, { amount: 90 });
      const balances = await get(ids.managerA, '/reports/supplier-balances');
      expect(balances.body.rows).toEqual([{
        supplierId: supplier,
        volumeSold: 1400,
        expected: 100,
        received: 90,
        difference: 10,
        employeeCommissionsPaid: 0,
        result: 90,
      }]);
      const after = await get(ids.managerA, '/reports/revenue-forecast');
      expect(after.body.contracted.total).toBe(0);
    });
    it('a settlement-based FORECAST is projected on the last receivable due date', async () => {
      await reset();
      await post(ids.adminA, '/agency-revenue/rules', { supplierId: supplier, mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', value: 10, entitlementEvent: 'ON_FULL_SETTLEMENT', reason: 'x' });
      const sale = await makeSale({ items: [{ supplier: true, price: 1000 }] });
      await makeReceivable(sale, 10, 500);
      await makeReceivable(sale, 40, 500, 0, 2);
      await post(ids.managerA, `/sales/${sale}/agency-revenue/calculate`);
      const forecast = await get(ids.managerA, '/reports/revenue-forecast');
      expect(forecast.body.projected.total).toBe(100);
      expect(forecast.body.projected.byMonth).toEqual([{ month: civil(40).slice(0, 7), amount: 100 }]);
    });
    it("agency B sees none of agency A's rows", async () => {
      expect((await get(ids.adminB, '/reports/revenue-forecast')).body.grandTotal).toBe(0);
      expect((await get(ids.adminB, '/reports/supplier-balances')).body.rows).toEqual([]);
      expect((await get(ids.adminB, '/reports/receivables-projection')).body.totalOpen).toBe(0);
    });
    it('revenue CSV protects formulas in the supplier column', async () => {
      const csv = await get(ids.managerA, '/reports/supplier-balances?format=csv');
      expect(csv.status).toBe(200);
      expect(csv.text).toContain('supplierId,volumeSold,expectedRevenue,receivedRevenue,difference,employeeCommissionsPaid,agencyResult');
    });
  });

  describe('commission projection', () => {
    it('is independent from the agency revenue and returns zeros when there are no entries', async () => {
      await reset();
      const res = await get(ids.managerA, '/reports/commissions-projection');
      expect(res.body).toEqual({
        forecast: 0,
        released: 0,
        paid: 0,
        releasedNotPaid: 0,
        notYetReleased: 0,
        releasedNotPaidByExpectedPayMonth: [],
      });
    });
    it('honours every combined filter with real commissions, batch dates and identical CSV totals', async () => {
      const sale = await makeSale({ saleDate: '2026-01-10', origin: 'Curitiba', destination: 'Gramado', items: [{ supplier: true, price: 1000 }] });
      const category = (await admin.query(`INSERT INTO commission_categories (agency_id,name) VALUES ($1,'Rodoviário D9') RETURNING id`, [agencyA])).rows[0].id;
      await admin.query(`UPDATE sales SET category_id=$2,travel_start_date='2026-02-10' WHERE id=$1`, [sale,category]);
      const employee = (await admin.query(`INSERT INTO employees (agency_id,name) VALUES ($1,'D9') RETURNING id`, [agencyA])).rows[0].id;
      const scope = (await admin.query(`INSERT INTO employee_commission_rule_scopes (agency_id,employee_id) VALUES ($1,$2) RETURNING id`, [agencyA,employee])).rows[0].id;
      const version = (await admin.query(`INSERT INTO employee_commission_rule_versions (agency_id,scope_id,version_number,effective_from,mode,value) VALUES ($1,$2,1,'2020-01-01','PERCENTAGE',3) RETURNING id`, [agencyA,scope])).rows[0].id;
      await admin.query(`INSERT INTO commission_entries (agency_id,employee_id,sale_id,calculation_base,amount,status,rule_version_id,release_mode)
        VALUES ($1,$2,$3,1000,30,'APPROVED',$4,'LEGACY')`, [agencyA,employee,sale,version]);
      // Historical fixture: the public API correctly refuses retroactive rule creation.
      const revenueScope = (await admin.query(`INSERT INTO agency_revenue_scopes (agency_id,supplier_id,category_id) VALUES ($1,$2,$3) RETURNING id`, [agencyA,supplier,category])).rows[0].id;
      await admin.query(`INSERT INTO agency_revenue_rule_versions (agency_id,scope_id,version_number,effective_from,mode,base_selector,value,entitlement_event,reason)
        VALUES ($1,$2,1,'2020-01-01','PERCENTAGE','LINE_TOTAL',7,'ON_SALE_CONFIRMATION','D9 historical fixture')`, [agencyA,revenueScope]);
      expect((await post(ids.managerA, `/sales/${sale}/agency-revenue/calculate`)).status).toBe(200);
      const entry = (await admin.query(`SELECT id FROM agency_revenue_entries WHERE sale_id=$1`, [sale])).rows[0].id;
      const batch = (await admin.query(`INSERT INTO agency_revenue_batches (agency_id,window_month,window_start,window_end,expected_payment_date,policy_snapshot,created_by)
        VALUES ($1,'2026-02-01','2026-01-31','2026-02-28','2026-03-15','{}',$2) RETURNING id`, [agencyA,ids.adminA])).rows[0].id;
      await admin.query(`INSERT INTO agency_revenue_batch_entries (agency_id,batch_id,entry_id,amount) VALUES ($1,$2,$3,70)`, [agencyA,batch,entry]);
      await admin.query(`UPDATE agency_revenue_entries SET status='AVAILABLE',expected_payment_date='2026-03-15' WHERE id=$1`, [entry]);
      await makeReceivable(sale, 10, 1000, 300);
      const filters = new URLSearchParams({ saleFrom: '2026-01-01', saleTo: '2026-01-31', travelFrom: '2026-02-01', travelTo: '2026-02-28', origin: 'Curitiba', destination: 'Gramado', categoryId: category, supplierId: supplier, employeeId: employee, status: 'CONFIRMED' });
      const url = `/reports/commissions-projection?${filters}`;
      expect((await get(ids.managerA,url)).body).toMatchObject({ forecast: 30, released: 30, paid: 0 });
      expect((await get(ids.managerA,`${url}&format=csv`)).text).toContain('30,30,0,30,0');
      const revenueUrl = `/reports/revenue-forecast?${filters}`;
      expect((await get(ids.managerA,revenueUrl)).body.contracted.byMonth).toEqual([{ month: '2026-03', amount: 70 }]);
      expect((await get(ids.managerA,`${revenueUrl}&format=csv`)).text).toContain('2026-03-15,70,70,0');
      expect((await get(ids.managerA,`/reports/receivables-projection?${filters}`)).body.totalOpen).toBe(700);
      for (const [key, mismatch] of Object.entries({ saleFrom: '2026-01-11', saleTo: '2026-01-09', travelFrom: '2026-02-11', travelTo: '2026-02-09', origin: 'Lisboa', destination: 'Paris', categoryId: 'other', supplierId: 'other', employeeId: 'other', status: 'CANCELLED' })) {
        const rejected = new URLSearchParams(filters); rejected.set(key,mismatch);
        expect((await get(ids.managerA,`/reports/commissions-projection?${rejected}`)).body.forecast, key).toBe(0);
      }
    });
  });
});
