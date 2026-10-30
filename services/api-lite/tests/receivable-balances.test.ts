/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- JSON fixtures */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

describe('Lite open receivable balances (parity with the Full receivable-sql)', () => {
  let f: LiteFixture;
  let admin: string;
  let saleId: string;

  async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) {
    const res = await f.app.inject({ method, url, headers: f.headers(admin), ...(payload ? { payload } : {}) });
    return { status: res.statusCode, body: res.json<Record<string, any>>() };
  }

  beforeAll(async () => {
    f = await createLiteFixture();
    admin = await f.login('tenant-a', 'admin@a.test');
    const customer = (await call('POST', '/customers', { name: 'Saldo' })).body.customer.id as string;
    const seller = (await call('POST', '/sellers', { name: 'Saldo', commission_rule_type: 'PERCENTAGE_ON_GROSS', commission_rate: 1 })).body.seller.id as string;
    const category = (await call('POST', '/categories', { name: 'Saldo' })).body.category.id as string;
    const created = await call('POST', '/sales', { customer_id: customer, seller_id: seller, category_id: category, gross_amount: 1000, due_date: '2030-01-31' });
    saleId = created.body.sale.id as string;
    expect((await call('POST', `/sales/${saleId}/confirm`)).status).toBe(200);
  });
  afterAll(async () => { await f?.close(); });

  it('dashboard "receivable" counts only what is still open of a partially paid receivable', async () => {
    const receivable = (await f.adminPool.query<{ id: string }>('SELECT id FROM receivables WHERE sale_id = $1', [saleId])).rows[0]!.id;
    const account = (await call('POST', '/financial-accounts', { name: 'Caixa', type: 'CASH' })).body.account.id as string;
    const received = await call('POST', `/receivables/${receivable}/receive`, { amount: 400, account_id: account });
    expect(received.status).toBe(200);
    const dashboard = await call('GET', '/dashboard');
    const widget = (dashboard.body.widgets as Array<{ key: string; data: { value: number } }>).find((w) => w.key === 'receivable');
    expect(widget?.data.value).toBe(600);
    const list = await call('GET', '/receivables');
    expect(list.body.items[0].remaining_amount).toBe(600);
  });

  it('overdue filter uses the Sao Paulo civil date, not the database session time zone', async () => {
    await f.adminPool.query(`ALTER ROLE travel_lite_runtime SET timezone = 'Pacific/Kiritimati'`);
    try {
      const today = (await f.adminPool.query<{ d: string }>(`SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS d`)).rows[0]!.d;
      await f.adminPool.query(`UPDATE receivables SET due_at = $1::date WHERE sale_id = $2`, [today, saleId]);
      const overdue = await call('GET', '/receivables?overdue=true');
      expect(overdue.body.items).toHaveLength(0);
      await f.adminPool.query(`UPDATE receivables SET due_at = ($1::date - 1) WHERE sale_id = $2`, [today, saleId]);
      expect((await call('GET', '/receivables?overdue=true')).body.items).toHaveLength(1);
    } finally {
      await f.adminPool.query(`ALTER ROLE travel_lite_runtime RESET timezone`);
    }
  });
});
