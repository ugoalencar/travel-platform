import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

interface CommissionJson {
  id: string;
  sale_id: string;
  seller_id: string;
  calculation_type: string | null;
  calculation_base: number | null;
  percentage: number | null;
  commission_amount: number | null;
  status: string;
  paid_at: string | null;
  seller_name: string;
  sale_number: string;
  payable_id: string | null;
  payable_status: string | null;
}

interface PageJson<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

interface SaleDetailJson {
  sale: { id: string; status: string };
  commission: {
    id: string;
    status: string;
    calculation_type: string | null;
    commission_amount: number | null;
    paid_at: string | null;
  } | null;
}

describe('Travel Lite commissions', () => {
  let lite: LiteFixture;
  let operatorToken: string;
  let managerToken: string;
  let viewerToken: string;
  let foreignToken: string;
  let customerId: string;
  let percentageSellerId: string;
  let noRuleSellerId: string;
  let accountId: string;
  let categoryId: string;
  let approvedSaleId: string;
  let approvedCommissionId: string;
  let rulelessSaleId: string;
  let rulelessCommissionId: string;

  beforeAll(async () => {
    lite = await createLiteFixture();
    operatorToken = await lite.login('tenant-a', 'operator@a.test');
    viewerToken = await lite.login('tenant-a', 'viewer@a.test');
    managerToken = await lite.login('tenant-a', 'admin@a.test');
    foreignToken = await lite.login('tenant-b', 'operator@b.test');

    const customer = await lite.app.inject({
      method: 'POST',
      url: '/customers',
      headers: lite.headers(operatorToken),
      payload: { name: 'Cliente Comissao', email: 'cliente@comissao.test' },
    });
    customerId = customer.json<{ customer: { id: string } }>().customer.id;

    const percentageSeller = await lite.app.inject({
      method: 'POST',
      url: '/sellers',
      headers: lite.headers(operatorToken),
      payload: {
        name: 'Comissao 10%',
        commission_rule_type: 'PERCENTAGE_ON_GROSS',
        commission_rate: 10,
      },
    });
    percentageSellerId = percentageSeller.json<{ seller: { id: string } }>().seller.id;

    const noRuleSeller = await lite.app.inject({
      method: 'POST',
      url: '/sellers',
      headers: lite.headers(operatorToken),
      payload: { name: 'Sem Regra Inicial' },
    });
    noRuleSellerId = noRuleSeller.json<{ seller: { id: string } }>().seller.id;

    const account = await lite.app.inject({
      method: 'POST',
      url: '/financial-accounts',
      headers: lite.headers(operatorToken),
      payload: { name: 'Caixa Comissoes', type: 'CASH' },
    });
    accountId = account.json<{ account: { id: string } }>().account.id;

    const category = await lite.app.inject({
      method: 'POST',
      url: '/categories',
      headers: lite.headers(operatorToken),
      payload: { name: 'TRANSF' },
    });
    categoryId = category.json<{ category: { id: string } }>().category.id;

    const created = await lite.app.inject({
      method: 'POST',
      url: '/sales',
      headers: lite.headers(operatorToken),
      payload: {
        customer_id: customerId,
        seller_id: percentageSellerId,
        category_id: categoryId,
        gross_amount: 1000,
        cost_amount: 800,
        due_date: '2026-10-15',
        installment_count: 1,
      },
    });
    approvedSaleId = created.json<{ sale: { id: string } }>().sale.id;
    await lite.app.inject({
      method: 'POST',
      url: `/sales/${approvedSaleId}/confirm`,
      headers: lite.headers(operatorToken),
    });

    const createdRuleless = await lite.app.inject({
      method: 'POST',
      url: '/sales',
      headers: lite.headers(operatorToken),
      payload: {
        customer_id: customerId,
        seller_id: noRuleSellerId,
        category_id: categoryId,
        gross_amount: 2000,
        cost_amount: 1500,
        due_date: '2026-10-15',
        installment_count: 1,
      },
    });
    rulelessSaleId = createdRuleless.json<{ sale: { id: string } }>().sale.id;
    await lite.app.inject({
      method: 'POST',
      url: `/sales/${rulelessSaleId}/confirm`,
      headers: lite.headers(operatorToken),
    });

    approvedCommissionId = await getCommissionId(approvedSaleId);
    rulelessCommissionId = await getCommissionId(rulelessSaleId);
  });

  afterAll(async () => {
    await lite?.close();
  });

  async function getCommissionId(saleId: string): Promise<string> {
    const detail = await lite.app.inject({
      method: 'GET',
      url: `/sales/${saleId}`,
      headers: lite.headers(operatorToken),
    });
    const json = detail.json<SaleDetailJson>();
    expect(json.commission).not.toBeNull();
    return json.commission!.id;
  }

  async function getSaleCommission(saleId: string, token?: string): Promise<SaleDetailJson['commission']> {
    const detail = await lite.app.inject({
      method: 'GET',
      url: `/sales/${saleId}`,
      headers: lite.headers(token ?? operatorToken),
    });
    expect(detail.statusCode).toBe(200);
    return detail.json<SaleDetailJson>().commission;
  }

  it('lists commissions with sale and seller joins plus filters', async () => {
    const list = await lite.app.inject({
      method: 'GET',
      url: '/commissions',
      headers: lite.headers(operatorToken),
    });
    expect(list.statusCode).toBe(200);
    const page = list.json<PageJson<CommissionJson>>();
    expect(page.total).toBe(2);
    const approved = page.items.find((c) => c.id === approvedCommissionId);
    expect(approved?.seller_name).toBe('Comissao 10%');
    expect(approved?.sale_number).toBe('VENDA-000001');
    expect(approved?.status).toBe('PENDING');
    expect(approved?.commission_amount).toBe(100);
    expect(approved?.calculation_base).toBe(1000);
    expect(approved?.payable_id).toBeNull();

    const bySeller = await lite.app.inject({
      method: 'GET',
      url: `/commissions?seller_id=${noRuleSellerId}`,
      headers: lite.headers(operatorToken),
    });
    const sellerItems = bySeller.json<PageJson<CommissionJson>>().items;
    expect(sellerItems).toHaveLength(1);
    expect(sellerItems[0]?.status).toBe('PENDING_RULE');
    expect(sellerItems[0]?.commission_amount).toBeNull();

    const byStatus = await lite.app.inject({
      method: 'GET',
      url: '/commissions?status=PENDING_RULE',
      headers: lite.headers(operatorToken),
    });
    expect(byStatus.json<PageJson<CommissionJson>>().total).toBe(1);

    const badStatus = await lite.app.inject({
      method: 'GET',
      url: '/commissions?status=MAGIC',
      headers: lite.headers(operatorToken),
    });
    expect(badStatus.statusCode).toBe(400);
  });

  it('approves a PENDING commission and materializes the payable', async () => {
    const viewerApprove = await lite.app.inject({
      method: 'POST',
      url: `/commissions/${approvedCommissionId}/approve`,
      headers: lite.headers(viewerToken),
      payload: {},
    });
    expect(viewerApprove.statusCode).toBe(403);

    const operatorApprove = await lite.app.inject({
      method: 'POST',
      url: `/commissions/${approvedCommissionId}/approve`,
      headers: lite.headers(operatorToken),
      payload: {},
    });
    expect(operatorApprove.statusCode).toBe(403);

    const approve = await lite.app.inject({
      method: 'POST',
      url: `/commissions/${approvedCommissionId}/approve`,
      headers: lite.headers(managerToken),
      payload: { due_at: '2026-11-10' },
    });
    expect(approve.statusCode).toBe(200);

    const list = await lite.app.inject({
      method: 'GET',
      url: `/commissions?seller_id=${percentageSellerId}`,
      headers: lite.headers(operatorToken),
    });
    const item = list.json<PageJson<CommissionJson>>().items[0];
    expect(item?.status).toBe('APPROVED');
    expect(item?.payable_id).not.toBeNull();
    expect(item?.payable_status).toBe('OPEN');

    const payables = await lite.app.inject({
      method: 'GET',
      url: '/payables?status=OPEN',
      headers: lite.headers(operatorToken),
    });
    const payable = payables
      .json<PageJson<{ id: string; commission_id: string | null; amount: number; due_at: string }>>()
      .items.find((p) => p.commission_id === approvedCommissionId);
    expect(payable).toBeDefined();
    expect(payable?.amount).toBe(100);
    expect(payable?.due_at).toBe('2026-11-10');

    const again = await lite.app.inject({
      method: 'POST',
      url: `/commissions/${approvedCommissionId}/approve`,
      headers: lite.headers(managerToken),
      payload: {},
    });
    expect(again.statusCode).toBe(409);

    const audit = await lite.adminPool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM audit_logs WHERE event_type = 'COMMISSION_APPROVED'`,
    );
    expect(audit.rows[0]?.total).toBe(1);
  });

  it('refuses to approve a commission without a rule', async () => {
    const approve = await lite.app.inject({
      method: 'POST',
      url: `/commissions/${rulelessCommissionId}/approve`,
      headers: lite.headers(managerToken),
      payload: {},
    });
    expect(approve.statusCode).toBe(409);
  });

  it('overrides a commission manually and resolves PENDING_RULE', async () => {
    const operatorOverride = await lite.app.inject({
      method: 'PATCH',
      url: `/commissions/${rulelessCommissionId}`,
      headers: lite.headers(operatorToken),
      payload: { commission_amount: 55 },
    });
    expect(operatorOverride.statusCode).toBe(403);

    const override = await lite.app.inject({
      method: 'PATCH',
      url: `/commissions/${rulelessCommissionId}`,
      headers: lite.headers(managerToken),
      payload: { commission_amount: 55, notes: 'Negociado manualmente' },
    });
    expect(override.statusCode).toBe(200);

    const commission = await getSaleCommission(
      (await lite.adminPool.query<{ sale_id: string }>(
        `SELECT sale_id FROM seller_commissions WHERE id = $1`,
        [rulelessCommissionId],
      )).rows[0]!.sale_id,
    );
    expect(commission?.status).toBe('PENDING');
    expect(commission?.calculation_type).toBe('MANUAL');
    expect(commission?.commission_amount).toBe(55);

    const missingAmount = await lite.app.inject({
      method: 'PATCH',
      url: `/commissions/${rulelessCommissionId}`,
      headers: lite.headers(managerToken),
      payload: {},
    });
    expect(missingAmount.statusCode).toBe(400);

    const audit = await lite.adminPool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM audit_logs WHERE event_type = 'COMMISSION_OVERRIDE'`,
    );
    expect(audit.rows[0]?.total).toBe(1);
  });

  it('finalizes the commission to PAID when its payable is paid', async () => {
    const payables = await lite.app.inject({
      method: 'GET',
      url: '/payables?status=OPEN',
      headers: lite.headers(operatorToken),
    });
    const payable = payables
      .json<PageJson<{ id: string; commission_id: string | null }>>()
      .items.find((p) => p.commission_id === approvedCommissionId);
    expect(payable).toBeDefined();

    const pay = await lite.app.inject({
      method: 'POST',
      url: `/payables/${payable!.id}/pay`,
      headers: lite.headers(managerToken),
      payload: { account_id: accountId },
    });
    expect(pay.statusCode).toBe(200);

    const list = await lite.app.inject({
      method: 'GET',
      url: `/commissions?seller_id=${percentageSellerId}`,
      headers: lite.headers(operatorToken),
    });
    const paid = list.json<PageJson<CommissionJson>>().items[0];
    expect(paid?.status).toBe('PAID');
    expect(paid?.paid_at).not.toBeNull();
    expect(paid?.payable_status).toBe('PAID');

    const override = await lite.app.inject({
      method: 'PATCH',
      url: `/commissions/${approvedCommissionId}`,
      headers: lite.headers(managerToken),
      payload: { commission_amount: 1 },
    });
    expect(override.statusCode).toBe(409);

    const audit = await lite.adminPool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM audit_logs WHERE event_type = 'COMMISSION_PAID'`,
    );
    expect(audit.rows[0]?.total).toBe(1);
  });

  it('recalculates PENDING_RULE commissions once the seller gains a rule', async () => {
    const sale = await lite.app.inject({
      method: 'POST',
      url: '/sales',
      headers: lite.headers(operatorToken),
      payload: {
        customer_id: customerId,
        seller_id: noRuleSellerId,
        category_id: categoryId,
        gross_amount: 500,
        cost_amount: 300,
        due_date: '2026-10-15',
        installment_count: 1,
      },
    });
    expect(sale.statusCode).toBe(201);
    const saleId = sale.json<{ sale: { id: string } }>().sale.id;
    await lite.app.inject({
      method: 'POST',
      url: `/sales/${saleId}/confirm`,
      headers: lite.headers(operatorToken),
    });

    const before = await getSaleCommission(saleId);
    expect(before?.status).toBe('PENDING_RULE');
    expect(before?.commission_amount).toBeNull();

    const patchSeller = await lite.app.inject({
      method: 'PATCH',
      url: `/sellers/${noRuleSellerId}`,
      headers: lite.headers(operatorToken),
      payload: { commission_rule_type: 'PERCENTAGE_ON_GROSS', commission_rate: 10 },
    });
    expect(patchSeller.statusCode).toBe(200);

    const after = await getSaleCommission(saleId);
    expect(after?.status).toBe('PENDING');
    expect(after?.calculation_type).toBe('PERCENTAGE_ON_GROSS');
    expect(after?.commission_amount).toBe(50);

    const overrideCommission = await getSaleCommission(rulelessSaleId);
    expect(overrideCommission?.status).toBe('PENDING');
    expect(overrideCommission?.commission_amount).toBe(55);

    const audit = await lite.adminPool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM audit_logs WHERE event_type = 'COMMISSION_RECALCULATED'`,
    );
    expect(audit.rows[0]?.total).toBeGreaterThanOrEqual(1);
  });

  it('keeps tenants isolated on commission routes', async () => {
    const foreignList = await lite.app.inject({
      method: 'GET',
      url: '/commissions',
      headers: lite.headers(foreignToken),
    });
    expect(foreignList.json<PageJson<CommissionJson>>().total).toBe(0);

    const foreignApprove = await lite.app.inject({
      method: 'POST',
      url: `/commissions/${approvedCommissionId}/approve`,
      headers: lite.headers(foreignToken),
      payload: {},
    });
    expect(foreignApprove.statusCode).toBe(403);

    const foreignOverride = await lite.app.inject({
      method: 'PATCH',
      url: `/commissions/${rulelessCommissionId}`,
      headers: lite.headers(foreignToken),
      payload: { commission_amount: 999 },
    });
    expect(foreignOverride.statusCode).toBe(403);

    const anonymous = await lite.app.inject({ method: 'GET', url: '/commissions' });
    expect(anonymous.statusCode).toBe(401);
  });
});
