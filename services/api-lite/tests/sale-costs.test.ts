import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

interface SaleJson {
  id: string;
  gross_amount: number;
  cost_amount: number;
  margin_amount: number;
}

interface PageJson<T> {
  items: T[];
  total: number;
}

describe('Travel Lite sale costs and financial parties', () => {
  let lite: LiteFixture;
  let masterToken: string;
  let adminToken: string;
  let staffToken: string;
  let sellerToken: string;
  let foreignToken: string;
  let customerId: string;
  let sellerId: string;
  let saleCategoryId: string;
  let expenseCategoryId: string;
  let accountId: string;

  beforeAll(async () => {
    lite = await createLiteFixture();
    masterToken = await lite.login('tenant-a', 'master@a.test');
    adminToken = await lite.login('tenant-a', 'admin@a.test');
    staffToken = await lite.login('tenant-a', 'staff@a.test');
    sellerToken = await lite.login('tenant-a', 'seller1@a.test');
    foreignToken = await lite.login('tenant-b', 'admin@b.test');

    const customer = await lite.app.inject({
      method: 'POST',
      url: '/customers',
      headers: lite.headers(staffToken),
      payload: { name: 'Cliente Custo' },
    });
    customerId = customer.json<{ customer: { id: string } }>().customer.id;

    const seller = await lite.app.inject({
      method: 'POST',
      url: '/sellers',
      headers: lite.headers(masterToken),
      payload: {
        name: 'Vendedor Custo',
        user_id: lite.sellerUserA1,
        commission_rule_type: 'PERCENTAGE_ON_MARGIN',
        commission_rate: 10,
      },
    });
    sellerId = seller.json<{ seller: { id: string } }>().seller.id;
    sellerToken = await lite.login('tenant-a', 'seller1@a.test');

    const saleCategory = await lite.app.inject({
      method: 'POST',
      url: '/categories',
      headers: lite.headers(staffToken),
      payload: { name: 'PACOTE COM CUSTO' },
    });
    saleCategoryId = saleCategory.json<{ category: { id: string } }>().category.id;

    const expenseCategory = await lite.app.inject({
      method: 'POST',
      url: '/financial-categories',
      headers: lite.headers(staffToken),
      payload: { name: 'Custo Direto', direction: 'OUT' },
    });
    expenseCategoryId = expenseCategory.json<{ category: { id: string } }>().category.id;

    const account = await lite.app.inject({
      method: 'POST',
      url: '/financial-accounts',
      headers: lite.headers(staffToken),
      payload: { name: 'Conta Custos', type: 'BANK' },
    });
    accountId = account.json<{ account: { id: string } }>().account.id;
  });

  afterAll(async () => {
    await lite?.close();
  });

  async function createSale(): Promise<SaleJson> {
    const created = await lite.app.inject({
      method: 'POST',
      url: '/sales',
      headers: lite.headers(staffToken),
      payload: {
        customer_id: customerId,
        seller_id: sellerId,
        category_id: saleCategoryId,
        gross_amount: 1000,
        due_date: '2026-10-20',
      },
    });
    expect(created.statusCode).toBe(201);
    return created.json<{ sale: SaleJson }>().sale;
  }

  it('manages tenant-safe financial parties', async () => {
    const created = await lite.app.inject({
      method: 'POST',
      url: '/financial-parties',
      headers: lite.headers(staffToken),
      payload: {
        type: 'SUPPLIER',
        name: 'Hotel Central',
        document: '12.345.678/0001-90',
        phone: '+55 11 99999-0000',
        email: 'financeiro@hotel.test',
        notes: 'Contrato anual',
      },
    });
    expect(created.statusCode).toBe(201);
    const partyId = created.json<{ financialParty: { id: string; status: string } }>().financialParty.id;

    const list = await lite.app.inject({
      method: 'GET',
      url: '/financial-parties?type=SUPPLIER',
      headers: lite.headers(staffToken),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ items: Array<{ id: string; name: string }> }>().items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: partyId, name: 'Hotel Central' })]),
    );

    const foreign = await lite.app.inject({
      method: 'GET',
      url: '/financial-parties',
      headers: lite.headers(foreignToken),
    });
    expect(foreign.json<{ items: Array<{ id: string }> }>().items.map((p) => p.id)).not.toContain(partyId);

    const sellerCreate = await lite.app.inject({
      method: 'POST',
      url: '/financial-parties',
      headers: lite.headers(sellerToken),
      payload: { type: 'OTHER', name: 'Não autorizado' },
    });
    expect(sellerCreate.statusCode).toBe(403);
  });

  it('adds multiple sale costs, recalculates margin server-side, and creates one optional payable', async () => {
    const sale = await createSale();
    expect(sale.cost_amount).toBe(0);
    expect(sale.margin_amount).toBe(1000);

    const party = await lite.app.inject({
      method: 'POST',
      url: '/financial-parties',
      headers: lite.headers(staffToken),
      payload: { type: 'SERVICE_PROVIDER', name: 'Operadora Azul' },
    });
    const partyId = party.json<{ financialParty: { id: string } }>().financialParty.id;

    const first = await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/costs`,
      headers: lite.headers(staffToken),
      payload: {
        cost_type: 'HOTEL',
        description: 'Hotel',
        financial_party_id: partyId,
        amount: 300,
        due_date: '2026-10-10',
        create_payable: true,
        category_id: expenseCategoryId,
      },
    });
    expect(first.statusCode).toBe(201);
    const firstCost = first.json<{ saleCost: { id: string; payable_id: string | null } }>().saleCost;
    expect(firstCost.payable_id).toEqual(expect.any(String));

    const duplicatePayable = await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/costs/${firstCost.id}/payable`,
      headers: lite.headers(staffToken),
      payload: { category_id: expenseCategoryId },
    });
    expect(duplicatePayable.statusCode).toBe(409);

    const second = await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/costs`,
      headers: lite.headers(staffToken),
      payload: {
        cost_type: 'AIRFARE',
        description: 'Tarifa aérea',
        amount: 125.5,
      },
    });
    expect(second.statusCode).toBe(201);

    const detail = await lite.app.inject({
      method: 'GET',
      url: `/sales/${sale.id}`,
      headers: lite.headers(staffToken),
    });
    const updatedSale = detail.json<{ sale: SaleJson; saleCosts: Array<{ amount: number }> }>();
    expect(updatedSale.saleCosts).toHaveLength(2);
    expect(updatedSale.sale.cost_amount).toBe(425.5);
    expect(updatedSale.sale.margin_amount).toBe(574.5);

    const payables = await lite.app.inject({
      method: 'GET',
      url: '/payables',
      headers: lite.headers(staffToken),
    });
    const payable = payables
      .json<PageJson<{ id: string; financial_party_name: string | null; sale_id: string | null; sale_cost_item_id: string | null }>>()
      .items.find((p) => p.sale_cost_item_id === firstCost.id);
    expect(payable).toMatchObject({
      id: firstCost.payable_id,
      financial_party_name: 'Operadora Azul',
      sale_id: sale.id,
      sale_cost_item_id: firstCost.id,
    });
  });

  it('links cost payables through payments and ledger history', async () => {
    const sale = await createSale();
    const party = await lite.app.inject({
      method: 'POST',
      url: '/financial-parties',
      headers: lite.headers(staffToken),
      payload: { type: 'SUPPLIER', name: 'Seguro Viagem' },
    });
    const partyId = party.json<{ financialParty: { id: string } }>().financialParty.id;
    const cost = await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/costs`,
      headers: lite.headers(staffToken),
      payload: {
        cost_type: 'INSURANCE',
        description: 'Seguro',
        financial_party_id: partyId,
        amount: 80,
        due_date: '2026-10-12',
        create_payable: true,
        category_id: expenseCategoryId,
      },
    });
    const costJson = cost.json<{ saleCost: { id: string; payable_id: string } }>().saleCost;

    const pay = await lite.app.inject({
      method: 'POST',
      url: `/payables/${costJson.payable_id}/pay`,
      headers: lite.headers(adminToken),
      payload: { account_id: accountId, category_id: expenseCategoryId, reference: 'NF-80' },
    });
    expect(pay.statusCode).toBe(200);

    const payments = await lite.app.inject({
      method: 'GET',
      url: '/payments?direction=OUT',
      headers: lite.headers(staffToken),
    });
    const payment = payments
      .json<PageJson<{ financial_party_name: string | null; sale_id: string | null; sale_cost_item_id: string | null }>>()
      .items.find((p) => p.sale_cost_item_id === costJson.id);
    expect(payment).toMatchObject({
      financial_party_name: 'Seguro Viagem',
      sale_id: sale.id,
      sale_cost_item_id: costJson.id,
    });

    const ledger = await lite.app.inject({
      method: 'GET',
      url: `/financial-transactions?type=OUT&account_id=${accountId}`,
      headers: lite.headers(staffToken),
    });
    expect(
      ledger
        .json<PageJson<{ sale_id: string | null; sale_cost_item_id: string | null }>>()
        .items.some((entry) => entry.sale_id === sale.id && entry.sale_cost_item_id === costJson.id),
    ).toBe(true);
  });

  it('uses updated total costs for margin-based commission without changing the commission rule', async () => {
    const sale = await createSale();
    await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/costs`,
      headers: lite.headers(staffToken),
      payload: { cost_type: 'OPERATOR', description: 'Operadora', amount: 400 },
    });

    const confirm = await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/confirm`,
      headers: lite.headers(staffToken),
    });
    expect(confirm.statusCode).toBe(200);

    const detail = await lite.app.inject({
      method: 'GET',
      url: `/sales/${sale.id}`,
      headers: lite.headers(staffToken),
    });
    expect(detail.json<{ commission: { calculation_base: number; commission_amount: number } }>().commission).toMatchObject({
      calculation_base: 600,
      commission_amount: 60,
    });
  });

  it('reports revenue, direct costs, gross margin, and costs by supplier from the same totals', async () => {
    const sale = await createSale();
    await lite.app.inject({
      method: 'PATCH',
      url: `/sales/${sale.id}`,
      headers: lite.headers(staffToken),
      payload: { sale_date: '2026-12-31' },
    });
    const party = await lite.app.inject({
      method: 'POST',
      url: '/financial-parties',
      headers: lite.headers(staffToken),
      payload: { type: 'SUPPLIER', name: 'Fornecedor Report' },
    });
    const partyId = party.json<{ financialParty: { id: string } }>().financialParty.id;
    await lite.app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/costs`,
      headers: lite.headers(staffToken),
      payload: {
        cost_type: 'SERVICE',
        description: 'Serviço report',
        financial_party_id: partyId,
        amount: 250,
      },
    });

    const report = await lite.app.inject({
      method: 'GET',
      url: '/reports/sale-costs?from=2026-12-31&to=2026-12-31',
      headers: lite.headers(staffToken),
    });
    expect(report.statusCode).toBe(200);
    const body = report.json<{
      totals: { revenue: number; direct_costs: number; gross_margin: number; margin_percentage: number };
      by_supplier: Array<{ financial_party_name: string | null; direct_costs: number }>;
      charts: { by_supplier: Array<{ financial_party_name: string | null; direct_costs: number }> };
    }>();
    expect(body.totals).toMatchObject({
      revenue: 1000,
      direct_costs: 250,
      gross_margin: 750,
      margin_percentage: 75,
    });
    expect(body.by_supplier).toEqual([
      expect.objectContaining({ financial_party_name: 'Fornecedor Report', direct_costs: 250 }),
    ]);
    expect(body.charts.by_supplier).toEqual(body.by_supplier);
  });
});
