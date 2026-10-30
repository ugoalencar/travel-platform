/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- JSON fixtures in this integration test are intentionally untyped */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { projectReceivables as liteReceivables } from '../src/report-projections';
import { projectReceivables as fullReceivables } from '../../api/src/report-projections';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

describe('Lite projections: pure module parity with Full (DEC-007)', () => {
  it('is byte-identical to the Full module and gives the same result', () => {
    const lite = readFileSync(resolve(import.meta.dirname, '../src/report-projections.ts'), 'utf8');
    const full = readFileSync(resolve(import.meta.dirname, '../../api/src/report-projections.ts'), 'utf8');
    expect(lite).toBe(full);
    const rows = [{ id: 'a', saleId: 's', dueDate: '2026-10-20', amount: 500, paid: 200, status: 'PARTIALLY_PAID' }];
    expect(liteReceivables(rows, '2026-10-24')).toEqual(fullReceivables(rows, '2026-10-24'));
    expect(liteReceivables(rows, '2026-10-24').late).toEqual({ count: 1, openBalance: 300 });
  });
});

describe('Lite projection reports over HTTP', () => {
  let lite: LiteFixture;
  let admin: string;
  let staff: string;
  let adminB: string;
  let customerId: string;
  let sellerId: string;
  let categoryId: string;
  let supplierId: string;
  const civil = (offset: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + offset * 86400000));

  async function call(token: string | null, method: 'GET' | 'POST', url: string, payload?: unknown) {
    const res = await lite.app.inject({
      method, url,
      ...(token ? { headers: lite.headers(token) } : {}),
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    const type = String(res.headers['content-type'] ?? '');
    return { status: res.statusCode, headers: res.headers, text: res.body, body: type.includes('json') ? res.json<Record<string, any>>() : {} };
  }

  beforeAll(async () => {
    lite = await createLiteFixture();
    admin = await lite.login('tenant-a', 'admin@a.test');
    staff = await lite.login('tenant-a', 'staff@a.test');
    adminB = await lite.login('tenant-b', 'admin@b.test');
    customerId = (await call(staff, 'POST', '/customers', { name: 'Cliente' })).body.customer.id as string;
    sellerId = (await call(staff, 'POST', '/sellers', { name: 'Vendedor', commission_rule_type: 'PERCENTAGE_ON_GROSS', commission_rate: 10 })).body.seller.id as string;
    categoryId = (await call(admin, 'POST', '/categories', { name: 'Categoria' })).body.category.id as string;
    supplierId = (await call(staff, 'POST', '/financial-parties', { type: 'SUPPLIER', name: 'Fornecedor' })).body.financialParty.id as string;
  });
  afterAll(async () => {
    await lite?.close();
  });

  let seq = 0;
  async function makeSale(destination: string, status = 'CONFIRMED', price = 1000) {
    seq += 1;
    const sale = (await lite.adminPool.query<{ id: string }>(
      `INSERT INTO sales (tenant_id, customer_id, seller_id, category_id, sale_number, gross_amount, margin_amount, due_date, status, destination_text)
       VALUES ($1, $2, $3, $4, $5, $6, $6, '2099-12-01', $7, $8) RETURNING id`,
      [lite.tenantA, customerId, sellerId, categoryId, `PRJ-${seq}`, price, status, destination],
    )).rows[0]!.id;
    await lite.adminPool.query(
      `INSERT INTO sale_items (tenant_id, sale_id, supplier_id, description, qty, unit_price, line_total) VALUES ($1, $2, $3, 'Item', 1, $4, $4)`,
      [lite.tenantA, sale, supplierId, price],
    );
    return sale;
  }
  async function makeReceivable(saleId: string, dueOffset: number, amount: number, paid: number, installment: number) {
    await lite.adminPool.query(
      `INSERT INTO receivables (tenant_id, sale_id, installment_number, installment_count, customer_id, description, amount, paid_amount, due_at, status)
       VALUES ($1, $2, $3, 2, $4, 'Parcela', $5, $6, $7::date, $8)`,
      [lite.tenantA, saleId, installment, customerId, amount, paid, civil(dueOffset), paid > 0 ? 'PARTIALLY_PAID' : 'OPEN'],
    );
  }
  const reset = async () => {
    for (const table of ['agency_revenue_entries', 'agency_revenue_rule_versions', 'agency_revenue_scopes', 'receivables']) {
      await lite.adminPool.query(`DELETE FROM ${table}`);
    }
  };

  it('requires authentication and the right permission; validates filters', async () => {
    for (const path of ['receivables-projection', 'revenue-forecast', 'supplier-balances']) {
      expect((await call(null, 'GET', `/reports/${path}`)).status).toBe(401);
      expect((await call(admin, 'GET', `/reports/${path}`)).status).toBe(200);
    }
    expect((await call(admin, 'GET', '/reports/receivables-projection?saleFrom=nope')).status).toBe(400);
    expect((await call(admin, 'GET', '/reports/receivables-projection?tenant_id=x')).status).toBe(400);
    expect((await call(admin, 'GET', '/reports/receivables-projection?status=HACK')).status).toBe(400);
    // a filter the report cannot honour is refused, not silently ignored
    expect((await call(admin, 'GET', `/reports/receivables-projection?supplierId=${supplierId}`)).status).toBe(400);
    expect((await call(admin, 'GET', `/reports/revenue-forecast?supplierId=${supplierId}`)).status).toBe(200);
    // a seller has no finance/revenue permission
    const seller = await lite.login('tenant-a', 'seller1@a.test');
    for (const path of ['receivables-projection', 'revenue-forecast', 'supplier-balances']) {
      expect((await call(seller, 'GET', `/reports/${path}`)).status).toBe(403);
    }
  });

  it('open balance after a partial payment, late separated, filtered by destination (literal LIKE)', async () => {
    await reset();
    const gramado = await makeSale('Gramado, RS');
    await makeReceivable(gramado, -5, 500, 200, 1);
    await makeReceivable(gramado, 20, 500, 0, 2);
    const lisboa = await makeSale('Lisboa', 'CONFIRMED', 800);
    await makeReceivable(lisboa, 20, 400, 0, 1);
    await makeReceivable(lisboa, 40, 400, 0, 2);
    const all = await call(admin, 'GET', '/reports/receivables-projection');
    expect(all.body.late).toEqual({ count: 1, openBalance: 300 });
    expect(all.body.totalOpen).toBe(1600);
    const filtered = await call(admin, 'GET', '/reports/receivables-projection?destination=gramado');
    expect(filtered.body.totalOpen).toBe(800);
    expect((await call(admin, 'GET', '/reports/receivables-projection?destination=%25')).body.totalOpen).toBe(0);
    const csv = await call(admin, 'GET', '/reports/receivables-projection?format=csv');
    expect(csv.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(csv.text.replace(/^﻿/, '').split('\r\n')[0]).toBe('period,openBalance,count');
  });

  it('revenue forecast separates classes, ignores PENDING_RULE and shows the supplier difference', async () => {
    await reset();
    expect((await call(admin, 'POST', '/agency-revenue/rules', { supplier_id: supplierId, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 10, entitlement_event: 'ON_SALE_CONFIRMATION', reason: 'x' })).status).toBe(201);
    const confirmed = await makeSale('Gramado');
    await call(admin, 'POST', `/sales/${confirmed}/agency-revenue/calculate`);
    const draft = await makeSale('Gramado', 'DRAFT', 400);
    await call(admin, 'POST', `/sales/${draft}/agency-revenue/calculate`);
    // an item without any rule becomes PENDING_RULE and must never count
    seq += 1;
    const noRule = (await lite.adminPool.query<{ id: string }>(
      `INSERT INTO sales (tenant_id, customer_id, seller_id, category_id, sale_number, gross_amount, margin_amount, due_date, status)
       VALUES ($1, $2, $3, $4, $5, 999, 999, '2099-12-01', 'CONFIRMED') RETURNING id`,
      [lite.tenantA, customerId, sellerId, categoryId, `PRJ-${seq}`],
    )).rows[0]!.id;
    await lite.adminPool.query(`INSERT INTO sale_items (tenant_id, sale_id, description, qty, unit_price, line_total) VALUES ($1, $2, 'Sem fornecedor', 1, 999, 999)`, [lite.tenantA, noRule]);
    await call(admin, 'POST', `/sales/${noRule}/agency-revenue/calculate`);
    expect((await lite.adminPool.query(`SELECT status FROM agency_revenue_entries WHERE sale_id = $1`, [noRule])).rows[0].status).toBe('PENDING_RULE');
    const forecast = await call(admin, 'GET', '/reports/revenue-forecast');
    expect(forecast.body.contracted.total).toBe(100);
    expect(forecast.body.undefined.total).toBe(40);
    const entry = (await lite.adminPool.query<{ id: string }>(`SELECT id FROM agency_revenue_entries WHERE sale_id = $1`, [confirmed])).rows[0]!.id;
    await call(admin, 'POST', `/agency-revenue/entries/${entry}/receive`, { amount: 90 });
    const balances = await call(admin, 'GET', '/reports/supplier-balances');
    expect(balances.body.rows).toEqual([{ supplierId, expected: 100, received: 90, difference: 10 }]);
  });

  it('is isolated by tenant', async () => {
    expect((await call(adminB, 'GET', '/reports/revenue-forecast')).body.grandTotal).toBe(0);
    expect((await call(adminB, 'GET', '/reports/supplier-balances')).body.rows).toEqual([]);
    expect((await call(adminB, 'GET', '/reports/receivables-projection')).body.totalOpen).toBe(0);
  });
});
