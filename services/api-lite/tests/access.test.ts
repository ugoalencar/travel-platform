import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../src/access';
import { FIXTURE_PASSWORD, createLiteFixture, type LiteFixture } from './helpers/fixture';

interface PageJson<T> {
  items: T[];
  total: number;
}

interface Totals {
  sales_count: number;
  gross_amount: number;
  cost_amount: number;
  margin_amount: number;
  received_amount: number;
  pending_amount: number;
  commission_amount: number;
  commission_paid_amount: number;
  commission_pending_amount: number;
}

interface SellerReport {
  items: Array<Totals & { seller_id: string }>;
  totals: Totals;
  charts: {
    by_month: Array<Record<string, number | string>>;
    by_category: Array<{ category_name: string; sales_count: number; gross_amount: number; margin_amount: number }>;
  };
}

interface DashboardJson {
  widgets: Array<{ key: string; data: { value?: number } }>;
  can_configure: boolean;
}

describe('Travel Lite access control, seller scope and dashboard', () => {
  let lite: LiteFixture;
  let masterToken: string;
  let staffToken: string;
  let seller1Token: string;
  let seller2Token: string;
  let foreignAdminToken: string;
  let sellerOneId: string;
  let sellerTwoId: string;
  let categoryId: string;
  let customerOfOne: string;
  let customerOfTwo: string;
  let saleOfOne: string;
  let saleOfTwo: string;

  const call = (token: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: Record<string, unknown>) =>
    lite.app.inject({ method, url, headers: lite.headers(token), ...(payload ? { payload } : {}) });

  async function json<T>(token: string, url: string): Promise<T> {
    const response = await call(token, 'GET', url);
    expect(response.statusCode, `${url}: ${response.body}`).toBe(200);
    return response.json<T>();
  }

  async function createSale(token: string, sellerId: string, customerId: string, gross: number, cost: number) {
    return call(token, 'POST', '/sales', {
      customer_id: customerId,
      seller_id: sellerId,
      category_id: categoryId,
      gross_amount: gross,
      cost_amount: cost,
      sale_date: '2026-08-15',
      due_date: '2026-09-15',
      installment_count: 2,
    });
  }

  beforeAll(async () => {
    lite = await createLiteFixture();
    masterToken = await lite.login('tenant-a', 'master@a.test');
    staffToken = await lite.login('tenant-a', 'staff@a.test');
    foreignAdminToken = await lite.login('tenant-b', 'admin@b.test');

    // Sellers linked to the two SELLER logins (linking needs users.manage).
    const one = await call(masterToken, 'POST', '/sellers', {
      name: 'Vendedora Um',
      user_id: lite.sellerUserA1,
      commission_rule_type: 'PERCENTAGE_ON_GROSS',
      commission_rate: 10,
    });
    expect(one.statusCode).toBe(201);
    sellerOneId = one.json<{ seller: { id: string } }>().seller.id;
    const two = await call(masterToken, 'POST', '/sellers', {
      name: 'Vendedora Dois',
      user_id: lite.sellerUserA2,
      commission_rule_type: 'FIXED',
      commission_fixed_amount: 40,
    });
    sellerTwoId = two.json<{ seller: { id: string } }>().seller.id;
    seller1Token = await lite.login('tenant-a', 'seller1@a.test');
    seller2Token = await lite.login('tenant-a', 'seller2@a.test');

    const category = await call(masterToken, 'POST', '/categories', { name: 'TERRESTRE' });
    categoryId = category.json<{ category: { id: string } }>().category.id;
  });

  afterAll(async () => {
    await lite?.close();
  });

  it('keeps the code catalog in sync with the database and gives MASTER every permission', async () => {
    const db = await lite.adminPool.query<{ key: string }>('SELECT key FROM permissions ORDER BY key');
    expect(db.rows.map((r) => r.key)).toEqual([...PERMISSIONS].sort());

    const master = await json<{ user: { role: string; permissions: string[] } }>(masterToken, '/auth/me');
    expect(master.user.role).toBe('MASTER');
    expect(master.user.permissions).toEqual([...PERMISSIONS].sort());

    const seller = await json<{ user: { sellerId: string; permissions: string[] } }>(seller1Token, '/auth/me');
    expect(seller.user.sellerId).toBe(sellerOneId);
    expect(seller.user.permissions).toEqual(
      expect.arrayContaining(['customers.read_own', 'sales.read_own', 'reports.sales_own']),
    );
    expect(seller.user.permissions).not.toContain('customers.read_all');
    expect(seller.user.permissions).not.toContain('finance.read');
  });

  it('assigns the portfolio to the creating seller automatically', async () => {
    const created = await call(seller1Token, 'POST', '/customers', { name: 'Cliente da Um' });
    expect(created.statusCode).toBe(201);
    const customer = created.json<{ customer: { id: string; responsible_seller_id: string } }>().customer;
    expect(customer.responsible_seller_id).toBe(sellerOneId);
    customerOfOne = customer.id;

    const other = await call(seller2Token, 'POST', '/customers', { name: 'Cliente da Dois' });
    customerOfTwo = other.json<{ customer: { id: string } }>().customer.id;

    const foreignAssignment = await call(seller1Token, 'POST', '/customers', {
      name: 'Tentativa',
      responsible_seller_id: sellerTwoId,
    });
    expect(foreignAssignment.statusCode).toBe(403);
  });

  it('scopes customers per seller and lets MASTER see all', async () => {
    const mine = await json<PageJson<{ id: string }>>(seller1Token, '/customers');
    expect(mine.items.map((c) => c.id)).toEqual([customerOfOne]);

    expect((await call(seller1Token, 'GET', `/customers/${customerOfTwo}`)).statusCode).toBe(404);
    expect((await call(seller1Token, 'PATCH', `/customers/${customerOfTwo}`, { name: 'X' })).statusCode).toBe(404);
    expect((await call(seller1Token, 'PATCH', `/customers/${customerOfOne}`, { city: 'Joinville' })).statusCode).toBe(200);

    const all = await json<PageJson<{ id: string }>>(masterToken, '/customers');
    expect(all.items.map((c) => c.id)).toEqual(expect.arrayContaining([customerOfOne, customerOfTwo]));
  });

  it('lets MASTER reassign a customer with an audit trail; a seller cannot', async () => {
    const extra = await call(seller1Token, 'POST', '/customers', { name: 'Cliente Reatribuído' });
    const id = extra.json<{ customer: { id: string } }>().customer.id;

    const sellerAttempt = await call(seller1Token, 'PATCH', `/customers/${id}`, {
      responsible_seller_id: sellerTwoId,
    });
    expect(sellerAttempt.statusCode).toBe(403);

    const reassign = await call(masterToken, 'PATCH', `/customers/${id}`, { responsible_seller_id: sellerTwoId });
    expect(reassign.statusCode).toBe(200);
    expect(reassign.json<{ customer: { responsible_seller_id: string } }>().customer.responsible_seller_id).toBe(
      sellerTwoId,
    );
    const audit = await lite.adminPool.query<{ user_id: string; metadata: Record<string, string> }>(
      `SELECT user_id, metadata FROM audit_logs WHERE event_type = 'CUSTOMER_REASSIGNED' AND entity_id = $1`,
      [id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]!.user_id).toBe(lite.masterA);
    expect(audit.rows[0]!.metadata).toMatchObject({ from_seller_id: sellerOneId, to_seller_id: sellerTwoId });

    expect((await call(seller1Token, 'GET', `/customers/${id}`)).statusCode).toBe(404);
    expect((await call(seller2Token, 'GET', `/customers/${id}`)).statusCode).toBe(200);
  });

  it('scopes sales per seller: own seller only, own customers only', async () => {
    const asOther = await createSale(seller1Token, sellerTwoId, customerOfOne, 1000, 600);
    expect(asOther.statusCode).toBe(403);
    const otherPortfolio = await createSale(seller1Token, sellerOneId, customerOfTwo, 1000, 600);
    expect(otherPortfolio.statusCode).toBe(400);

    const own = await createSale(seller1Token, sellerOneId, customerOfOne, 1000, 600);
    expect(own.statusCode).toBe(201);
    saleOfOne = own.json<{ sale: { id: string } }>().sale.id;
    expect((await call(seller1Token, 'POST', `/sales/${saleOfOne}/confirm`)).statusCode).toBe(200);

    const two = await createSale(seller2Token, sellerTwoId, customerOfTwo, 500, 200);
    saleOfTwo = two.json<{ sale: { id: string } }>().sale.id;

    expect((await call(seller1Token, 'GET', `/sales/${saleOfTwo}`)).statusCode).toBe(404);
    expect((await call(seller1Token, 'POST', `/sales/${saleOfTwo}/confirm`)).statusCode).toBe(404);
    expect((await call(seller1Token, 'PATCH', `/sales/${saleOfTwo}`, { notes: 'x' })).statusCode).toBe(404);
    expect((await call(seller1Token, 'GET', `/sales?seller_id=${sellerTwoId}`)).statusCode).toBe(403);
    expect((await call(seller1Token, 'POST', `/sales/${saleOfOne}/cancel`)).statusCode).toBe(403);

    const mine = await json<PageJson<{ id: string }>>(seller1Token, '/sales');
    expect(mine.items.map((s) => s.id)).toEqual([saleOfOne]);

    expect((await call(seller2Token, 'POST', `/sales/${saleOfTwo}/confirm`)).statusCode).toBe(200);
    const all = await json<PageJson<{ id: string }>>(masterToken, '/sales');
    expect(all.items.map((s) => s.id)).toEqual(expect.arrayContaining([saleOfOne, saleOfTwo]));
  });

  it('scopes commissions and keeps finance away from sellers', async () => {
    const mine = await json<PageJson<{ seller_id: string }>>(seller1Token, '/commissions');
    expect(mine.items).toHaveLength(1);
    expect(mine.items.every((c) => c.seller_id === sellerOneId)).toBe(true);
    expect((await call(seller1Token, 'GET', `/commissions?seller_id=${sellerTwoId}`)).statusCode).toBe(403);

    for (const url of ['/receivables', '/payables', '/payments', '/financial-accounts', '/reports/cash-flow']) {
      expect((await call(seller1Token, 'GET', url)).statusCode, url).toBe(403);
    }
    // Sale forms still need the payment methods.
    expect((await call(seller1Token, 'GET', '/payment-methods')).statusCode).toBe(200);
  });

  it('gives the seller only their own report and MASTER the consolidated one, charts matching tables', async () => {
    const own = await json<SellerReport>(seller1Token, '/reports/sellers?from=2026-08-01&to=2026-08-31');
    expect(own.items.map((i) => i.seller_id)).toEqual([sellerOneId]);
    expect(own.totals).toMatchObject({ sales_count: 1, gross_amount: 1000, margin_amount: 400, commission_amount: 100 });
    expect((await call(seller1Token, 'GET', `/reports/sellers?seller_id=${sellerTwoId}`)).statusCode).toBe(403);
    expect((await call(seller1Token, 'GET', `/reports/sales?seller_id=${sellerTwoId}`)).statusCode).toBe(403);
    const ownSales = await json<{ items: Array<{ seller_id: string }> }>(seller1Token, '/reports/sales');
    expect(ownSales.items.every((r) => r.seller_id === sellerOneId)).toBe(true);

    const all = await json<SellerReport>(masterToken, '/reports/sellers?from=2026-08-01&to=2026-08-31');
    expect(all.items.map((i) => i.seller_id)).toEqual(expect.arrayContaining([sellerOneId, sellerTwoId]));
    expect(all.totals).toMatchObject({
      sales_count: 2,
      gross_amount: 1500,
      cost_amount: 800,
      margin_amount: 700,
      pending_amount: 1500,
      commission_amount: 140,
      commission_pending_amount: 140,
    });

    for (const report of [own, all]) {
      const sum = (rows: Array<Record<string, unknown>>, field: string) =>
        Math.round(rows.reduce((acc, row) => acc + Number(row[field]), 0) * 100) / 100;
      for (const field of [
        'gross_amount',
        'cost_amount',
        'margin_amount',
        'received_amount',
        'pending_amount',
        'commission_amount',
        'commission_paid_amount',
      ]) {
        expect(sum(report.charts.by_month, field), field).toBe(report.totals[field as keyof Totals]);
      }
      expect(sum(report.charts.by_month, 'sales_count')).toBe(report.totals.sales_count);
      expect(sum(report.charts.by_category, 'gross_amount')).toBe(report.totals.gross_amount);
      expect(sum(report.charts.by_category, 'margin_amount')).toBe(report.totals.margin_amount);
    }
  });

  it('computes the same dashboard widgets inside each viewer scope', async () => {
    const value = (dash: DashboardJson, key: string) => dash.widgets.find((w) => w.key === key)?.data.value;
    const seller = await json<DashboardJson>(seller1Token, '/dashboard');
    const master = await json<DashboardJson>(masterToken, '/dashboard');

    expect(seller.can_configure).toBe(false);
    expect(master.can_configure).toBe(true);
    expect(value(seller, 'receivable')).toBe(1000);
    expect(value(master, 'receivable')).toBe(1500);
    expect(value(seller, 'pending_commissions')).toBe(100);
    expect(value(master, 'pending_commissions')).toBe(140);
    // Finance widgets are not rendered without finance.read.
    const sellerKeys = seller.widgets.map((w) => w.key);
    for (const key of ['expenses', 'payable', 'result', 'cash_flow']) {
      expect(sellerKeys).not.toContain(key);
      expect(master.widgets.map((w) => w.key)).toContain(key);
    }
  });

  it('persists the MASTER dashboard configuration and refuses it to others', async () => {
    const settings = await json<{ widgets: Array<{ key: string; enabled: boolean }> }>(
      masterToken,
      '/dashboard/settings',
    );
    expect(settings.widgets).toHaveLength(12);

    const reordered = [
      { key: 'result', enabled: true },
      ...settings.widgets.filter((w) => w.key !== 'result').map((w) => ({ key: w.key, enabled: w.key !== 'cash_flow' })),
    ];
    expect((await call(masterToken, 'PUT', '/dashboard/settings', { widgets: reordered })).statusCode).toBe(200);

    const reloaded = await json<DashboardJson>(masterToken, '/dashboard');
    expect(reloaded.widgets[0]!.key).toBe('result');
    expect(reloaded.widgets.map((w) => w.key)).not.toContain('cash_flow');
    const stored = await json<{ widgets: Array<{ key: string; enabled: boolean }> }>(masterToken, '/dashboard/settings');
    expect(stored.widgets[0]).toEqual(expect.objectContaining({ key: 'result', enabled: true }));
    expect(stored.widgets.find((w) => w.key === 'cash_flow')?.enabled).toBe(false);

    // Seller sees the same configuration, within their scope.
    const sellerView = await json<DashboardJson>(seller1Token, '/dashboard');
    expect(sellerView.widgets.map((w) => w.key)).not.toContain('cash_flow');

    expect((await call(seller1Token, 'PUT', '/dashboard/settings', { widgets: reordered })).statusCode).toBe(403);
    expect((await call(staffToken, 'GET', '/dashboard/settings')).statusCode).toBe(403);
    const missing = reordered.slice(1);
    expect((await call(masterToken, 'PUT', '/dashboard/settings', { widgets: missing })).statusCode).toBe(400);

    const audit = await lite.adminPool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'DASHBOARD_CONFIGURED'`);
    expect(audit.rowCount).toBe(1);
  });

  it('manages users without self-promotion or escalation', async () => {
    expect((await call(seller1Token, 'GET', '/users')).statusCode).toBe(403);
    expect((await call(staffToken, 'POST', '/users', {})).statusCode).toBe(403);

    const created = await call(masterToken, 'POST', '/users', {
      name: 'Nova Vendedora',
      email: 'nova@a.test',
      password: FIXTURE_PASSWORD,
      role: 'SELLER',
    });
    expect(created.statusCode).toBe(201);
    const newUserId = created.json<{ user: { id: string } }>().user.id;

    // Nobody changes their own role, MASTER included.
    expect((await call(masterToken, 'PATCH', `/users/${lite.masterA}`, { role: 'ADMIN' })).statusCode).toBe(403);

    // An ADMIN with users.manage still cannot reach MASTER: not for others, not for self.
    const grantUsers = await call(masterToken, 'PUT', `/users/${lite.adminA}/permissions`, {
      overrides: [{ permission: 'users.manage', effect: 'GRANT' }],
    });
    expect(grantUsers.statusCode).toBe(200);
    const adminToken = await lite.login('tenant-a', 'admin@a.test');
    expect((await call(adminToken, 'PATCH', `/users/${lite.adminA}`, { role: 'MASTER' })).statusCode).toBe(403);
    expect((await call(adminToken, 'PATCH', `/users/${newUserId}`, { role: 'MASTER' })).statusCode).toBe(403);
    expect((await call(adminToken, 'PATCH', `/users/${lite.masterA}`, { status: 'INACTIVE' })).statusCode).toBe(403);
    expect((await call(adminToken, 'PUT', `/users/${lite.adminA}/permissions`, { overrides: [] })).statusCode).toBe(403);

    // permissions.manage can only be granted by a MASTER.
    const grantPerms = await call(masterToken, 'PUT', `/users/${lite.adminA}/permissions`, {
      overrides: [
        { permission: 'users.manage', effect: 'GRANT' },
        { permission: 'permissions.manage', effect: 'GRANT' },
      ],
    });
    expect(grantPerms.statusCode).toBe(200);
    const adminToken2 = await lite.login('tenant-a', 'admin@a.test');
    const forward = await call(adminToken2, 'PUT', `/users/${lite.staffA}/permissions`, {
      overrides: [{ permission: 'permissions.manage', effect: 'GRANT' }],
    });
    expect(forward.statusCode).toBe(403);
    const delegated = await call(adminToken2, 'PUT', `/users/${newUserId}/permissions`, {
      overrides: [{ permission: 'finance.read', effect: 'GRANT' }],
    });
    expect(delegated.statusCode).toBe(200);

    // Role + status changes are audited and take effect on the next request.
    const sessionOfNew = await lite.login('tenant-a', 'nova@a.test');
    expect((await call(masterToken, 'PATCH', `/users/${newUserId}`, { role: 'VIEWER' })).statusCode).toBe(200);
    expect((await call(masterToken, 'PATCH', `/users/${newUserId}`, { status: 'INACTIVE' })).statusCode).toBe(200);
    expect((await call(sessionOfNew, 'GET', '/auth/me')).statusCode).toBe(401);
    const audit = await lite.adminPool.query<{ event_type: string }>(
      `SELECT event_type FROM audit_logs
        WHERE entity_id = $1 AND event_type IN ('USER_ROLE_CHANGED', 'USER_STATUS_CHANGED', 'USER_PERMISSIONS_CHANGED')
        ORDER BY created_at`,
      [newUserId],
    );
    expect(audit.rows.map((r) => r.event_type)).toEqual([
      'USER_PERMISSIONS_CHANGED',
      'USER_ROLE_CHANGED',
      'USER_STATUS_CHANGED',
    ]);
  });

  it('fails closed for a SELLER login without a linked seller', async () => {
    await call(masterToken, 'POST', '/users', {
      name: 'Sem Vínculo',
      email: 'semvinculo@a.test',
      password: FIXTURE_PASSWORD,
      role: 'SELLER',
    });
    const token = await lite.login('tenant-a', 'semvinculo@a.test');
    expect((await call(token, 'GET', '/customers')).json<PageJson<unknown>>().total).toBe(0);
    expect((await call(token, 'POST', '/customers', { name: 'Órfão' })).statusCode).toBe(403);
    expect((await call(token, 'GET', '/reports/sellers')).statusCode).toBe(403);
  });

  it('keeps tenants isolated for users, customers and the dashboard configuration', async () => {
    expect((await call(foreignAdminToken, 'GET', `/customers/${customerOfOne}`)).statusCode).toBe(404);
    expect((await call(foreignAdminToken, 'GET', `/sales/${saleOfOne}`)).statusCode).toBe(404);
    // Even a MASTER of tenant B cannot see or touch tenant A users.
    await lite.adminPool.query(`UPDATE users SET role = 'MASTER' WHERE id = $1`, [lite.adminB]);
    const foreignMaster = await lite.login('tenant-b', 'admin@b.test');
    expect((await call(foreignMaster, 'PATCH', `/users/${lite.sellerUserA1}`, { name: 'x' })).statusCode).toBe(404);
    expect((await call(foreignMaster, 'PUT', `/users/${lite.sellerUserA1}/permissions`, { overrides: [] })).statusCode).toBe(404);
    const foreignUsers = await json<{ items: Array<{ id: string }> }>(foreignMaster, '/users');
    expect(foreignUsers.items.map((u) => u.id)).not.toContain(lite.sellerUserA1);
    const foreignSettings = await json<{ widgets: Array<{ key: string; enabled: boolean }> }>(
      foreignMaster,
      '/dashboard/settings',
    );
    expect(foreignSettings.widgets.every((w) => w.enabled)).toBe(true);
    const foreignDash = await json<DashboardJson>(foreignAdminToken, '/dashboard');
    expect(foreignDash.widgets.map((w) => w.key)).toContain('cash_flow');
    const report = await json<SellerReport>(foreignAdminToken, '/reports/sellers');
    expect(report.items.map((i) => i.seller_id)).not.toContain(sellerOneId);
  });
});
