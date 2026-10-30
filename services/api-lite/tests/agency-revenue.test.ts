/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- JSON fixtures in this integration test are intentionally untyped */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../src/access';
import { calculateSaleRevenue as liteCalc } from '../src/agency-revenue-calc';
import { calculateSaleRevenue as fullCalc } from '../../api/src/agency-revenue-calc';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

describe('Lite agency revenue calculation parity with Full (DEC-007)', () => {
  it('the pure module is byte-identical to the Full one', () => {
    const lite = readFileSync(resolve(import.meta.dirname, '../src/agency-revenue-calc.ts'), 'utf8');
    const full = readFileSync(resolve(import.meta.dirname, '../../api/src/agency-revenue-calc.ts'), 'utf8');
    expect(lite).toBe(full);
  });

  it('gives the same result on the reference cases', () => {
    const rule = { ruleVersionId: 'v', mode: 'PERCENTAGE' as const, baseSelector: 'LINE_TOTAL' as const, value: 7, collectionModel: 'AGENCY_COLLECTS' as const };
    const item = { itemId: 'i', supplierId: 's', qty: 1, unitPrice: 333.33, discount: 0, taxes: 0, fees: 0, lineMargin: 0, passengerCount: 1, rule };
    expect(liteCalc([item])).toEqual(fullCalc([item]));
    expect(liteCalc([item])[0]?.amount).toBe(23.33);
  });

  it('declares the new permissions', () => {
    for (const permission of ['revenue.rules_manage', 'revenue.read_all', 'revenue.receive']) {
      expect(PERMISSIONS).toContain(permission);
    }
  });
});

describe('Lite agency revenue over HTTP', () => {
  let lite: LiteFixture;
  let admin: string;
  let manager: string;
  let staff: string;
  let adminB: string;
  let customerId: string;
  let sellerId: string;
  let categoryId: string;
  const suppliers: Record<string, string> = {};
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

  async function call(token: string | null, method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: unknown) {
    const res = await lite.app.inject({
      method,
      url,
      ...(token ? { headers: lite.headers(token) } : {}),
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
    return { status: res.statusCode, body: res.json<Record<string, any>>() };
  }
  const rule = (token: string, body: Record<string, unknown>) =>
    call(token, 'POST', '/agency-revenue/rules', { reason: 'Politica comercial', ...body });

  beforeAll(async () => {
    lite = await createLiteFixture();
    admin = await lite.login('tenant-a', 'admin@a.test');
    staff = await lite.login('tenant-a', 'staff@a.test');
    adminB = await lite.login('tenant-b', 'admin@b.test');
    manager = admin;
    customerId = (await call(staff, 'POST', '/customers', { name: 'Cliente Receita' })).body.customer.id as string;
    sellerId = (await call(staff, 'POST', '/sellers', { name: 'Vendedor', commission_rule_type: 'PERCENTAGE_ON_GROSS', commission_rate: 10 })).body.seller.id as string;
    categoryId = (await call(admin, 'POST', '/categories', { name: 'Categoria Receita' })).body.category.id as string;
    for (const name of ['A', 'B', 'C']) {
      suppliers[name] = (await call(staff, 'POST', '/financial-parties', { type: 'SUPPLIER', name: `Fornecedor ${name}` })).body.financialParty.id as string;
    }
  });
  afterAll(async () => {
    await lite?.close();
  });

  const reset = async () => {
    await lite.adminPool.query('DELETE FROM agency_revenue_entries');
    await lite.adminPool.query('DELETE FROM agency_revenue_rule_versions');
    await lite.adminPool.query('DELETE FROM agency_revenue_scopes');
  };
  let saleSeq = 0;
  async function makeSale(items: Array<Record<string, any>>, opts: { status?: string; settled?: boolean; passengers?: number } = {}) {
    saleSeq += 1;
    const total = items.reduce((sum, item) => sum + item.unitPrice * (item.qty ?? 1) + (item.taxes ?? 0), 0);
    const sale = (
      await lite.adminPool.query<{ id: string }>(
        `INSERT INTO sales (tenant_id, customer_id, seller_id, category_id, sale_number, gross_amount, margin_amount, due_date,
                            status, settled_at, passenger_count)
         VALUES ($1, $2, $3, $4, $5, $6, $6, '2099-12-01', $7, $8, $9) RETURNING id`,
        [lite.tenantA, customerId, sellerId, categoryId, `REV-${saleSeq}`, total, opts.status ?? 'CONFIRMED',
          opts.settled ? new Date() : null, opts.passengers ?? null],
      )
    ).rows[0]!.id;
    for (const [index, item] of items.entries()) {
      await lite.adminPool.query(
        `INSERT INTO sale_items (tenant_id, sale_id, supplier_id, description, qty, unit_price, taxes, fees, discount, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9)`,
        [lite.tenantA, sale, item.supplier ? suppliers[item.supplier] : null, `Item ${index}`, item.qty ?? 1, item.unitPrice,
          item.taxes ?? 0, item.fees ?? 0, (item.qty ?? 1) * item.unitPrice + (item.taxes ?? 0) + (item.fees ?? 0)],
      );
    }
    return sale;
  }

  it('rules need revenue.rules_manage, are validated, and refuse MARGIN (no cost in Lite sale items)', async () => {
    await reset();
    const body = { supplier_id: suppliers.A, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 7 };
    expect((await call(null, 'POST', '/agency-revenue/rules', body)).status).toBe(401);
    expect((await rule(staff, body)).status).toBe(403);
    expect((await rule(admin, body)).status).toBe(201);
    for (const bad of [
      { ...body, value: 120 },
      { ...body, base_selector: 'MARGIN' },
      { ...body, effective_from: '2020-01-01' },
      { ...body, collection_model: 'SUPPLIER_COLLECTS', entitlement_event: 'ON_FULL_SETTLEMENT' },
      { ...body, tenant_id: lite.tenantB },
    ]) {
      expect((await rule(admin, bad)).status).toBe(400);
    }
    expect((await rule(admin, { ...body, supplier_id: '99999999-0000-4000-8000-000000000000' })).status).toBe(404);
    expect((await rule(admin, { ...body, value: 8 })).body.rule.version_number).toBe(2);
  });

  it('R1/R2/R3/R4/R7 numeric cases', async () => {
    await reset();
    await rule(admin, { supplier_id: suppliers.A, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 7 });
    await rule(admin, { supplier_id: suppliers.B, mode: 'FIXED_PER_PASSENGER', value: 25 });
    await rule(admin, { supplier_id: suppliers.C, mode: 'PERCENTAGE', base_selector: 'TAXES', value: 10 });
    const r1 = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
    const res1 = await call(manager, 'POST', `/sales/${r1}/agency-revenue/calculate`);
    expect(res1.body.entries[0]).toMatchObject({ status: 'FORECAST', amount: 70, base_amount: 1000 });
    const account = await call(admin, 'POST', '/financial-accounts', { name: 'Receita R1', type: 'CASH' });
    const condition = await call(admin, 'POST', '/payment-conditions', {
      name: 'R1', scheduleKind: 'EQUAL_INSTALLMENTS', maxInstallments: 1, minInstallmentAmount: null,
      interestFree: true, downPaymentMode: 'NONE', downPaymentValue: 0, downPaymentRequired: false,
      balanceDeadlineAnchor: 'SALE_DATE', balanceDeadlineOffsetDays: 0, allowsPartialPayments: true,
      paymentMethods: ['PIX'], categoryIds: [], productIds: [],
    });
    expect(condition.status).toBe(201);
    expect((await call(admin, 'POST', `/sales/${r1}/payment-schedule`, {
      conditionId: condition.body.condition.id, installments: 1, paymentMethod: 'PIX',
    })).status).toBe(201);
    expect((await call(admin, 'POST', `/sales/${r1}/payments`, {
      amount: 1000, idempotency_key: `r1-${r1}`, method: 'PIX', paid_at: new Date().toISOString(), account_id: account.body.account.id,
    })).status).toBe(201);
    expect((await call(manager, 'GET', `/sales/${r1}/agency-revenue`)).body.entries[0].status).toBe('ENTITLED');


    const settledEntry = (await call(manager, 'GET', `/sales/${r1}/agency-revenue`)).body.entries[0];
    expect((await call(admin, 'POST', `/agency-revenue/entries/${settledEntry.id}/receive`, { amount: 70 })).status).toBe(200);
    const scheduledPayment = await lite.adminPool.query<{ payment_id: string }>(
      `SELECT a.payment_id FROM payment_allocations a JOIN receivables r ON r.id=a.receivable_id AND r.tenant_id=a.tenant_id
       WHERE r.tenant_id=$1 AND r.sale_id=$2`, [lite.tenantA,r1]);
    expect((await call(admin, 'POST', `/payments/${scheduledPayment.rows[0]!.payment_id}/reverse`, { reason: 'D6 estorno bloqueado' })).status).toBe(409);

    const bus = await makeSale([{ supplier: 'B', unitPrice: 300 }], { passengers: 4 });
    expect((await call(manager, 'POST', `/sales/${bus}/agency-revenue/calculate`)).body.entries[0].amount).toBe(100);
    const cruise = await makeSale([{ supplier: 'C', unitPrice: 3000, taxes: 1200 }]);
    expect((await call(manager, 'POST', `/sales/${cruise}/agency-revenue/calculate`)).body.entries[0].amount).toBe(120);

    await rule(admin, { supplier_id: suppliers.A, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 5 });
    await rule(admin, { supplier_id: suppliers.B, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 12 });
    await rule(admin, { supplier_id: suppliers.C, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 30 });
    const air = await makeSale([
      { supplier: 'A', unitPrice: 2000 },
      { supplier: 'B', unitPrice: 3000 },
      { supplier: 'C', unitPrice: 150 },
    ]);
    await call(manager, 'POST', `/sales/${air}/agency-revenue/calculate`);
    // percentage rules are v1 for A, v2 for B/C only from today: all effective today, latest wins
    const read = await call(manager, 'GET', `/sales/${air}/agency-revenue`);
    expect(read.body.analysis.agency_revenue).toBe(505);

    const none = await makeSale([{ unitPrice: 500 }]);
    const pending = await call(manager, 'POST', `/sales/${none}/agency-revenue/calculate`);
    expect(pending.body.entries[0]).toMatchObject({ status: 'PENDING_RULE', amount: 0 });
  });

  it('only a user with revenue.receive receives; FORECAST cannot be received; difference stays visible', async () => {
    await reset();
    await rule(admin, { supplier_id: suppliers.A, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 10, entitlement_event: 'ON_SALE_CONFIRMATION' });
    const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
    const entry = (await call(manager, 'POST', `/sales/${sale}/agency-revenue/calculate`)).body.entries[0].id as string;
    expect((await call(staff, 'POST', `/agency-revenue/entries/${entry}/receive`, { amount: 100 })).status).toBe(403);
    const ok = await call(admin, 'POST', `/agency-revenue/entries/${entry}/receive`, { amount: 90, reference: 'PIX' });
    expect(ok.body).toMatchObject({ expected: 100, received: 90, difference: 10 });
    expect((await call(admin, 'POST', `/agency-revenue/entries/${entry}/receive`, { amount: 100 })).status).toBe(409);

    await reset();
    await rule(admin, { supplier_id: suppliers.A, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 10 });
    const waiting = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
    const forecast = (await call(manager, 'POST', `/sales/${waiting}/agency-revenue/calculate`)).body.entries[0];
    expect(forecast.status).toBe('FORECAST');
    expect((await call(admin, 'POST', `/agency-revenue/entries/${forecast.id}/receive`, { amount: 100 })).status).toBe(409);
  });

  it('D6: cancelling a sale with received revenue is 409; otherwise the revenue is cancelled', async () => {
    await reset();
    await rule(admin, { supplier_id: suppliers.A, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 10, entitlement_event: 'ON_SALE_CONFIRMATION' });
    const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
    const entry = (await call(manager, 'POST', `/sales/${sale}/agency-revenue/calculate`)).body.entries[0].id as string;
    await call(admin, 'POST', `/agency-revenue/entries/${entry}/receive`, { amount: 100 });
    expect((await call(admin, 'POST', `/sales/${sale}/cancel`)).status).toBe(409);
    expect((await lite.adminPool.query('SELECT status FROM sales WHERE id = $1', [sale])).rows[0].status).not.toBe('CANCELLED');

    await reset();
    await rule(admin, { supplier_id: suppliers.A, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 10, entitlement_event: 'ON_SALE_CONFIRMATION' });
    const other = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
    await call(manager, 'POST', `/sales/${other}/agency-revenue/calculate`);
    expect((await call(admin, 'POST', `/sales/${other}/cancel`)).status).toBe(200);
    const rows = await lite.adminPool.query('SELECT status FROM agency_revenue_entries WHERE sale_id = $1', [other]);
    expect(rows.rows.map((row) => row.status)).toEqual(['CANCELLED']);
  });

  it('hides the seller commission comparison from who cannot read commissions', async () => {
    await lite.adminPool.query(
      `INSERT INTO user_permissions (tenant_id, user_id, permission, effect) VALUES ($1, $2, 'revenue.read_all', 'GRANT') ON CONFLICT DO NOTHING`,
      [lite.tenantA, lite.sellerUserA1],
    );
    try {
      const sale = await makeSale([{ supplier: 'A', unitPrice: 100 }]);
      const sellerToken = await lite.login('tenant-a', 'seller1@a.test');
      const read = await call(sellerToken, 'GET', `/sales/${sale}/agency-revenue`);
      expect(read.status).toBe(200);
      expect(read.body.analysis.seller_commission).toBeNull();
      expect(read.body.analysis.difference).toBeNull();
      const full = await call(admin, 'GET', `/sales/${sale}/agency-revenue`);
      expect(full.body.analysis.seller_commission).not.toBeNull();
    } finally {
      await lite.adminPool.query(`DELETE FROM user_permissions WHERE user_id = $1 AND permission = 'revenue.read_all'`, [lite.sellerUserA1]);
    }
  });

  it('is append-only for rules, audited, and isolated by tenant', async () => {
    await reset();
    await rule(admin, { supplier_id: suppliers.A, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 10, entitlement_event: 'ON_SALE_CONFIRMATION' });
    await expect(lite.runtimePool.query('DELETE FROM agency_revenue_rule_versions')).rejects.toThrow();
    await expect(lite.runtimePool.query('UPDATE agency_revenue_rule_versions SET value = 1')).rejects.toThrow();
    const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
    const entry = (await call(manager, 'POST', `/sales/${sale}/agency-revenue/calculate`)).body.entries[0].id as string;
    expect((await call(adminB, 'GET', '/agency-revenue/rules')).body.rules).toHaveLength(0);
    expect((await call(adminB, 'GET', `/sales/${sale}/agency-revenue`)).status).toBe(404);
    expect((await call(adminB, 'POST', `/agency-revenue/entries/${entry}/receive`, { amount: 1 })).status).toBe(404);
    const events = (await lite.adminPool.query(`SELECT event_type FROM audit_logs WHERE tenant_id = $1 AND event_type LIKE 'AGENCY_REVENUE_%'`, [lite.tenantA]))
      .rows.map((row) => row.event_type as string);
    for (const expected of ['AGENCY_REVENUE_RULE_CREATED', 'AGENCY_REVENUE_CALCULATED', 'AGENCY_REVENUE_ENTITLED']) {
      expect(events).toContain(expected);
    }
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('concurrent calculations and confirmation create exactly one entitlement', async () => {
    await reset();
    await rule(admin, { supplier_id: suppliers.A, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 10, entitlement_event: 'ON_SALE_CONFIRMATION' });
    const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }], { status: 'DRAFT' });
    const results = await Promise.all([
      call(manager, 'POST', `/sales/${sale}/agency-revenue/calculate`),
      call(manager, 'POST', `/sales/${sale}/confirm`),
      call(manager, 'POST', `/sales/${sale}/agency-revenue/calculate`),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const read = await call(manager, 'GET', `/sales/${sale}/agency-revenue`);
    expect(read.body.entries).toHaveLength(1);
    expect(read.body.entries[0].status).toBe('ENTITLED');
    const audits = await lite.adminPool.query<{ count: string }>(
      `SELECT count(*) FROM audit_logs WHERE entity_id=$1 AND event_type='AGENCY_REVENUE_ENTITLED'`, [read.body.entries[0].id]);
    expect(Number(audits.rows[0]?.count)).toBe(1);
  });

  it('audit failure rolls confirmation and entitlement back together', async () => {
    await reset();
    await rule(admin, { supplier_id: suppliers.A, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 10, entitlement_event: 'ON_SALE_CONFIRMATION' });
    const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }], { status: 'DRAFT' });
    await call(manager, 'POST', `/sales/${sale}/agency-revenue/calculate`);
    await lite.adminPool.query(`CREATE FUNCTION reject_revenue_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event_type='AGENCY_REVENUE_ENTITLED' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_revenue_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_revenue_audit()`);
    try {
      expect((await call(manager, 'POST', `/sales/${sale}/confirm`)).status).toBe(500);
      expect((await lite.adminPool.query<{ status: string }>('SELECT status FROM sales WHERE id=$1', [sale])).rows[0]?.status).toBe('DRAFT');
      expect((await call(manager, 'GET', `/sales/${sale}/agency-revenue`)).body.entries[0].status).toBe('FORECAST');
    } finally {
      await lite.adminPool.query('DROP TRIGGER reject_revenue_audit ON audit_logs; DROP FUNCTION reject_revenue_audit()');
    }
  });

  it('item cancellation cancels its forecast and confirmation cannot entitle it', async () => {
    await reset();
    await rule(admin, { supplier_id: suppliers.A, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 10, entitlement_event: 'ON_SALE_CONFIRMATION' });
    const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }], { status: 'DRAFT' });
    const entry = (await call(manager, 'POST', `/sales/${sale}/agency-revenue/calculate`)).body.entries[0];
    expect((await call(admin, 'POST', `/sale-items/${entry.sale_item_id}/cancel`)).status).toBe(200);
    expect((await call(manager, 'POST', `/sales/${sale}/confirm`)).status).toBe(200);
    expect((await call(manager, 'GET', `/sales/${sale}/agency-revenue`)).body.entries[0].status).toBe('CANCELLED');
  });

  it('D6: received supplier revenue blocks item cancellation; totals use actual receipt', async () => {
    await reset();
    await rule(admin, { supplier_id: suppliers.A, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 10, entitlement_event: 'ON_SALE_CONFIRMATION', collection_model: 'SUPPLIER_COLLECTS' });
    const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
    const entry = (await call(manager, 'POST', `/sales/${sale}/agency-revenue/calculate`)).body.entries[0];
    expect((await call(admin, 'POST', `/agency-revenue/entries/${entry.id}/receive`, { amount: 90 })).status).toBe(200);
    expect((await call(admin, 'POST', `/sale-items/${entry.sale_item_id}/cancel`)).status).toBe(409);
    const read = await call(manager, 'GET', `/sales/${sale}/agency-revenue`);
    expect(read.body.totals).toMatchObject({ expected: 100, received: 90, difference: 10 });
    expect((await lite.adminPool.query<{ status: string }>('SELECT status FROM sale_items WHERE id=$1', [entry.sale_item_id])).rows[0]?.status).toBe('ACTIVE');
  });

  it('cancelled revenue survives recalculation and only explicit admin reactivation restores it', async () => {
    await reset();
    await rule(admin, { supplier_id: suppliers.A, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 10 });
    const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }], { status: 'DRAFT' });
    const entry = (await call(manager, 'POST', `/sales/${sale}/agency-revenue/calculate`)).body.entries[0];
    expect((await call(admin, 'POST', `/agency-revenue/entries/${entry.id}/cancel`)).status).toBe(200);
    const recalculated = await call(manager, 'POST', `/sales/${sale}/agency-revenue/calculate`);
    expect(recalculated.body.entries).toHaveLength(1);
    expect(recalculated.body.entries[0].status).toBe('CANCELLED');
    expect((await call(staff, 'POST', `/agency-revenue/entries/${entry.id}/reactivate`, { reason: 'Revisao' })).status).toBe(403);
    expect((await call(admin, 'POST', `/agency-revenue/entries/${entry.id}/reactivate`, { reason: ' ' })).status).toBe(400);
    expect((await call(adminB, 'POST', `/agency-revenue/entries/${entry.id}/reactivate`, { reason: 'Revisao' })).status).toBe(404);
    expect((await call(admin, 'POST', `/agency-revenue/entries/${entry.id}/reactivate`, { reason: 'Revisao comercial' })).status).toBe(200);
    expect((await call(manager, 'GET', `/sales/${sale}/agency-revenue`)).body.entries[0].status).toBe('FORECAST');
    const audit = await lite.adminPool.query<{ metadata: { reason: string } }>(
      `SELECT metadata FROM audit_logs WHERE entity_id=$1 AND event_type='AGENCY_REVENUE_REACTIVATED'`, [entry.id]);
    expect(audit.rows[0]?.metadata.reason).toBe('Revisao comercial');
    expect((await call(admin, 'POST', `/agency-revenue/entries/${entry.id}/reactivate`, { reason: 'Duplicado' })).status).toBe(409);
  });


  it('legacy receipt constitutes the right; reversal cancels it, or returns D6 409 after receipt', async () => {
    await reset();
    await rule(admin, { supplier_id: suppliers.A, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL', value: 10 });
    const account = await call(admin, 'POST', '/financial-accounts', { name: 'Legacy revenue', type: 'CASH' });
    for (const received of [false, true]) {
      const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
      const entry = (await call(admin, 'POST', `/sales/${sale}/agency-revenue/calculate`)).body.entries[0];
      const receipt = await lite.adminPool.query<{ id: string }>(`INSERT INTO receivables
        (tenant_id, sale_id, customer_id, description, amount, due_date) VALUES ($1,$2,$3,'Legacy',1000,'2099-12-01') RETURNING id`,
        [lite.tenantA, sale, customerId]);
      expect((await call(admin, 'POST', `/receivables/${receipt.rows[0]!.id}/receive`, { account_id: account.body.account.id })).status).toBe(200);
      expect((await call(admin, 'GET', `/sales/${sale}/agency-revenue`)).body.entries[0].status).toBe('ENTITLED');
      if (received) expect((await call(admin, 'POST', `/agency-revenue/entries/${entry.id}/receive`, { amount: 90 })).status).toBe(200);
      const payment = await lite.adminPool.query<{ payment_id: string }>(
        'SELECT payment_id FROM payment_allocations WHERE receivable_id=$1', [receipt.rows[0]!.id]);
      const reversed = await call(admin, 'POST', `/payments/${payment.rows[0]!.payment_id}/reverse`, { reason: 'Estorno de teste' });
      expect(reversed.status).toBe(received ? 409 : 201);
      expect((await call(admin, 'GET', `/sales/${sale}/agency-revenue`)).body.entries[0].status).toBe(received ? 'RECEIVED' : 'CANCELLED');
      const balance = await lite.adminPool.query<{ paid_amount: string }>('SELECT paid_amount FROM receivables WHERE id=$1', [receipt.rows[0]!.id]);
      expect(Number(balance.rows[0]?.paid_amount)).toBe(received ? 1000 : 0);
    }
  });



  it('audit failure rolls explicit receipt and reactivation back', async () => {
    await reset();
    await rule(admin, { supplier_id: suppliers.A,mode: 'PERCENTAGE',base_selector: 'LINE_TOTAL',
      value: 10,entitlement_event: 'ON_SALE_CONFIRMATION' });
    const sale = await makeSale([{ supplier: 'A',unitPrice: 1000 }]);
    const entry = (await call(manager, 'POST', `/sales/${sale}/agency-revenue/calculate`)).body.entries[0];
    await lite.adminPool.query(`CREATE FUNCTION reject_revenue_transition_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event_type IN ('AGENCY_REVENUE_RECEIVED','AGENCY_REVENUE_REACTIVATED')
      THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_revenue_transition_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_revenue_transition_audit()`);
    try {
      expect((await call(admin, 'POST', `/agency-revenue/entries/${entry.id}/receive`, { amount: 90 })).status).toBe(500);
      expect((await call(manager, 'GET', `/sales/${sale}/agency-revenue`)).body.entries[0]).toMatchObject({ status: 'ENTITLED',received_amount: null });
      expect((await call(admin, 'POST', `/agency-revenue/entries/${entry.id}/cancel`)).status).toBe(200);
      expect((await call(admin, 'POST', `/agency-revenue/entries/${entry.id}/reactivate`, { reason: 'Reativacao auditada' })).status).toBe(500);
      expect((await call(manager, 'GET', `/sales/${sale}/agency-revenue`)).body.entries[0].status).toBe('CANCELLED');
    } finally {
      await lite.adminPool.query('DROP TRIGGER reject_revenue_transition_audit ON audit_logs; DROP FUNCTION reject_revenue_transition_audit()');
    }
  });

  it('D3: pays the employee commission through the financial flow before supplier receipt', async () => {
    await reset();
    await rule(admin, { supplier_id: suppliers.A, mode: 'PERCENTAGE', base_selector: 'LINE_TOTAL',
      value: 10, entitlement_event: 'ON_SALE_CONFIRMATION', collection_model: 'SUPPLIER_COLLECTS' });
    const sale = await makeSale([{ supplier: 'A', unitPrice: 1000 }]);
    await call(manager, 'POST', `/sales/${sale}/agency-revenue/calculate`);

    const commission = await lite.adminPool.query<{ id: string }>(`INSERT INTO seller_commissions
      (tenant_id,sale_id,seller_id,calculation_type,calculation_base,commission_amount,status,release_mode)
      VALUES ($1,$2,$3,'MANUAL',1000,20,'PENDING','ON_SALE') RETURNING id`, [lite.tenantA,sale,sellerId]);
    expect((await call(admin, 'POST', `/commissions/${commission.rows[0]!.id}/approve`, {})).status).toBe(200);
    const payable = await lite.adminPool.query<{ id: string }>('SELECT id FROM payables WHERE commission_id=$1', [commission.rows[0]!.id]);
    const account = await call(admin, 'POST', '/financial-accounts', { name: 'D3', type: 'CASH' });
    expect((await call(admin, 'POST', `/payables/${payable.rows[0]!.id}/pay`, { account_id: account.body.account.id })).status).toBe(200);
    expect((await lite.adminPool.query<{ status: string }>('SELECT status FROM seller_commissions WHERE id=$1', [commission.rows[0]!.id])).rows[0]?.status).toBe('PAID');

    const revenue = await call(manager, 'GET', `/sales/${sale}/agency-revenue`);
    expect(revenue.body.entries[0]).toMatchObject({ status: 'ENTITLED',amount: 100,received_amount: null });
    expect(revenue.body.totals.received).toBe(0);
  });

});
