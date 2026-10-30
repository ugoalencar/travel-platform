import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commissionReleaseLockKey } from '../src/finance';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

/**
 * Codex re-evaluation: paying a commission and reversing one of the sale's receipts must serialize.
 * Both paths take the same per-sale advisory lock first, so either the payment is made first (and the
 * reversal is then refused) or the reversal comes first (and the payment is limited to what is left).
 */
describe('commission payment x receipt reversal concurrency', () => {
  let lite: LiteFixture;
  let managerToken: string;
  let staffToken: string;
  let customerId: string;
  let categoryId: string;
  let accountId: string;
  let cardMethod: string;
  let sellerId: string;
  let todayDate: string;

  async function call<T = Record<string, unknown>>(token: string, method: 'GET' | 'POST', url: string, payload?: unknown) {
    const response = await lite.app.inject({
      method,
      url,
      headers: lite.headers(token),
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return { status: response.statusCode, json: response.json<T>() };
  }

  /** ON_RECEIPT sale of 1.000 in two installments, both received, commission (10%) approved. */
  async function releasedSale() {
    const created = await call<{ sale: { id: string } }>(staffToken, 'POST', '/sales', {
      customer_id: customerId, seller_id: sellerId, category_id: categoryId, gross_amount: 1000, cost_amount: 0,
      due_date: '2027-12-15', installment_count: 2, payment_method_id: cardMethod,
    });
    const saleId = created.json.sale.id;
    expect((await call(staffToken, 'POST', `/sales/${saleId}/confirm`)).status).toBe(200);
    const commissionId = (await lite.adminPool.query<{ id: string }>(`SELECT id FROM seller_commissions WHERE sale_id = $1`, [saleId])).rows[0]!.id;
    expect((await call(managerToken, 'POST', `/commissions/${commissionId}/approve`, {})).status).toBe(200);
    const payableId = (await lite.adminPool.query<{ id: string }>(`SELECT id FROM payables WHERE commission_id = $1`, [commissionId])).rows[0]!.id;
    const receivables = await lite.adminPool.query<{ id: string }>(`SELECT id FROM receivables WHERE sale_id = $1 ORDER BY installment_number`, [saleId]);
    for (const row of receivables.rows) {
      expect((await call(managerToken, 'POST', `/receivables/${row.id}/receive`, { account_id: accountId })).status).toBe(200);
    }
    const payment = (await lite.adminPool.query<{ id: string }>(
      `SELECT p.id FROM payments p JOIN payment_allocations a ON a.payment_id = p.id
        WHERE a.receivable_id = $1 AND p.direction = 'IN'`,
      [receivables.rows[0]!.id],
    )).rows[0]!.id;
    const tenantId = (await lite.adminPool.query<{ tenant_id: string }>(`SELECT tenant_id FROM sales WHERE id = $1`, [saleId])).rows[0]!.tenant_id;
    return { saleId, commissionId, payableId, receiptPaymentId: payment, tenantId };
  }

  const pay = (payableId: string) => call<{ error?: string }>(managerToken, 'POST', `/payables/${payableId}/pay`, { account_id: accountId });
  const reverse = (paymentId: string) => call<{ error?: string }>(managerToken, 'POST', `/payments/${paymentId}/reverse`, { reason: 'cartão estornado' });

  /**
   * Holds the per-sale release lock in a separate transaction, starts `request`, checks it is still waiting
   * (not answered while the lock is held), then releases the lock and returns the request's response.
   */
  async function whileLockHeld<T>(tenantId: string, saleId: string, start: () => Promise<T>): Promise<{ waited: boolean; response: T }> {
    const holder: PoolClient = await lite.adminPool.connect();
    let request: Promise<T> | undefined;
    let waited = false;
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))', [commissionReleaseLockKey(tenantId, saleId)]);
      request = start();
      const marker = Symbol('pending');
      const winner = await Promise.race([request, new Promise((resolve) => setTimeout(() => resolve(marker), 700))]);
      waited = winner === marker;
    } finally {
      await holder.query('COMMIT').catch(() => undefined);
      holder.release();
    }
    return { waited, response: await request };
  }

  beforeAll(async () => {
    lite = await createLiteFixture();
    managerToken = await lite.login('tenant-a', 'admin@a.test');
    staffToken = await lite.login('tenant-a', 'staff@a.test');
    todayDate = (await lite.adminPool.query<{ d: string }>(`SELECT current_date::text AS d`)).rows[0]!.d;
    customerId = (await call<{ customer: { id: string } }>(staffToken, 'POST', '/customers', { name: 'Cliente Concorrência', email: 'conc@cliente.test' })).json.customer.id;
    categoryId = (await call<{ category: { id: string } }>(managerToken, 'POST', '/categories', { name: 'CONC' })).json.category.id;
    accountId = (await call<{ account: { id: string } }>(managerToken, 'POST', '/financial-accounts', { name: 'Caixa', type: 'CASH' })).json.account.id;
    cardMethod = (await call<{ paymentMethod: { id: string } }>(managerToken, 'POST', '/payment-methods', { name: 'Cartão', requires_receipt: true })).json.paymentMethod.id;
    sellerId = (await call<{ seller: { id: string } }>(staffToken, 'POST', '/sellers', { name: 'Vendedor Concorrente' })).json.seller.id;
    expect((await call(managerToken, 'POST', '/commission-rules', {
      name: 'Regra', seller_id: sellerId, mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 10, effective_from: todayDate,
    })).status).toBe(201);
  });

  afterAll(async () => {
    await lite?.close();
  });

  it('the commission payment waits for the per-sale release lock', async () => {
    const sale = await releasedSale();
    const { waited, response } = await whileLockHeld(sale.tenantId, sale.saleId, () => pay(sale.payableId));
    expect(waited).toBe(true);
    expect(response.status).toBe(200);
    const paid = await lite.adminPool.query<{ paid_amount: string }>(`SELECT paid_amount FROM payables WHERE id = $1`, [sale.payableId]);
    expect(paid.rows[0]?.paid_amount).toBe('100.00');
  });

  it('the receipt reversal waits for the same lock, and is refused once the commission was paid', async () => {
    const sale = await releasedSale();
    expect((await pay(sale.payableId)).status).toBe(200);
    const { waited, response } = await whileLockHeld(sale.tenantId, sale.saleId, () => reverse(sale.receiptPaymentId));
    expect(waited).toBe(true);
    expect(response.status).toBe(409);
    const reversals = await lite.adminPool.query(`SELECT 1 FROM payments WHERE reversal_of_payment_id = $1`, [sale.receiptPaymentId]);
    expect(reversals.rowCount).toBe(0);
  });

  it('concurrent payment and reversal never leave the commission paid above what is released', async () => {
    const outcomes: string[] = [];
    for (let round = 0; round < 6; round += 1) {
      const sale = await releasedSale();
      const [paying, reversing] = await Promise.all([pay(sale.payableId), reverse(sale.receiptPaymentId)]);
      expect([200, 409]).toContain(paying.status);
      expect([201, 409]).toContain(reversing.status);

      const state = await lite.adminPool.query<{ paid: string; released: string }>(
        `SELECT p.paid_amount::text AS paid,
                round(sc.commission_amount * LEAST(COALESCE(sum(r.paid_amount) / NULLIF(sum(r.amount), 0), 0), 1), 2)::text AS released
           FROM payables p
           JOIN seller_commissions sc ON sc.id = p.commission_id
           LEFT JOIN receivables r ON r.sale_id = sc.sale_id AND r.status <> 'CANCELLED'
          WHERE p.id = $1 GROUP BY p.id, sc.id`,
        [sale.payableId],
      );
      expect(Number(state.rows[0]!.paid)).toBeLessThanOrEqual(Number(state.rows[0]!.released));
      outcomes.push(`${paying.status}/${reversing.status}`);
    }
    // Whatever the interleaving, each round ended in one of the two consistent outcomes.
    for (const outcome of outcomes) expect(['200/409', '200/201', '409/201']).toContain(outcome);
  });
});
