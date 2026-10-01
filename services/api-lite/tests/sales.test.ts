import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

interface SaleJson {
  id: string;
  sale_number: string;
  status: string;
  gross_amount: number;
  cost_amount: number;
  margin_amount: number;
  installment_count: number;
  sale_date: string;
  due_date: string;
}

interface DetailJson {
  sale: SaleJson;
  receivables: Array<{
    installment_number: number;
    amount: number;
    paid_amount: number;
    due_at: string;
    status: string;
  }>;
  commission: {
    status: string;
    commission_amount: number | null;
    calculation_type: string | null;
    calculation_base: number | null;
  } | null;
}

describe('Travel Lite sales lifecycle', () => {
  let lite: LiteFixture;
  let operatorToken: string;
  let managerToken: string;
  let viewerToken: string;
  let customerId: string;
  let sellerId: string;
  let undefinedSellerId: string;
  let marginSellerId: string;
  let categoryId: string;

  beforeAll(async () => {
    lite = await createLiteFixture();
    operatorToken = await lite.login('tenant-a', 'operator@a.test');
    viewerToken = await lite.login('tenant-a', 'viewer@a.test');
    const adminToken = await lite.login('tenant-a', 'admin@a.test');
    managerToken = adminToken;

    const customer = await lite.app.inject({
      method: 'POST',
      url: '/customers',
      headers: lite.headers(operatorToken),
      payload: { name: 'Cliente Venda', email: 'cliente@venda.test' },
    });
    customerId = customer.json<{ customer: { id: string } }>().customer.id;

    const seller = await lite.app.inject({
      method: 'POST',
      url: '/sellers',
      headers: lite.headers(operatorToken),
      payload: {
        name: 'Vendedor 10%',
        commission_rule_type: 'PERCENTAGE_ON_GROSS',
        commission_rate: 10,
      },
    });
    sellerId = seller.json<{ seller: { id: string } }>().seller.id;

    const noRule = await lite.app.inject({
      method: 'POST',
      url: '/sellers',
      headers: lite.headers(operatorToken),
      payload: { name: 'Vendedor Sem Regra' },
    });
    undefinedSellerId = noRule.json<{ seller: { id: string } }>().seller.id;

    const marginSeller = await lite.app.inject({
      method: 'POST',
      url: '/sellers',
      headers: lite.headers(operatorToken),
      payload: {
        name: 'Vendedor Margem',
        commission_rule_type: 'PERCENTAGE_ON_MARGIN',
        commission_rate: 10,
      },
    });
    marginSellerId = marginSeller.json<{ seller: { id: string } }>().seller.id;

    const category = await lite.app.inject({
      method: 'POST',
      url: '/categories',
      headers: lite.headers(operatorToken),
      payload: { name: 'AÉREO' },
    });
    categoryId = category.json<{ category: { id: string } }>().category.id;
  });

  afterAll(async () => {
    await lite?.close();
  });

  function createSale(payload: Record<string, unknown>, token?: string) {
    return lite.app.inject({
      method: 'POST',
      url: '/sales',
      headers: lite.headers(token ?? operatorToken),
      payload: {
        customer_id: customerId,
        seller_id: sellerId,
        category_id: categoryId,
        gross_amount: 1000,
        cost_amount: 800,
        due_date: '2026-10-15',
        ...payload,
      },
    });
  }

  async function getDetail(saleId: string): Promise<DetailJson> {
    const response = await lite.app.inject({
      method: 'GET',
      url: `/sales/${saleId}`,
      headers: lite.headers(operatorToken),
    });
    expect(response.statusCode).toBe(200);
    return response.json<DetailJson>();
  }

  it('creates a DRAFT sale with derived margin and sequential sale number', async () => {
    const response = await createSale({ installment_count: 3 });

    expect(response.statusCode).toBe(201);
    const { sale } = response.json<{ sale: SaleJson }>();
    expect(sale.status).toBe('DRAFT');
    expect(sale.sale_number).toBe('VENDA-000001');
    expect(sale.margin_amount).toBe(200);

    const second = await createSale({});
    expect(second.json<{ sale: SaleJson }>().sale.sale_number).toBe('VENDA-000002');
  });

  it('rejects cost above gross and unknown references', async () => {
    const badMargin = await createSale({ cost_amount: 1200 });
    expect(badMargin.statusCode).toBe(400);

    const badCustomer = await createSale({
      customer_id: '00000000-0000-4000-8000-000000000000',
    });
    expect(badCustomer.statusCode).toBe(400);
  });

  it('rejects invalid installment counts', async () => {
    const zero = await createSale({ installment_count: 0 });
    expect(zero.statusCode).toBe(400);
  });

  it('confirms a sale: creates installments summing exactly and a commission snapshot', async () => {
    const created = await createSale({ installment_count: 3 });
    const { sale } = created.json<{ sale: SaleJson }>();

    const confirm = await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/confirm`,
      headers: lite.headers(operatorToken),
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json<{ sale: SaleJson }>().sale.status).toBe('CONFIRMED');

    const detail = await getDetail(sale.id);
    expect(detail.receivables).toHaveLength(3);
    const total = detail.receivables.reduce((sum, r) => sum + r.amount, 0);
    expect(total).toBe(1000);
    expect(detail.receivables.map((r) => r.due_at)).toEqual([
      '2026-10-15',
      '2026-11-15',
      '2026-12-15',
    ]);
    expect(detail.receivables.every((r) => r.status === 'OPEN')).toBe(true);

    expect(detail.commission).not.toBeNull();
    expect(detail.commission?.status).toBe('PENDING');
    expect(detail.commission?.calculation_type).toBe('PERCENTAGE_ON_GROSS');
    expect(detail.commission?.calculation_base).toBe(1000);
    expect(detail.commission?.commission_amount).toBe(100);
  });

  it('confirms a margin-based commission against margin, not gross', async () => {
    const created = await createSale({ seller_id: marginSellerId });
    const { sale } = created.json<{ sale: SaleJson }>();

    await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/confirm`,
      headers: lite.headers(operatorToken),
    });

    const detail = await getDetail(sale.id);
    expect(detail.commission?.calculation_type).toBe('PERCENTAGE_ON_MARGIN');
    expect(detail.commission?.calculation_base).toBe(200);
    expect(detail.commission?.commission_amount).toBe(20);
  });

  it('creates a PENDING_RULE commission (never R$0) when the seller has no rule', async () => {
    const created = await createSale({ seller_id: undefinedSellerId });
    const { sale } = created.json<{ sale: SaleJson }>();

    await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/confirm`,
      headers: lite.headers(operatorToken),
    });

    const detail = await getDetail(sale.id);
    expect(detail.commission?.status).toBe('PENDING_RULE');
    expect(detail.commission?.commission_amount).toBeNull();
    expect(detail.commission?.calculation_type).toBeNull();
  });

  it('rejects confirming a non-DRAFT sale twice', async () => {
    const created = await createSale({});
    const { sale } = created.json<{ sale: SaleJson }>();

    const first = await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/confirm`,
      headers: lite.headers(operatorToken),
    });
    expect(first.statusCode).toBe(200);

    const second = await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/confirm`,
      headers: lite.headers(operatorToken),
    });
    expect(second.statusCode).toBe(409);
  });

  it('edits only DRAFT sales and never the status field directly', async () => {
    const created = await createSale({});
    const { sale } = created.json<{ sale: SaleJson }>();

    const statusEdit = await lite.app.inject({
      method: 'PATCH',
      url: `/sales/${sale.id}`,
      headers: lite.headers(operatorToken),
      payload: { status: 'CONFIRMED' },
    });
    expect(statusEdit.statusCode).toBe(400);

    const edit = await lite.app.inject({
      method: 'PATCH',
      url: `/sales/${sale.id}`,
      headers: lite.headers(operatorToken),
      payload: { gross_amount: 1500, cost_amount: 1000, description: 'editada' },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json<{ sale: SaleJson }>().sale.margin_amount).toBe(500);

    await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/confirm`,
      headers: lite.headers(operatorToken),
    });

    const afterConfirm = await lite.app.inject({
      method: 'PATCH',
      url: `/sales/${sale.id}`,
      headers: lite.headers(operatorToken),
      payload: { description: 'nope' },
    });
    expect(afterConfirm.statusCode).toBe(409);
  });

  it('cancels a confirmed sale together with its receivables and commission', async () => {
    const created = await createSale({ installment_count: 2 });
    const { sale } = created.json<{ sale: SaleJson }>();
    await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/confirm`,
      headers: lite.headers(operatorToken),
    });

    const cancel = await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/cancel`,
      headers: lite.headers(managerToken),
    });
    expect(cancel.statusCode).toBe(200);

    const detail = await getDetail(sale.id);
    expect(detail.sale.status).toBe('CANCELLED');
    expect(detail.receivables.every((r) => r.status === 'CANCELLED')).toBe(true);
    expect(detail.commission?.status).toBe('CANCELLED');

    const again = await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/cancel`,
      headers: lite.headers(managerToken),
    });
    expect(again.statusCode).toBe(409);
  });

  it('refuses to cancel a sale once any amount was received', async () => {
    const created = await createSale({});
    const { sale } = created.json<{ sale: SaleJson }>();
    await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/confirm`,
      headers: lite.headers(operatorToken),
    });

    await lite.adminPool.query(`UPDATE receivables SET paid_amount = amount, status = 'PAID' WHERE sale_id = $1`, [
      sale.id,
    ]);

    const cancel = await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/cancel`,
      headers: lite.headers(managerToken),
    });
    expect(cancel.statusCode).toBe(409);
  });

  it('lists sales with filters and keeps tenants isolated', async () => {
    const list = await lite.app.inject({
      method: 'GET',
      url: '/sales?status=CONFIRMED',
      headers: lite.headers(operatorToken),
    });
    expect(list.statusCode).toBe(200);
    const body = list.json<{ items: Array<SaleJson & { customer: { name: string } }>; total: number }>();
    expect(body.total).toBeGreaterThan(0);
    expect(body.items.every((s) => s.status === 'CONFIRMED')).toBe(true);
    expect(body.items[0]?.customer.name).toBe('Cliente Venda');

    const anySale = (await createSale({})).json<{ sale: SaleJson }>().sale;
    const tokenB = await lite.login('tenant-b', 'operator@b.test');
    const foreign = await lite.app.inject({
      method: 'GET',
      url: `/sales/${anySale.id}`,
      headers: lite.headers(tokenB),
    });
    expect(foreign.statusCode).toBe(404);

    const search = await lite.app.inject({
      method: 'GET',
      url: '/sales?search=VENDA-000001',
      headers: lite.headers(operatorToken),
    });
    expect(search.json<{ items: SaleJson[] }>().items).toHaveLength(1);
  });

  it('enforces authorization on sale routes', async () => {
    const viewerCreate = await createSale({}, viewerToken);
    expect(viewerCreate.statusCode).toBe(403);

    const anonymous = await lite.app.inject({ method: 'GET', url: '/sales' });
    expect(anonymous.statusCode).toBe(401);

    const created = await createSale({});
    const { sale } = created.json<{ sale: SaleJson }>();
    const viewerConfirm = await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/confirm`,
      headers: lite.headers(viewerToken),
    });
    expect(viewerConfirm.statusCode).toBe(403);
  });
});
