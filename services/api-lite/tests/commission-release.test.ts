import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

interface CommissionJson {
  id: string;
  sale_id: string;
  status: string;
  commission_amount: number | null;
  release_mode: string;
  released_amount: number | null;
  payable_status: string | null;
}

describe('Travel Lite commission release by payment method', () => {
  let lite: LiteFixture;
  let managerToken: string;
  let staffToken: string;
  let customerId: string;
  let categoryId: string;
  let accountId: string;
  let installmentMethod: string;
  let cashMethod: string;
  let todayDate: string;

  async function call<T>(token: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) {
    const response = await lite.app.inject({ method, url, headers: lite.headers(token), ...(payload === undefined ? {} : { payload: payload as object }) });
    return { status: response.statusCode, json: response.json<T>() };
  }

  async function newSeller(name: string, rule: Record<string, unknown>): Promise<string> {
    const seller = await call<{ seller: { id: string } }>(staffToken, 'POST', '/sellers', { name });
    const sellerId = seller.json.seller.id;
    const created = await call(managerToken, 'POST', '/commission-rules', {
      name: `Regra ${name}`, seller_id: sellerId, effective_from: todayDate, ...rule,
    });
    expect(created.status).toBe(201);
    return sellerId;
  }

  async function sellAndApprove(sellerId: string, gross: number, methodId: string | null, installments = 10) {
    const created = await call<{ sale: { id: string } }>(staffToken, 'POST', '/sales', {
      customer_id: customerId,
      seller_id: sellerId,
      category_id: categoryId,
      gross_amount: gross,
      cost_amount: 0,
      due_date: '2027-12-15',
      installment_count: installments,
      ...(methodId ? { payment_method_id: methodId } : {}),
    });
    expect(created.status).toBe(201);
    const saleId = created.json.sale.id;
    expect((await call(staffToken, 'POST', `/sales/${saleId}/confirm`)).status).toBe(200);
    const commission = await lite.adminPool.query<{ id: string }>(`SELECT id FROM seller_commissions WHERE sale_id = $1`, [saleId]);
    const commissionId = commission.rows[0]!.id;
    expect((await call(managerToken, 'POST', `/commissions/${commissionId}/approve`, {})).status).toBe(200);
    const payable = await lite.adminPool.query<{ id: string }>(`SELECT id FROM payables WHERE commission_id = $1`, [commissionId]);
    return { saleId, commissionId, payableId: payable.rows[0]!.id };
  }

  async function receiveInstallments(saleId: string, count: number): Promise<void> {
    const receivables = await lite.adminPool.query<{ id: string }>(
      `SELECT id FROM receivables WHERE sale_id = $1 AND status <> 'CANCELLED' AND paid_amount = 0 ORDER BY installment_number LIMIT $2`,
      [saleId, count],
    );
    for (const row of receivables.rows) {
      const received = await call(managerToken, 'POST', `/receivables/${row.id}/receive`, { account_id: accountId });
      expect(received.status).toBe(200);
    }
  }

  const payCommission = (payableId: string, amount?: number) =>
    call<{ error?: string }>(managerToken, 'POST', `/payables/${payableId}/pay`, { account_id: accountId, ...(amount === undefined ? {} : { amount }) });

  async function commissionRow(saleId: string): Promise<CommissionJson> {
    const list = await call<{ items: CommissionJson[] }>(managerToken, 'GET', '/commissions?pageSize=100');
    return list.json.items.find((c) => c.sale_id === saleId)!;
  }

  beforeAll(async () => {
    lite = await createLiteFixture();
    managerToken = await lite.login('tenant-a', 'admin@a.test');
    staffToken = await lite.login('tenant-a', 'staff@a.test');
    todayDate = (await lite.adminPool.query<{ d: string }>(`SELECT current_date::text AS d`)).rows[0]!.d;

    customerId = (await call<{ customer: { id: string } }>(staffToken, 'POST', '/customers', { name: 'Cliente Liberação', email: 'lib@cliente.test' })).json.customer.id;
    categoryId = (await call<{ category: { id: string } }>(managerToken, 'POST', '/categories', { name: 'LIBERACAO' })).json.category.id;
    accountId = (await call<{ account: { id: string } }>(managerToken, 'POST', '/financial-accounts', { name: 'Caixa', type: 'CASH' })).json.account.id;
    installmentMethod = (
      await call<{ paymentMethod: { id: string } }>(managerToken, 'POST', '/payment-methods', { name: 'Cartão parcelado', requires_receipt: true })
    ).json.paymentMethod.id;
    cashMethod = (await call<{ paymentMethod: { id: string } }>(managerToken, 'POST', '/payment-methods', { name: 'Pix à vista', requires_receipt: false })).json.paymentMethod.id;
  });

  afterAll(async () => {
    await lite?.close();
  });

  it('stores the receipt requirement on the payment method', async () => {
    const list = await call<{ items: Array<{ id: string; requires_receipt: boolean }> }>(managerToken, 'GET', '/payment-methods');
    expect(list.json.items.find((m) => m.id === installmentMethod)?.requires_receipt).toBe(true);
    expect(list.json.items.find((m) => m.id === cashMethod)?.requires_receipt).toBe(false);

    expect((await call(managerToken, 'POST', '/payment-methods', { name: 'Inválida', requires_receipt: 'sim' })).status).toBe(400);
    expect((await call(managerToken, 'PATCH', `/payment-methods/${cashMethod}`, { requires_receipt: 1 })).status).toBe(400);
  });

  it('without the receipt rule the commission is paid directly on the whole sale', async () => {
    const sellerId = await newSeller('Vendedor Direto', { mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 10 });
    const { saleId, payableId } = await sellAndApprove(sellerId, 50000, cashMethod);

    const row = await commissionRow(saleId);
    expect(row).toMatchObject({ release_mode: 'ON_SALE', commission_amount: 5000, released_amount: 5000 });

    expect((await payCommission(payableId)).status).toBe(200);
    expect((await commissionRow(saleId)).status).toBe('PAID');
  });

  it('with the receipt rule the commission follows the installments received', async () => {
    const sellerId = await newSeller('Vendedor Parcelado', { mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 10 });
    const { saleId, payableId } = await sellAndApprove(sellerId, 50000, installmentMethod);

    expect(await commissionRow(saleId)).toMatchObject({ release_mode: 'ON_RECEIPT', commission_amount: 5000, released_amount: 0 });
    const early = await payCommission(payableId);
    expect(early.status).toBe(409);

    await receiveInstallments(saleId, 1);
    expect((await commissionRow(saleId)).released_amount).toBe(500);
    expect((await payCommission(payableId)).status).toBe(200);
    expect(await commissionRow(saleId)).toMatchObject({ status: 'APPROVED', payable_status: 'PARTIALLY_PAID' });
    expect((await payCommission(payableId)).status).toBe(409);

    await receiveInstallments(saleId, 2);
    const over = await payCommission(payableId, 1500);
    expect(over.status).toBe(400);
    expect((await payCommission(payableId, 1000)).status).toBe(200);

    await receiveInstallments(saleId, 7);
    expect((await commissionRow(saleId)).released_amount).toBe(5000);
    expect((await payCommission(payableId)).status).toBe(200);
    expect(await commissionRow(saleId)).toMatchObject({ status: 'PAID', payable_status: 'PAID' });
  });

  it('counts the whole sale for the goal, not the installments', async () => {
    const sellerId = await newSeller('Vendedor Meta', {
      mode: 'PERCENTAGE', calculation_base: 'GROSS', progressive: true,
      tiers: [
        { from_amount: 0, to_amount: 20000, rate: 3 },
        { from_amount: 20000, to_amount: null, rate: 4 },
      ],
    });
    const { saleId } = await sellAndApprove(sellerId, 50000, installmentMethod);
    // 20.000 @ 3% + 30.000 @ 4%, decided at confirmation even though nothing was received yet.
    expect(await commissionRow(saleId)).toMatchObject({ commission_amount: 1800, released_amount: 0 });

    const next = await sellAndApprove(sellerId, 10000, installmentMethod);
    // The 50.000 already count: the new sale is entirely in the 4% tier.
    expect((await commissionRow(next.saleId)).commission_amount).toBe(400);
  });

  it('keeps the release policy frozen at confirmation', async () => {
    const sellerId = await newSeller('Vendedor Congelado', { mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 10 });
    const { saleId } = await sellAndApprove(sellerId, 1000, installmentMethod, 2);
    expect((await call(managerToken, 'PATCH', `/payment-methods/${installmentMethod}`, { requires_receipt: false })).status).toBe(200);
    expect((await commissionRow(saleId)).release_mode).toBe('ON_RECEIPT');
    await call(managerToken, 'PATCH', `/payment-methods/${installmentMethod}`, { requires_receipt: true });
  });

  it('lowers the released amount again when a receipt is reversed', async () => {
    const sellerId = await newSeller('Vendedor Estorno', { mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 10 });
    const { saleId } = await sellAndApprove(sellerId, 1000, installmentMethod, 2);
    await receiveInstallments(saleId, 2);
    expect((await commissionRow(saleId)).released_amount).toBe(100);

    const payment = await lite.adminPool.query<{ id: string }>(
      `SELECT p.id FROM payments p JOIN payment_allocations a ON a.payment_id = p.id JOIN receivables r ON r.id = a.receivable_id
        WHERE r.sale_id = $1 AND p.direction = 'IN' ORDER BY p.created_at LIMIT 1`,
      [saleId],
    );
    expect((await call(managerToken, 'POST', `/payments/${payment.rows[0]!.id}/reverse`, { reason: 'cartão estornado' })).status).toBe(201);
    expect((await commissionRow(saleId)).released_amount).toBe(50);
  });
});
