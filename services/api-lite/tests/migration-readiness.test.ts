import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

const CHECK_IDS = [
  'tenant_identity',
  'users_email',
  'users_master',
  'sellers_linked',
  'customers_cpf',
  'sales_status',
  'ledger_balance',
  'commissions_state',
  'outbox_health',
] as const;

type CheckId = (typeof CHECK_IDS)[number];

interface ReadinessFinding {
  id: string;
  check: CheckId;
  severity: 'BLOCKER' | 'WARNING' | 'INFO';
  problem: string;
  entity: string;
  affected: number;
  impact: string;
  action: string;
  owner: string;
}

interface ReadinessReport {
  generatedAt: string;
  ready: boolean;
  summary: { blockers: number; warnings: number; infos: number };
  checks: Array<{ id: CheckId; label: string; status: 'OK' | 'ATTENTION' | 'BLOCKED' }>;
  findings: ReadinessFinding[];
  totals: {
    users: { active: number };
    customers: { invalidCpf: number };
    sales: { cancelled: number; confirmedWithoutReceivables: number };
    receivables: { paidMismatch: number };
    payables: { paidMismatch: number };
    outbox: { failed: number };
    commissions: { pendingRule: number };
  };
}

describe('Travel Lite migration readiness', () => {
  let lite: LiteFixture;
  let masterToken: string;
  let staffToken: string;
  let viewerToken: string;
  let sellerToken: string;

  beforeAll(async () => {
    lite = await createLiteFixture();
    masterToken = await lite.login('tenant-a', 'master@a.test');
    staffToken = await lite.login('tenant-a', 'staff@a.test');
    viewerToken = await lite.login('tenant-a', 'viewer@a.test');
    sellerToken = await lite.login('tenant-a', 'seller1@a.test');
  });

  afterAll(async () => {
    await lite?.close();
  });

  function getReport(token?: string) {
    return lite.app.inject({
      method: 'GET',
      url: '/migration/readiness',
      ...(token ? { headers: lite.headers(token) } : {}),
    });
  }

  function findingIds(report: ReadinessReport, severity: ReadinessFinding['severity']): string[] {
    return report.findings
      .filter((finding) => finding.severity === severity)
      .map((finding) => finding.id)
      .sort();
  }

  async function tableCounts() {
    const result = await lite.adminPool.query<{
      users: number;
      customers: number;
      sales: number;
      receivables: number;
      payments: number;
      outbox: number;
      audit: number;
    }>(`SELECT
      (SELECT count(*) FROM users)::int AS users,
      (SELECT count(*) FROM customers)::int AS customers,
      (SELECT count(*) FROM sales)::int AS sales,
      (SELECT count(*) FROM receivables)::int AS receivables,
      (SELECT count(*) FROM payments)::int AS payments,
      (SELECT count(*) FROM integration_outbox)::int AS outbox,
      (SELECT count(*) FROM audit_logs)::int AS audit`);
    return result.rows[0]!;
  }

  it('returns the full report shape for a MASTER', async () => {
    const response = await getReport(masterToken);
    expect(response.statusCode).toBe(200);

    const report = response.json<ReadinessReport>();
    expect(Number.isNaN(Date.parse(report.generatedAt))).toBe(false);
    expect(report.checks.map((check) => check.id)).toEqual([...CHECK_IDS]);
    expect(report.checks.every((check) => check.label.length > 0)).toBe(true);
    expect(typeof report.ready).toBe('boolean');
    expect(report.totals.users.active).toBeGreaterThan(0);

    // Clean fixture: only the two SELLER logins without a seller link.
    expect(report.ready).toBe(true);
    expect(report.summary).toEqual({ blockers: 0, warnings: 1, infos: 0 });
    expect(findingIds(report, 'WARNING')).toEqual(['SELLER_LOGINS_UNLINKED']);
    expect(findingIds(report, 'INFO')).toEqual([]);
    expect(report.checks.find((check) => check.id === 'sellers_linked')?.status).toBe('ATTENTION');
    expect(report.checks.find((check) => check.id === 'tenant_identity')?.status).toBe('OK');

    const warning = report.findings[0]!;
    expect(warning.affected).toBe(2);
    expect(warning.entity).toBe('sellers');
    expect(warning.owner.length).toBeGreaterThan(0);
    expect(warning.problem.length).toBeGreaterThan(0);
    expect(warning.impact.length).toBeGreaterThan(0);
    expect(warning.action.length).toBeGreaterThan(0);
  });

  it('never exposes row values such as e-mails', async () => {
    const response = await getReport(masterToken);
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('@a.test');
    expect(response.body).not.toContain('not-an-email');
  });

  it('is read-only', async () => {
    const before = await tableCounts();
    await getReport(masterToken);
    await getReport(masterToken);
    const after = await tableCounts();
    expect(after).toEqual(before);
  });

  it('rejects callers without users.manage and anonymous requests', async () => {
    expect((await getReport(staffToken)).statusCode).toBe(403);
    expect((await getReport(viewerToken)).statusCode).toBe(403);
    expect((await getReport(sellerToken)).statusCode).toBe(403);
    expect((await getReport()).statusCode).toBe(401);
  });

  it('is also exposed under the /api prefix', async () => {
    const response = await lite.app.inject({
      method: 'GET',
      url: '/api/migration/readiness',
      headers: lite.headers(masterToken),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<ReadinessReport>().checks).toHaveLength(9);
  });

  it('flags an invalid tenant name and slug as blockers', async () => {
    await lite.adminPool.query("UPDATE tenants SET name = ' ', slug = 'Invalid Slug!' WHERE id = $1", [
      lite.tenantA,
    ]);
    try {
      const report = (await getReport(masterToken)).json<ReadinessReport>();
      expect(report.ready).toBe(false);
      expect(report.summary.blockers).toBe(2);
      expect(findingIds(report, 'BLOCKER')).toEqual(['TENANT_NAME_INVALID', 'TENANT_SLUG_INVALID']);
      expect(report.checks.find((check) => check.id === 'tenant_identity')?.status).toBe('BLOCKED');
      for (const finding of report.findings) {
        if (finding.check === 'tenant_identity') expect(finding.owner).toBe('MASTER');
      }
    } finally {
      await lite.adminPool.query("UPDATE tenants SET name = 'Tenant A', slug = 'tenant-a' WHERE id = $1", [
        lite.tenantA,
      ]);
    }
  });

  it('flags data-quality problems across checks', async () => {
    const tenantId = lite.tenantA;
    const seeded = await lite.adminPool.query<{
      customerId: string;
      sellerId: string;
      categoryId: string;
      confirmedSaleId: string;
      cancelledSaleId: string;
      accountId: string;
    }>(
      `WITH customer AS (
         INSERT INTO customers (tenant_id, name, cpf)
         VALUES ($1, 'Cliente CPF Ruim', '111.111.111-11') RETURNING id
       ), seller AS (
         INSERT INTO sellers (tenant_id, name)
         VALUES ($1, 'Vendedor Sem Regra') RETURNING id
       ), category AS (
         INSERT INTO sale_categories (tenant_id, name)
         VALUES ($1, 'Categoria Readiness') RETURNING id
       ), confirmed_sale AS (
         INSERT INTO sales (tenant_id, customer_id, seller_id, category_id, sale_number,
                            gross_amount, margin_amount, due_date, status)
         SELECT $1, customer.id, seller.id, category.id, 'READ-001', 100, 100, CURRENT_DATE, 'CONFIRMED'
           FROM customer, seller, category
         RETURNING id
       ), cancelled_sale AS (
         INSERT INTO sales (tenant_id, customer_id, seller_id, category_id, sale_number,
                            gross_amount, margin_amount, due_date, status)
         SELECT $1, customer.id, seller.id, category.id, 'READ-002', 100, 100, CURRENT_DATE, 'CANCELLED'
           FROM customer, seller, category
         RETURNING id
       ), account AS (
         INSERT INTO financial_accounts (tenant_id, name)
         VALUES ($1, 'Conta Readiness') RETURNING id
       )
       SELECT customer.id AS "customerId", seller.id AS "sellerId", category.id AS "categoryId",
              confirmed_sale.id AS "confirmedSaleId", cancelled_sale.id AS "cancelledSaleId",
              account.id AS "accountId"
         FROM customer, seller, category, confirmed_sale, cancelled_sale, account`,
      [tenantId],
    );
    const ids = seeded.rows[0]!;

    await lite.adminPool.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES ($1, 'E-mail Ruim', 'not-an-email', 'x', 'VIEWER')`,
      [tenantId],
    );
    await lite.adminPool.query(
      `INSERT INTO receivables (tenant_id, description, amount, paid_amount, due_at, status)
       VALUES ($1, 'Recebível dessincronizado', 100, 50, CURRENT_DATE, 'PARTIALLY_PAID')`,
      [tenantId],
    );
    await lite.adminPool.query(
      `INSERT INTO payables (tenant_id, description, amount, paid_amount, due_at, status)
       VALUES ($1, 'Pagamento a fornecedor dessincronizado', 100, 40, CURRENT_DATE, 'PARTIALLY_PAID')`,
      [tenantId],
    );
    await lite.adminPool.query(
      `INSERT INTO payments (tenant_id, direction, account_id, amount)
       VALUES ($1, 'IN', $2, 100)`,
      [tenantId, ids.accountId],
    );
    await lite.adminPool.query(
      `INSERT INTO seller_commissions (tenant_id, sale_id, seller_id, status, commission_amount)
       VALUES ($1, $2, $3, 'APPROVED', 30)`,
      [tenantId, ids.confirmedSaleId, ids.sellerId],
    );
    await lite.adminPool.query(
      `INSERT INTO seller_commissions (tenant_id, sale_id, seller_id, status, commission_amount)
       VALUES ($1, $2, $3, 'PENDING', 25)`,
      [tenantId, ids.cancelledSaleId, ids.sellerId],
    );
    await lite.adminPool.query(
      `INSERT INTO integration_outbox (tenant_id, event_type, entity_type, entity_id, status)
       VALUES ($1, 'CUSTOMER_CREATED', 'customer', gen_random_uuid(), 'FAILED'),
              ($1, 'CUSTOMER_UPDATED', 'customer', gen_random_uuid(), 'PENDING')`,
      [tenantId],
    );

    const report = (await getReport(masterToken)).json<ReadinessReport>();

    expect(report.ready).toBe(false);
    expect(findingIds(report, 'BLOCKER')).toEqual([
      'COMMISSIONS_APPROVED_WITHOUT_PAYABLE',
      'COMMISSIONS_ON_CANCELLED_SALE',
      'OUTBOX_FAILED',
      'PAYABLES_PAID_MISMATCH',
      'RECEIVABLES_PAID_MISMATCH',
    ]);
    expect(findingIds(report, 'WARNING')).toEqual([
      'CUSTOMERS_INVALID_CPF',
      'PAYMENTS_WITHOUT_ALLOCATION',
      'SALES_CONFIRMED_WITHOUT_RECEIVABLES',
      'SELLERS_NO_COMMISSION_RULE',
      'SELLER_LOGINS_UNLINKED',
      'USERS_INVALID_EMAIL',
    ]);
    expect(findingIds(report, 'INFO')).toEqual(['OUTBOX_PENDING']);

    expect(report.checks.find((check) => check.id === 'ledger_balance')?.status).toBe('BLOCKED');
    expect(report.checks.find((check) => check.id === 'commissions_state')?.status).toBe('BLOCKED');
    expect(report.checks.find((check) => check.id === 'outbox_health')?.status).toBe('BLOCKED');
    expect(report.checks.find((check) => check.id === 'users_email')?.status).toBe('ATTENTION');
    expect(report.checks.find((check) => check.id === 'users_master')?.status).toBe('OK');

    expect(report.totals.customers.invalidCpf).toBe(1);
    expect(report.totals.sales.confirmedWithoutReceivables).toBe(1);
    expect(report.totals.sales.cancelled).toBe(1);
    expect(report.totals.receivables.paidMismatch).toBe(1);
    expect(report.totals.payables.paidMismatch).toBe(1);
    expect(report.totals.outbox.failed).toBe(1);
    expect(report.totals.commissions.pendingRule).toBe(0);

    const invalidEmail = report.findings.find((finding) => finding.id === 'USERS_INVALID_EMAIL')!;
    expect(invalidEmail.affected).toBe(1);
    expect(invalidEmail.owner).toBe('MASTER');
    const unbalanced = report.findings.find((finding) => finding.id === 'RECEIVABLES_PAID_MISMATCH')!;
    expect(unbalanced.owner).toBe('ADMIN ou MANAGER');
  });
});
