import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

interface DashboardJson {
  widgets: Array<{ key: string; kind: string; data: Record<string, unknown> }>;
  can_configure: boolean;
}

function widget<T = { value: number }>(dash: DashboardJson, key: string): T {
  const found = dash.widgets.find((w) => w.key === key);
  if (!found) throw new Error(`widget ${key} not rendered`);
  return found.data as T;
}

interface SalesReportJson {
  items: Array<{
    sale_number: string;
    status: string;
    customer_name: string;
    gross_amount: number;
    margin_amount: number;
  }>;
  totals: { count: number; gross_amount: number; cost_amount: number; margin_amount: number };
}

interface CashFlowJson {
  items: Array<{ day: string; inflow: number; outflow: number; net: number }>;
  totals: { inflow: number; outflow: number };
  period: { from: string; to: string };
}

describe('Travel Lite dashboard and reports', () => {
  let lite: LiteFixture;
  let staffToken: string;
  let viewerToken: string;
  let foreignToken: string;
  let accountId: string;
  let sellerId: string;

  beforeAll(async () => {
    lite = await createLiteFixture();
    staffToken = await lite.login('tenant-a', 'staff@a.test');
    viewerToken = await lite.login('tenant-a', 'viewer@a.test');
    foreignToken = await lite.login('tenant-b', 'staff@b.test');

    const account = await lite.app.inject({
      method: 'POST',
      url: '/financial-accounts',
      headers: lite.headers(staffToken),
      payload: { name: 'Banco Relatorios', type: 'BANK' },
    });
    accountId = account.json<{ account: { id: string } }>().account.id;

    const inbound = await lite.app.inject({
      method: 'POST',
      url: '/financial-categories',
      headers: lite.headers(staffToken),
      payload: { name: 'Receita', direction: 'IN' },
    });
    const inboundId = inbound.json<{ category: { id: string } }>().category.id;

    const outbound = await lite.app.inject({
      method: 'POST',
      url: '/financial-categories',
      headers: lite.headers(staffToken),
      payload: { name: 'Custo', direction: 'OUT' },
    });
    const outboundId = outbound.json<{ category: { id: string } }>().category.id;

    const seller = await lite.app.inject({
      method: 'POST',
      url: '/sellers',
      headers: lite.headers(staffToken),
      payload: {
        name: 'Relatorio 10%',
        commission_rule_type: 'PERCENTAGE_ON_GROSS',
        commission_rate: 10,
      },
    });
    sellerId = seller.json<{ seller: { id: string } }>().seller.id;

    const category = await lite.app.inject({
      method: 'POST',
      url: '/categories',
      headers: lite.headers(staffToken),
      payload: { name: 'HOTEL' },
    });
    const categoryId = category.json<{ category: { id: string } }>().category.id;

    const customer = await lite.app.inject({
      method: 'POST',
      url: '/customers',
      headers: lite.headers(staffToken),
      payload: { name: 'Silva, João "J"', email: 'joao@rel.test' },
    });
    const customerId = customer.json<{ customer: { id: string } }>().customer.id;

    const saleA = await lite.app.inject({
      method: 'POST',
      url: '/sales',
      headers: lite.headers(staffToken),
      payload: {
        customer_id: customerId,
        seller_id: sellerId,
        category_id: categoryId,
        gross_amount: 1000,
        cost_amount: 800,
        due_date: '2026-10-15',
        installment_count: 2,
      },
    });
    const saleAId = saleA.json<{ sale: { id: string } }>().sale.id;
    await lite.app.inject({
      method: 'POST',
      url: `/sales/${saleAId}/confirm`,
      headers: lite.headers(staffToken),
    });
    const detailA = await lite.app.inject({
      method: 'GET',
      url: `/sales/${saleAId}`,
      headers: lite.headers(staffToken),
    });
    const firstReceivableId = detailA.json<{
      receivables: Array<{ id: string }>;
    }>().receivables[0]!.id;
    await lite.app.inject({
      method: 'POST',
      url: `/receivables/${firstReceivableId}/receive`,
      headers: lite.headers(staffToken),
      payload: { account_id: accountId, category_id: inboundId, amount: 100 },
    });

    const saleB = await lite.app.inject({
      method: 'POST',
      url: '/sales',
      headers: lite.headers(staffToken),
      payload: {
        customer_id: customerId,
        seller_id: sellerId,
        category_id: categoryId,
        gross_amount: 500,
        cost_amount: 400,
        due_date: '2026-10-20',
        installment_count: 1,
      },
    });
    const saleBId = saleB.json<{ sale: { id: string } }>().sale.id;
    await lite.app.inject({
      method: 'POST',
      url: `/sales/${saleBId}/confirm`,
      headers: lite.headers(staffToken),
    });

    const paidPayable = await lite.app.inject({
      method: 'POST',
      url: '/payables',
      headers: lite.headers(staffToken),
      payload: {
        description: 'Pago no setup',
        amount: 250,
        due_at: '2026-10-10',
        category_id: outboundId,
      },
    });
    const paidPayableId = paidPayable.json<{ payable: { id: string } }>().payable.id;
    await lite.app.inject({
      method: 'POST',
      url: `/payables/${paidPayableId}/pay`,
      headers: lite.headers(await lite.login('tenant-a', 'admin@a.test')),
      payload: { account_id: accountId, category_id: outboundId },
    });

    const openPayable = await lite.app.inject({
      method: 'POST',
      url: '/payables',
      headers: lite.headers(staffToken),
      payload: {
        description: 'Aberto no setup',
        amount: 400,
        due_at: '2026-10-25',
        category_id: outboundId,
      },
    });
    expect(openPayable.statusCode).toBe(201);
  });

  afterAll(async () => {
    await lite?.close();
  });

  it('summarizes the month, obligations, and balances on the dashboard', async () => {
    const response = await lite.app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: lite.headers(staffToken),
    });
    expect(response.statusCode).toBe(200);
    const dash = response.json<DashboardJson>();

    expect(widget(dash, 'sales_month').value).toBe(2);
    expect(widget(dash, 'sales_amount').value).toBe(1500);
    expect(widget<{ value: number; count: number; pending_rule_count: number }>(dash, 'pending_commissions'))
      .toMatchObject({ value: 150, count: 2, pending_rule_count: 0 });
    expect(widget(dash, 'receivable').value).toBe(1400);
    expect(widget(dash, 'payable').value).toBe(400);
    expect(widget(dash, 'received').value).toBe(100);
    expect(widget(dash, 'expenses').value).toBe(250);
    expect(widget(dash, 'result').value).toBe(-150);

    const evolution = widget<{ series: Array<{ gross_amount: number; margin_amount: number }> }>(
      dash,
      'sales_evolution_chart',
    ).series;
    expect(evolution.reduce((sum, p) => sum + p.gross_amount, 0)).toBe(1500);
    expect(evolution.reduce((sum, p) => sum + p.margin_amount, 0)).toBe(300);
    const categories = widget<{ series: Array<{ category_name: string; gross_amount: number }> }>(
      dash,
      'sales_by_category_chart',
    ).series;
    expect(categories).toEqual([expect.objectContaining({ category_name: 'HOTEL', gross_amount: 1500 })]);
    const ranking = widget<{ rows: Array<{ seller_name: string; gross_amount: number }> }>(dash, 'seller_ranking');
    expect(ranking.rows).toEqual([expect.objectContaining({ seller_name: 'Relatorio 10%', gross_amount: 1500 })]);
    const cash = widget<{ series: Array<{ inflow: number; outflow: number }> }>(dash, 'cash_flow').series;
    expect(cash.reduce((sum, d) => sum + d.inflow, 0)).toBe(100);
    expect(cash.reduce((sum, d) => sum + d.outflow, 0)).toBe(250);

    const accounts = await lite.app.inject({
      method: 'GET',
      url: '/financial-accounts',
      headers: lite.headers(staffToken),
    });
    const items = accounts.json<{ items: Array<{ balance: number }> }>().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.balance).toBe(-150);
  });

  it('builds the sales report with totals and filters', async () => {
    const viewerReport = await lite.app.inject({
      method: 'GET',
      url: '/reports/sales',
      headers: lite.headers(viewerToken),
    });
    expect(viewerReport.statusCode).toBe(200);
    const report = viewerReport.json<SalesReportJson>();
    expect(report.totals.count).toBe(2);
    expect(report.totals.gross_amount).toBe(1500);
    expect(report.totals.cost_amount).toBe(1200);
    expect(report.totals.margin_amount).toBe(300);
    expect(report.items[0]?.customer_name).toBe('Silva, João "J"');

    const confirmed = await lite.app.inject({
      method: 'GET',
      url: '/reports/sales?status=CONFIRMED',
      headers: lite.headers(staffToken),
    });
    const confirmedReport = confirmed.json<SalesReportJson>();
    expect(confirmedReport.totals.count).toBe(1);
    expect(confirmedReport.totals.gross_amount).toBe(500);

    const bySeller = await lite.app.inject({
      method: 'GET',
      url: `/reports/sales?seller_id=${sellerId}`,
      headers: lite.headers(staffToken),
    });
    expect(bySeller.json<SalesReportJson>().totals.count).toBe(2);

    const futureWindow = await lite.app.inject({
      method: 'GET',
      url: '/reports/sales?from=2027-01-01',
      headers: lite.headers(staffToken),
    });
    expect(futureWindow.json<SalesReportJson>().totals.count).toBe(0);

    const badStatus = await lite.app.inject({
      method: 'GET',
      url: '/reports/sales?status=WHATEVER',
      headers: lite.headers(staffToken),
    });
    expect(badStatus.statusCode).toBe(400);
  });

  it('exports the sales report as RFC4180 CSV with a UTF-8 BOM', async () => {
    const response = await lite.app.inject({
      method: 'GET',
      url: '/reports/sales?format=csv',
      headers: lite.headers(staffToken),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(String(response.headers['content-disposition'])).toContain('attachment');
    expect(String(response.headers['content-disposition'])).toContain('vendas-');

    const body = response.body;
    expect(body.charCodeAt(0)).toBe(0xfeff);
    const lines = body.slice(1).split('\r\n');
    expect(lines[0]).toContain('sale_number,sale_date,status,customer');
    expect(lines).toHaveLength(4);
    expect(body).toContain('"Silva, João ""J"""');
  });

  it('reports commissions with totals and CSV export', async () => {
    const response = await lite.app.inject({
      method: 'GET',
      url: '/reports/commissions',
      headers: lite.headers(staffToken),
    });
    expect(response.statusCode).toBe(200);
    const report = response.json<{
      items: Array<{ seller_name: string; commission_amount: number | null; status: string }>;
      totals: { count: number; commission_amount: number; paid_amount: number };
    }>();
    expect(report.totals.count).toBe(2);
    expect(report.totals.commission_amount).toBe(150);
    expect(report.totals.paid_amount).toBe(0);

    const pending = await lite.app.inject({
      method: 'GET',
      url: '/reports/commissions?status=PENDING',
      headers: lite.headers(staffToken),
    });
    expect(pending.json<{ totals: { count: number } }>().totals.count).toBe(2);

    const csv = await lite.app.inject({
      method: 'GET',
      url: '/reports/commissions?format=csv',
      headers: lite.headers(staffToken),
    });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body.slice(1).split('\r\n')[0]).toBe(
      'created_at,sale_number,seller,status,calculation_type,commission_amount,paid_at',
    );
  });

  it('aggregates the cash flow per day with totals and CSV', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const response = await lite.app.inject({
      method: 'GET',
      url: `/reports/cash-flow?from=${today}&to=${today}`,
      headers: lite.headers(staffToken),
    });
    expect(response.statusCode).toBe(200);
    const flow = response.json<CashFlowJson>();
    expect(flow.items).toHaveLength(1);
    expect(flow.items[0]?.inflow).toBe(100);
    expect(flow.items[0]?.outflow).toBe(250);
    expect(flow.items[0]?.net).toBe(-150);
    expect(flow.totals.inflow).toBe(100);
    expect(flow.totals.outflow).toBe(250);

    const emptyWindow = await lite.app.inject({
      method: 'GET',
      url: '/reports/cash-flow?from=2027-01-01&to=2027-01-31',
      headers: lite.headers(staffToken),
    });
    expect(emptyWindow.json<CashFlowJson>().items).toHaveLength(0);

    const csv = await lite.app.inject({
      method: 'GET',
      url: `/reports/cash-flow?from=${today}&to=${today}&format=csv`,
      headers: lite.headers(staffToken),
    });
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.body.slice(1).split('\r\n');
    expect(lines[0]).toBe('day,inflow,outflow,net');
    expect(lines[1]).toBe(`${today},100,250,-150`);
  });

  it('keeps tenants isolated and requires authentication', async () => {
    const foreignDash = await lite.app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: lite.headers(foreignToken),
    });
    const dash = foreignDash.json<DashboardJson>();
    for (const key of ['sales_month', 'sales_amount', 'pending_commissions', 'receivable', 'payable', 'received']) {
      expect(widget(dash, key).value).toBe(0);
    }
    expect(widget<{ rows: unknown[] }>(dash, 'seller_ranking').rows).toHaveLength(0);

    const foreignSales = await lite.app.inject({
      method: 'GET',
      url: '/reports/sales',
      headers: lite.headers(foreignToken),
    });
    expect(foreignSales.json<SalesReportJson>().totals.count).toBe(0);

    const anonymous = await lite.app.inject({ method: 'GET', url: '/dashboard' });
    expect(anonymous.statusCode).toBe(401);

    const anonymousReport = await lite.app.inject({ method: 'GET', url: '/reports/sales' });
    expect(anonymousReport.statusCode).toBe(401);
  });
});
