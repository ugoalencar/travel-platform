import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';
import type { SaleBalance } from '../src/sale-payment-schedules';

describe('Lite optional real payment schedule', () => {
  let f: LiteFixture;
  let admin: string;
  let manager: string;
  let other: string;
  let seller: string;
  let customer: string;
  let category: string;
  let account: string;
  let methodId: string;
  const condition = { name: 'Entrada 30%', scheduleKind: 'DOWN_PAYMENT_PLUS_BALANCE', maxInstallments: 10,
    minInstallmentAmount: null, interestFree: true, downPaymentMode: 'PERCENT', downPaymentValue: 30,
    downPaymentRequired: true, balanceDeadlineAnchor: 'TRAVEL_START', balanceDeadlineOffsetDays: -15,
    allowsPartialPayments: true, paymentMethods: ['PIX'], categoryIds: [], productIds: [] };
  async function call(token: string, verb: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) {
    return f.app.inject({ method: verb, url, headers: f.headers(token), ...(payload ? { payload } : {}) });
  }
  async function prepare(overrides: object = {}, confirmed = false, installments = 1) {
    const c = await call(admin, 'POST', '/payment-conditions', { ...condition, ...overrides });
    expect(c.statusCode).toBe(201);
    const created = await call(manager, 'POST', '/sales', { customer_id: customer, seller_id: seller,
      category_id: category, gross_amount: 1000, due_date: '2028-01-31', installment_count: installments,
      payment_method_id: methodId, sale_date: '2028-01-31', travel_start_date: '2028-12-20' });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ sale: { id: string } }>().sale.id;
    if (confirmed) expect((await call(manager, 'POST', `/sales/${id}/confirm`)).statusCode).toBe(200);
    const applied = await call(admin, 'POST', `/sales/${id}/payment-schedule`, {
      conditionId: c.json<{ condition: { id: string } }>().condition.id, installments, paymentMethod: 'PIX' });
    return { id, applied };
  }
  const payment = (amount: number, key = randomUUID()) => ({ amount, idempotency_key: key,
    method: 'PIX', paid_at: '2028-12-05T00:00:00-03:00', account_id: account });
  const pay = (id: string, input: object) => call(admin, 'POST', `/sales/${id}/payments`, input);
  const balance = async (id: string) => (await call(admin, 'GET', `/sales/${id}/balance`)).json<SaleBalance>();
  beforeAll(async () => {
    f = await createLiteFixture();
    admin = await f.login('tenant-a', 'admin@a.test');
    manager = await f.login('tenant-a', 'staff@a.test');
    other = await f.login('tenant-b', 'admin@b.test');
    seller = (await call(admin, 'POST', '/sellers', { name: 'Cronograma' })).json<{ seller: { id: string } }>().seller.id;
    customer = (await call(admin, 'POST', '/customers', { name: 'Cronograma' })).json<{ customer: { id: string } }>().customer.id;
    category = (await call(admin, 'POST', '/categories', { name: 'Cronograma' })).json<{ category: { id: string } }>().category.id;
    // the schedule anchors on the travel start date, so the category form must enable it
    expect((await f.app.inject({ method: 'PUT', url: `/categories/${category}/form`, headers: f.headers(admin), payload: { fields: [{ field_key: 'travel_start_date', enabled: true, required: false }] } })).statusCode).toBe(200);
    account = (await call(admin, 'POST', '/financial-accounts', { name: 'Caixa', type: 'CASH' })).json<{ account: { id: string } }>().account.id;
    methodId = (await call(admin, 'POST', '/payment-methods', { name: 'PIX', requires_receipt: true })).json<{ paymentMethod: { id: string } }>().paymentMethod.id;
  });
  afterAll(async () => { await f?.close(); });

  it('keeps legacy installments until an explicit schedule; confirms a draft without duplicate obligations', async () => {
    const { id, applied } = await prepare();
    expect(applied.statusCode).toBe(201);
    expect((await call(manager, 'POST', `/sales/${id}/confirm`)).statusCode).toBe(200);
    expect((await balance(id)).receivables.map((r) => r.amount)).toEqual([300, 700]);
    const commissions = await f.adminPool.query<{ release_mode: string }>('SELECT release_mode FROM seller_commissions WHERE sale_id=$1', [id]);
    expect(commissions.rows[0]?.release_mode).toBe('ON_RECEIPT');
  });
  it('reuses one unpaid legacy receivable but refuses to replace multiple legacy installments', async () => {
    expect((await prepare({}, true)).applied.statusCode).toBe(201);
    const { id, applied } = await prepare({}, true, 2);
    expect(applied.statusCode).toBe(409);
    expect((await balance(id)).receivables.map((r) => r.amount)).toEqual([500, 500]);
  });
  it('creates ten actual installments of 100 with minimum 100', async () => {
    const { id, applied } = await prepare({ scheduleKind: 'EQUAL_INSTALLMENTS', downPaymentMode: 'NONE',
      downPaymentValue: 0, downPaymentRequired: false, minInstallmentAmount: 100 }, false, 10);
    expect(applied.statusCode).toBe(201);
    expect((await balance(id)).receivables.map((r) => r.amount)).toEqual(Array(10).fill(100));
  });
  it('entry 300, then balance 700 paid in 300 and 400; one ledger entry per payment', async () => {
    const { id } = await prepare({}, true);
    expect((await pay(id, payment(300))).statusCode).toBe(201);
    expect(await balance(id)).toMatchObject({ remaining: 700, down_payment_pending: false });
    expect((await pay(id, payment(300))).statusCode).toBe(201);
    expect(await balance(id)).toMatchObject({ received: 600, remaining: 400, status: 'PARTIALLY_PAID' });
    expect((await pay(id, payment(400))).statusCode).toBe(201);
    expect(await balance(id)).toMatchObject({ received: 1000, remaining: 0, status: 'PAID', settled_at: '2028-12-05T03:00:00.000Z' });
    const ledger = await f.adminPool.query<{ total: string; n: number }>('SELECT sum(amount)::text AS total,count(*)::int AS n FROM financial_transactions WHERE sale_id=$1', [id]);
    expect(ledger.rows[0]).toMatchObject({ total: '1000.00', n: 3 });
  });
  it('replays historical responses, rejects changed payload and excess, serializes concurrent requests', async () => {
    const { id } = await prepare({}, true);
    const input = payment(300);
    const responses = await Promise.all([pay(id, input), pay(id, input)]);
    expect(responses.map((r) => r.statusCode)).toEqual([201, 201]);
    expect(responses[0]?.json()).toEqual(responses[1]?.json());
    expect((await pay(id, { ...input, amount: 301 })).statusCode).toBe(409);
    expect((await pay(id, payment(701))).statusCode).toBe(422);
    const racing = await Promise.all([pay(id, payment(500)), pay(id, payment(500))]);
    expect(racing.map((r) => r.statusCode).sort()).toEqual([201, 422]);
    expect((await pay(id, input)).json()).toEqual(responses[0]?.json());
    expect((await balance(id)).remaining).toBe(200);
  });
  it('requires scope, finance permission, administrator revision, reason and trusted server values', async () => {
    const { id } = await prepare({}, true);
    expect((await call(other, 'GET', `/sales/${id}/balance`)).statusCode).toBe(404);
    expect((await call(manager, 'POST', `/sales/${id}/payment-schedule/revise`, { reason: 'Reancorar' })).statusCode).toBe(403);
    expect((await call(admin, 'POST', `/sales/${id}/payment-schedule/revise`, { reason: ' ' })).statusCode).toBe(400);
    expect((await pay(id, { ...payment(1), tenant_id: f.tenantB })).statusCode).toBe(400);
    const viewer = await f.login('tenant-a', 'viewer@a.test');
    expect((await call(viewer, 'POST', `/sales/${id}/payments`, payment(1))).statusCode).toBe(403);
    expect((await f.app.inject({ method: 'GET', url: `/sales/${id}/balance` })).statusCode).toBe(401);
    expect((await call(admin, 'PATCH', `/sales/${id}`, { category_id: randomUUID() })).statusCode).toBe(409);
  });
  it('blocks legacy receipt and preserves partially paid due dates in revision', async () => {
    const { id } = await prepare({}, true);
    expect((await pay(id, payment(350))).statusCode).toBe(201);
    const old = await balance(id);
    const receipt = old.receivables[1]!;
    expect((await call(admin, 'POST', `/receivables/${receipt.id}/receive`, { account_id: account })).statusCode).toBe(409);
    await f.adminPool.query('UPDATE sales SET travel_start_date=$2 WHERE id=$1', [id, '2029-01-20']);
    expect((await call(admin, 'POST', `/sales/${id}/payment-schedule/revise`, { reason: 'Nova viagem' })).statusCode).toBe(200);
    expect((await balance(id)).receivables).toEqual(old.receivables);
    expect((await balance(id)).snapshot?.version).toBe(2);
  });
  it('forces tenant RLS, grants runtime access and rejects cross-tenant FKs and snapshot mutation', async () => {
    const { id } = await prepare();
    const tables = ['payment_conditions', 'payment_condition_methods', 'payment_condition_categories',
      'payment_condition_products', 'sale_payment_condition_versions', 'sale_payment_requests'];
    const result = await f.adminPool.query<{ relforcerowsecurity: boolean; readable: boolean }>(
      `SELECT relforcerowsecurity,has_table_privilege('travel_lite_runtime',oid,'SELECT') AS readable FROM pg_class WHERE relname=ANY($1)`, [tables]);
    expect(result.rows).toHaveLength(6);
    expect(result.rows.every((r) => r.relforcerowsecurity && r.readable)).toBe(true);
    expect((await f.database.runAsTenant(f.tenantB, f.adminB, (c) => c.query('SELECT * FROM payment_conditions'))).rowCount).toBe(0);
    const foreign = await f.adminPool.query<{ id: string }>('INSERT INTO sale_categories(tenant_id,name) VALUES($1,$2) RETURNING id', [f.tenantB, 'Foreign']);
    const conditionId = (await balance(id)).snapshot!.condition.id;
    await expect(f.database.runAsTenant(f.tenantA, f.adminA, (c) => c.query(
      'INSERT INTO payment_condition_categories(tenant_id,condition_id,category_id) VALUES($1,$2,$3)',
      [f.tenantA, conditionId, foreign.rows[0]!.id]))).rejects.toThrow();
    await expect(f.adminPool.query(`UPDATE sale_payment_condition_versions SET reason='changed' WHERE sale_id=$1`, [id])).rejects.toThrow();
    await expect(f.adminPool.query('UPDATE sales SET payment_condition_snapshot=NULL WHERE id=$1', [id])).rejects.toThrow();
  });
  it('rolls back money, ledger and idempotency if required audit fails; permits retry', async () => {
    const { id } = await prepare({}, true);
    const input = payment(300);
    await f.adminPool.query(`CREATE FUNCTION reject_schedule_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.event_type='SALE_PAYMENT_RECORDED' THEN RAISE EXCEPTION 'audit rejected'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_schedule_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_schedule_audit()`);
    try {
      expect((await pay(id, input)).statusCode).toBe(500);
      expect((await balance(id)).received).toBe(0);
      expect((await f.adminPool.query('SELECT 1 FROM sale_payment_requests WHERE sale_id=$1', [id])).rowCount).toBe(0);
      expect((await f.adminPool.query('SELECT 1 FROM financial_transactions WHERE sale_id=$1', [id])).rowCount).toBe(0);
    } finally {
      await f.adminPool.query('DROP TRIGGER reject_schedule_audit ON audit_logs; DROP FUNCTION reject_schedule_audit()');
    }
    expect((await pay(id, input)).statusCode).toBe(201);
  });

  it('reverses all receivable allocations of a scheduled payment when no revenue was received', async () => {
    const { id } = await prepare({}, true);
    const result = await pay(id, payment(350));
    expect(result.statusCode).toBe(201);
    const reversed = await call(admin, 'POST', `/payments/${result.json<{ paymentId: string }>().paymentId}/reverse`, { reason: 'Estorno permitido' });
    expect(reversed.statusCode).toBe(201);
    const after = await balance(id);
    expect(after).toMatchObject({ received: 0, remaining: 1000, settled_at: null });
    expect(after.receivables.every((r) => r.paid === 0)).toBe(true);
  });

});
