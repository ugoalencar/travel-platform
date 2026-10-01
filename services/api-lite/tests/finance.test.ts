import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

interface ReceivableJson {
  id: string;
  sale_id: string;
  installment_number: number | null;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  due_at: string;
  status: string;
  customer_name: string | null;
  sale_number: string | null;
}

interface PageJson<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

interface SaleDetailJson {
  sale: { id: string; status: string };
  receivables: Array<{ id: string; amount: number; paid_amount: number; status: string }>;
}

interface AccountJson {
  id: string;
  name: string;
  type: string;
  initial_balance: number;
}

describe('Travel Lite financial catalog and cash flow', () => {
  let lite: LiteFixture;
  let operatorToken: string;
  let viewerToken: string;
  let foreignToken: string;
  let managerToken: string;
  let foreignManagerToken: string;
  let accountId: string;
  let inboundCategoryId: string;
  let outboundCategoryId: string;
  let sellerId: string;
  let categoryId: string;

  beforeAll(async () => {
    lite = await createLiteFixture();
    operatorToken = await lite.login('tenant-a', 'operator@a.test');
    viewerToken = await lite.login('tenant-a', 'viewer@a.test');
    foreignToken = await lite.login('tenant-b', 'operator@b.test');
    managerToken = await lite.login('tenant-a', 'admin@a.test');
    foreignManagerToken = await lite.login('tenant-b', 'admin@b.test');

    const account = await lite.app.inject({
      method: 'POST',
      url: '/financial-accounts',
      headers: lite.headers(operatorToken),
      payload: { name: 'Conta Banco A', type: 'BANK', initial_balance: 100 },
    });
    expect(account.statusCode).toBe(201);
    accountId = account.json<{ account: AccountJson }>().account.id;

    const inbound = await lite.app.inject({
      method: 'POST',
      url: '/financial-categories',
      headers: lite.headers(operatorToken),
      payload: { name: 'Recebimento de Venda', direction: 'IN' },
    });
    inboundCategoryId = inbound.json<{ category: { id: string } }>().category.id;

    const outbound = await lite.app.inject({
      method: 'POST',
      url: '/financial-categories',
      headers: lite.headers(operatorToken),
      payload: { name: 'Despesa Operacional', direction: 'OUT' },
    });
    outboundCategoryId = outbound.json<{ category: { id: string } }>().category.id;

    const seller = await lite.app.inject({
      method: 'POST',
      url: '/sellers',
      headers: lite.headers(operatorToken),
      payload: {
        name: 'Vendedor Financeiro',
        commission_rule_type: 'PERCENTAGE_ON_GROSS',
        commission_rate: 10,
      },
    });
    sellerId = seller.json<{ seller: { id: string } }>().seller.id;

    const category = await lite.app.inject({
      method: 'POST',
      url: '/categories',
      headers: lite.headers(operatorToken),
      payload: { name: 'PACOTE' },
    });
    categoryId = category.json<{ category: { id: string } }>().category.id;
  });

  afterAll(async () => {
    await lite?.close();
  });

  async function createCustomer(name: string): Promise<string> {
    const response = await lite.app.inject({
      method: 'POST',
      url: '/customers',
      headers: lite.headers(operatorToken),
      payload: { name, email: `${name.replace(/\s+/g, '.').toLowerCase()}@fin.test` },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ customer: { id: string } }>().customer.id;
  }

  async function createConfirmedSale(
    customerId: string,
    installmentCount: number,
  ): Promise<SaleDetailJson> {
    const created = await lite.app.inject({
      method: 'POST',
      url: '/sales',
      headers: lite.headers(operatorToken),
      payload: {
        customer_id: customerId,
        seller_id: sellerId,
        category_id: categoryId,
        gross_amount: 1000,
        cost_amount: 800,
        due_date: '2026-10-15',
        installment_count: installmentCount,
      },
    });
    expect(created.statusCode).toBe(201);
    const saleId = created.json<{ sale: { id: string } }>().sale.id;

    const confirm = await lite.app.inject({
      method: 'POST',
      url: `/sales/${saleId}/confirm`,
      headers: lite.headers(operatorToken),
    });
    expect(confirm.statusCode).toBe(200);

    const detail = await lite.app.inject({
      method: 'GET',
      url: `/sales/${saleId}`,
      headers: lite.headers(operatorToken),
    });
    expect(detail.statusCode).toBe(200);
    return detail.json<SaleDetailJson>();
  }

  it('creates and validates the financial catalog', async () => {
    const duplicate = await lite.app.inject({
      method: 'POST',
      url: '/financial-accounts',
      headers: lite.headers(operatorToken),
      payload: { name: 'Conta Banco A', type: 'BANK' },
    });
    expect(duplicate.statusCode).toBe(409);

    const badType = await lite.app.inject({
      method: 'POST',
      url: '/financial-accounts',
      headers: lite.headers(operatorToken),
      payload: { name: 'Conta Invalida', type: 'CRYPTO' },
    });
    expect(badType.statusCode).toBe(400);

    const renamed = await lite.app.inject({
      method: 'PATCH',
      url: `/financial-accounts/${accountId}`,
      headers: lite.headers(operatorToken),
      payload: { name: 'Conta Banco A (renomeada)' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json<{ account: { name: string } }>().account.name).toBe(
      'Conta Banco A (renomeada)',
    );

    const accounts = await lite.app.inject({
      method: 'GET',
      url: '/financial-accounts',
      headers: lite.headers(operatorToken),
    });
    const accountItems = accounts.json<{ items: AccountJson[] }>().items;
    expect(accountItems.some((a) => a.id === accountId)).toBe(true);
    expect(accountItems[0]?.initial_balance).toBe(100);

    const badDirection = await lite.app.inject({
      method: 'POST',
      url: '/financial-categories',
      headers: lite.headers(operatorToken),
      payload: { name: 'Categoria Invalida', direction: 'SIDEWAYS' },
    });
    expect(badDirection.statusCode).toBe(400);

    const missingDirection = await lite.app.inject({
      method: 'POST',
      url: '/financial-categories',
      headers: lite.headers(operatorToken),
      payload: { name: 'Sem Direcao' },
    });
    expect(missingDirection.statusCode).toBe(400);

    const method = await lite.app.inject({
      method: 'POST',
      url: '/payment-methods',
      headers: lite.headers(operatorToken),
      payload: { name: 'PIX', sort_order: 1 },
    });
    expect(method.statusCode).toBe(201);

    const badSort = await lite.app.inject({
      method: 'POST',
      url: '/payment-methods',
      headers: lite.headers(operatorToken),
      payload: { name: 'Ordem Invalida', sort_order: -1 },
    });
    expect(badSort.statusCode).toBe(400);

    const viewerCreate = await lite.app.inject({
      method: 'POST',
      url: '/financial-accounts',
      headers: lite.headers(viewerToken),
      payload: { name: 'Conta Viewer', type: 'CASH' },
    });
    expect(viewerCreate.statusCode).toBe(403);

    const anonymous = await lite.app.inject({ method: 'GET', url: '/financial-accounts' });
    expect(anonymous.statusCode).toBe(401);

    const foreign = await lite.app.inject({
      method: 'GET',
      url: '/financial-accounts',
      headers: lite.headers(foreignToken),
    });
    const foreignItems = foreign.json<{ items: AccountJson[] }>().items;
    expect(foreignItems.some((a) => a.id === accountId)).toBe(false);

    const outbox = await lite.adminPool.query<{ event_type: string }>(
      `SELECT event_type FROM integration_outbox WHERE entity_id = $1 ORDER BY created_at`,
      [accountId],
    );
    expect(outbox.rows.map((r) => r.event_type)).toEqual([
      'ACCOUNT_CREATED',
      'ACCOUNT_UPDATED',
    ]);
  });

  it('receives installments through the sale until it is fully paid', async () => {
    const customerId = await createCustomer('Cliente Recebimento');
    const detail = await createConfirmedSale(customerId, 2);
    expect(detail.sale.status).toBe('CONFIRMED');
    expect(detail.receivables).toHaveLength(2);

    const first = detail.receivables[0]!;
    const second = detail.receivables[1]!;

    const list = await lite.app.inject({
      method: 'GET',
      url: `/receivables?customer_id=${customerId}`,
      headers: lite.headers(operatorToken),
    });
    expect(list.statusCode).toBe(200);
    const page = list.json<PageJson<ReceivableJson>>();
    expect(page.total).toBe(2);
    expect(page.items.every((r) => r.status === 'OPEN')).toBe(true);
    expect(page.items[0]?.remaining_amount).toBe(page.items[0]?.amount);
    expect(page.items[0]?.sale_number).toBe('VENDA-000001');
    expect(page.items[0]?.customer_name).toBe('Cliente Recebimento');

    const partial = await lite.app.inject({
      method: 'POST',
      url: `/receivables/${first.id}/receive`,
      headers: lite.headers(operatorToken),
      payload: { account_id: accountId, category_id: inboundCategoryId, amount: 100 },
    });
    expect(partial.statusCode).toBe(200);

    const afterPartial = await lite.app.inject({
      method: 'GET',
      url: `/receivables?customer_id=${customerId}`,
      headers: lite.headers(operatorToken),
    });
    const partialItem = afterPartial
      .json<PageJson<ReceivableJson>>()
      .items.find((r) => r.id === first.id);
    expect(partialItem?.status).toBe('PARTIALLY_PAID');
    expect(partialItem?.paid_amount).toBe(100);
    expect(partialItem?.remaining_amount).toBe(400);

    const saleAfterPartial = await lite.app.inject({
      method: 'GET',
      url: `/sales/${detail.sale.id}`,
      headers: lite.headers(operatorToken),
    });
    expect(saleAfterPartial.json<SaleDetailJson>().sale.status).toBe('PARTIALLY_PAID');

    const tooMuch = await lite.app.inject({
      method: 'POST',
      url: `/receivables/${first.id}/receive`,
      headers: lite.headers(operatorToken),
      payload: { account_id: accountId, amount: 99999 },
    });
    expect(tooMuch.statusCode).toBe(400);

    const settle = await lite.app.inject({
      method: 'POST',
      url: `/receivables/${first.id}/receive`,
      headers: lite.headers(operatorToken),
      payload: { account_id: accountId },
    });
    expect(settle.statusCode).toBe(200);

    const doublePay = await lite.app.inject({
      method: 'POST',
      url: `/receivables/${first.id}/receive`,
      headers: lite.headers(operatorToken),
      payload: { account_id: accountId },
    });
    expect(doublePay.statusCode).toBe(409);

    const settleSecond = await lite.app.inject({
      method: 'POST',
      url: `/receivables/${second.id}/receive`,
      headers: lite.headers(operatorToken),
      payload: { account_id: accountId },
    });
    expect(settleSecond.statusCode).toBe(200);

    const finalDetail = await lite.app.inject({
      method: 'GET',
      url: `/sales/${detail.sale.id}`,
      headers: lite.headers(operatorToken),
    });
    const finalJson = finalDetail.json<SaleDetailJson>();
    expect(finalJson.sale.status).toBe('PAID');
    expect(finalJson.receivables.every((r) => r.status === 'PAID')).toBe(true);

    const payments = await lite.app.inject({
      method: 'GET',
      url: '/payments?direction=IN',
      headers: lite.headers(operatorToken),
    });
    const paymentItems = payments.json<
      PageJson<{ direction: string; amount: number; account_name: string | null }>
    >().items;
    expect(paymentItems.length).toBeGreaterThanOrEqual(3);
    expect(paymentItems.every((p) => p.direction === 'IN')).toBe(true);
    expect(paymentItems[0]?.account_name).toBe('Conta Banco A (renomeada)');

    const ledger = await lite.app.inject({
      method: 'GET',
      url: `/financial-transactions?type=IN&account_id=${accountId}`,
      headers: lite.headers(operatorToken),
    });
    const ledgerItems = ledger.json<
      PageJson<{ type: string; amount: number; payment_id: string | null }>
    >().items;
    expect(ledgerItems.length).toBeGreaterThanOrEqual(3);
    expect(ledgerItems.every((t) => t.type === 'IN' && t.payment_id !== null)).toBe(true);

    const audit = await lite.adminPool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM audit_logs WHERE event_type = 'PAYMENT_RECEIVED'`,
    );
    expect(audit.rows[0]?.total).toBeGreaterThanOrEqual(3);

    const outbox = await lite.adminPool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM integration_outbox WHERE event_type = 'PAYMENT_RECEIVED'`,
    );
    expect(outbox.rows[0]?.total).toBeGreaterThanOrEqual(3);
  });

  it('filters receivables by due window and keeps tenants isolated', async () => {
    const customerId = await createCustomer('Cliente Filtro');
    const detail = await createConfirmedSale(customerId, 2);

    const window = await lite.app.inject({
      method: 'GET',
      url: `/receivables?customer_id=${customerId}&from=2026-10-01&to=2026-10-31`,
      headers: lite.headers(operatorToken),
    });
    const windowItems = window.json<PageJson<ReceivableJson>>().items;
    expect(windowItems).toHaveLength(1);
    expect(windowItems[0]?.due_at).toBe('2026-10-15');

    const emptyWindow = await lite.app.inject({
      method: 'GET',
      url: `/receivables?customer_id=${customerId}&from=2027-01-01`,
      headers: lite.headers(operatorToken),
    });
    expect(emptyWindow.json<PageJson<ReceivableJson>>().total).toBe(0);

    const foreignList = await lite.app.inject({
      method: 'GET',
      url: '/receivables',
      headers: lite.headers(foreignToken),
    });
    expect(foreignList.json<PageJson<ReceivableJson>>().total).toBe(0);

    const foreignReceive = await lite.app.inject({
      method: 'POST',
      url: `/receivables/${detail.receivables[0]!.id}/receive`,
      headers: lite.headers(foreignToken),
      payload: { account_id: accountId },
    });
    expect(foreignReceive.statusCode).toBe(404);

    const badFilter = await lite.app.inject({
      method: 'GET',
      url: '/receivables?status=NOT_A_STATUS',
      headers: lite.headers(operatorToken),
    });
    expect(badFilter.statusCode).toBe(400);
  });

  it('creates, pays, and audits payables', async () => {
    const created = await lite.app.inject({
      method: 'POST',
      url: '/payables',
      headers: lite.headers(operatorToken),
      payload: {
        description: 'Hospedagem Fornecedor',
        amount: 250,
        due_at: '2026-10-20',
        category_id: outboundCategoryId,
        supplier_name: 'Hotel Central',
      },
    });
    expect(created.statusCode).toBe(201);
    const payableId = created.json<{ payable: { id: string; status: string } }>().payable.id;
    expect(created.json<{ payable: { status: string } }>().payable.status).toBe('OPEN');

    const badCategory = await lite.app.inject({
      method: 'POST',
      url: '/payables',
      headers: lite.headers(operatorToken),
      payload: {
        description: 'Categoria Invalida',
        amount: 10,
        due_at: '2026-10-20',
        category_id: '00000000-0000-4000-8000-000000000000',
      },
    });
    expect(badCategory.statusCode).toBe(400);

    const list = await lite.app.inject({
      method: 'GET',
      url: '/payables?status=OPEN',
      headers: lite.headers(operatorToken),
    });
    const openItem = list
      .json<PageJson<{ id: string; description: string; category_name: string | null }>>()
      .items.find((p) => p.id === payableId);
    expect(openItem?.description).toBe('Hospedagem Fornecedor');
    expect(openItem?.category_name).toBe('Despesa Operacional');

    const operatorPay = await lite.app.inject({
      method: 'POST',
      url: `/payables/${payableId}/pay`,
      headers: lite.headers(operatorToken),
      payload: { account_id: accountId },
    });
    expect(operatorPay.statusCode).toBe(403);

    const overpay = await lite.app.inject({
      method: 'POST',
      url: `/payables/${payableId}/pay`,
      headers: lite.headers(managerToken),
      payload: { account_id: accountId, amount: 500 },
    });
    expect(overpay.statusCode).toBe(400);

    const pay = await lite.app.inject({
      method: 'POST',
      url: `/payables/${payableId}/pay`,
      headers: lite.headers(managerToken),
      payload: { account_id: accountId, method: 'PIX', reference: 'NF-1' },
    });
    expect(pay.statusCode).toBe(200);

    const afterPay = await lite.app.inject({
      method: 'GET',
      url: '/payables?status=PAID',
      headers: lite.headers(operatorToken),
    });
    const paidItem = afterPay
      .json<PageJson<{ id: string; amount: number; paid_amount: number; status: string }>>()
      .items.find((p) => p.id === payableId);
    expect(paidItem?.status).toBe('PAID');
    expect(paidItem?.paid_amount).toBe(250);

    const doublePay = await lite.app.inject({
      method: 'POST',
      url: `/payables/${payableId}/pay`,
      headers: lite.headers(managerToken),
      payload: { account_id: accountId },
    });
    expect(doublePay.statusCode).toBe(409);

    const outLedger = await lite.app.inject({
      method: 'GET',
      url: `/financial-transactions?type=OUT&account_id=${accountId}`,
      headers: lite.headers(operatorToken),
    });
    const outItems = outLedger.json<PageJson<{ amount: number }>>().items;
    expect(outItems).toHaveLength(1);
    expect(outItems[0]?.amount).toBe(250);

    const outPayments = await lite.app.inject({
      method: 'GET',
      url: '/payments?direction=OUT',
      headers: lite.headers(operatorToken),
    });
    expect(outPayments.json<PageJson<unknown>>().total).toBe(1);

    const viewerCreate = await lite.app.inject({
      method: 'POST',
      url: '/payables',
      headers: lite.headers(viewerToken),
      payload: { description: 'Pago pelo viewer', amount: 10, due_at: '2026-10-20' },
    });
    expect(viewerCreate.statusCode).toBe(403);

    const anonymous = await lite.app.inject({
      method: 'POST',
      url: '/payables',
      payload: { description: 'anon', amount: 10, due_at: '2026-10-20' },
    });
    expect(anonymous.statusCode).toBe(401);

    const foreignPay = await lite.app.inject({
      method: 'POST',
      url: `/payables/${payableId}/pay`,
      headers: lite.headers(foreignManagerToken),
      payload: { account_id: accountId },
    });
    expect(foreignPay.statusCode).toBe(404);

    const foreignList = await lite.app.inject({
      method: 'GET',
      url: '/payables',
      headers: lite.headers(foreignToken),
    });
    const foreignItems = foreignList.json<PageJson<{ id: string }>>().items;
    expect(foreignItems.some((p) => p.id === payableId)).toBe(false);

    const audit = await lite.adminPool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM audit_logs WHERE event_type = 'EXPENSE_CREATED'`,
    );
    expect(audit.rows[0]?.total).toBeGreaterThanOrEqual(1);
  });
});
