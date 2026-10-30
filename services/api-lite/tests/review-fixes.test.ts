import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calculateCommission, type RuleVersion } from '../src/commission-engine';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

/** Regression tests for the Codex review of 2026-10-22 (REVISAO-CODEX-LITE-FINANCEIRO). */
describe('Codex review regressions', () => {
  let lite: LiteFixture;
  let managerToken: string;
  let staffToken: string;
  let customerId: string;
  let categoryId: string;
  let accountId: string;
  let todayDate: string;
  let cardMethod: string;

  async function call<T = Record<string, unknown>>(token: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) {
    const response = await lite.app.inject({
      method,
      url,
      headers: lite.headers(token),
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return { status: response.statusCode, json: response.json<T>() };
  }

  async function seller(name: string, percent = 10): Promise<string> {
    const created = await call<{ seller: { id: string } }>(staffToken, 'POST', '/sellers', { name });
    const sellerId = created.json.seller.id;
    const rule = await call(managerToken, 'POST', '/commission-rules', {
      name: `Regra ${name}`, seller_id: sellerId, mode: 'PERCENTAGE', calculation_base: 'GROSS', value: percent, effective_from: todayDate,
    });
    expect(rule.status).toBe(201);
    return sellerId;
  }

  let cashMethodId = '';
  async function sale(sellerId: string, gross: number, methodId?: string | null, installments = 1) {
    const created = await call<{ sale: { id: string } }>(staffToken, 'POST', '/sales', {
      customer_id: customerId, seller_id: sellerId, category_id: categoryId, gross_amount: gross, cost_amount: 0,
      due_date: '2027-12-15', installment_count: installments, ...(methodId === null ? {} : { payment_method_id: methodId ?? cashMethodId }),
    });
    expect(created.status).toBe(201);
    return created.json.sale.id;
  }

  async function confirmAndApprove(saleId: string) {
    expect((await call(staffToken, 'POST', `/sales/${saleId}/confirm`)).status).toBe(200);
    const commission = (await lite.adminPool.query<{ id: string }>(`SELECT id FROM seller_commissions WHERE sale_id = $1`, [saleId])).rows[0]!.id;
    expect((await call(managerToken, 'POST', `/commissions/${commission}/approve`, {})).status).toBe(200);
    const payable = (await lite.adminPool.query<{ id: string }>(`SELECT id FROM payables WHERE commission_id = $1`, [commission])).rows[0]!.id;
    return { commissionId: commission, payableId: payable };
  }

  beforeAll(async () => {
    lite = await createLiteFixture();
    managerToken = await lite.login('tenant-a', 'admin@a.test');
    staffToken = await lite.login('tenant-a', 'staff@a.test');
    todayDate = (await lite.adminPool.query<{ d: string }>(`SELECT current_date::text AS d`)).rows[0]!.d;
    customerId = (await call<{ customer: { id: string } }>(staffToken, 'POST', '/customers', { name: 'Cliente Revisão', email: 'rev@cliente.test' })).json.customer.id;
    categoryId = (await call<{ category: { id: string } }>(managerToken, 'POST', '/categories', { name: 'REVISAO' })).json.category.id;
    accountId = (await call<{ account: { id: string } }>(managerToken, 'POST', '/financial-accounts', { name: 'Caixa', type: 'CASH' })).json.account.id;
    cardMethod = (await call<{ paymentMethod: { id: string } }>(managerToken, 'POST', '/payment-methods', { name: 'Cartão', requires_receipt: true })).json.paymentMethod.id;
    cashMethodId = (await call<{ paymentMethod: { id: string } }>(managerToken, 'POST', '/payment-methods', { name: 'Dinheiro', requires_receipt: false })).json.paymentMethod.id;
  });

  afterAll(async () => {
    await lite?.close();
  });

  it('1. sale detail returns the related objects the screen reads', async () => {
    const sellerId = await seller('Vendedora Detalhe');
    const saleId = await sale(sellerId, 1000, cardMethod, 2);
    for (const step of ['draft', 'confirmed']) {
      if (step === 'confirmed') expect((await call(staffToken, 'POST', `/sales/${saleId}/confirm`)).status).toBe(200);
      const detail = await call<{ sale: Record<string, unknown> }>(staffToken, 'GET', `/sales/${saleId}`);
      expect(detail.status).toBe(200);
      expect(detail.json.sale).toMatchObject({
        id: saleId,
        customer: { id: customerId, name: 'Cliente Revisão' },
        seller: { id: sellerId, name: 'Vendedora Detalhe' },
        category: { id: categoryId, name: 'REVISAO' },
        payment_method: { id: cardMethod, name: 'Cartão' },
      });
    }
    const noMethod = await sale(sellerId, 500, null);
    const plain = await call<{ sale: { payment_method: unknown } }>(staffToken, 'GET', `/sales/${noMethod}`);
    expect(plain.json.sale.payment_method).toBeNull();
  });

  it('2. an approved commission cannot be overridden away from its payable; pending overrides keep the calculation memory', async () => {
    const sellerId = await seller('Vendedor Override');
    const saleId = await sale(sellerId, 1000);
    const { commissionId, payableId } = await confirmAndApprove(saleId);

    const override = await call(managerToken, 'PATCH', `/commissions/${commissionId}`, { commission_amount: 50 });
    expect(override.status).toBe(409);
    const row = await lite.adminPool.query<{ commission_amount: string }>(`SELECT commission_amount FROM seller_commissions WHERE id = $1`, [commissionId]);
    expect(row.rows[0]?.commission_amount).toBe('100.00');
    expect((await call(managerToken, 'POST', `/payables/${payableId}/pay`, { account_id: accountId })).status).toBe(200);
    const paid = await lite.adminPool.query<{ paid_amount: string }>(`SELECT paid_amount FROM payables WHERE id = $1`, [payableId]);
    expect(paid.rows[0]?.paid_amount).toBe('100.00');

    const pendingSale = await sale(sellerId, 1000);
    expect((await call(staffToken, 'POST', `/sales/${pendingSale}/confirm`)).status).toBe(200);
    const pending = (await lite.adminPool.query<{ id: string }>(`SELECT id FROM seller_commissions WHERE sale_id = $1`, [pendingSale])).rows[0]!.id;
    expect((await call(managerToken, 'PATCH', `/commissions/${pending}`, { commission_amount: 80 })).status).toBe(200);
    const after = await lite.adminPool.query<{ commission_amount: string; rule_snapshot: Record<string, unknown> }>(
      `SELECT commission_amount, rule_snapshot FROM seller_commissions WHERE id = $1`,
      [pending],
    );
    expect(after.rows[0]?.commission_amount).toBe('80.00');
    expect(after.rows[0]?.rule_snapshot).toMatchObject({ overridden: true, manual: true, previous_amount: 100, rule_type: 'PERCENTAGE_ON_GROSS', rate: 10 });
    const audit = await lite.adminPool.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit_logs WHERE event_type = 'COMMISSION_OVERRIDE' AND entity_id = $1`,
      [pending],
    );
    expect(audit.rows[0]?.metadata).toMatchObject({ amount: 80, previous_amount: 100 });
  });

  it('3. the legacy seller fields need commissions.rules_manage and leave an audit trail', async () => {
    const sellerId = await seller('Vendedor Legado');
    const userId = (await lite.adminPool.query<{ id: string }>(`SELECT id FROM users WHERE email = 'admin@a.test'`)).rows[0]!.id;
    await lite.adminPool.query(
      `INSERT INTO user_permissions (tenant_id, user_id, permission, effect)
       SELECT tenant_id, id, 'commissions.rules_manage', 'REVOKE' FROM users WHERE id = $1`,
      [userId],
    );
    try {
      const versions = () => lite.adminPool.query(`SELECT 1 FROM commission_rule_versions v JOIN commission_rules r ON r.id = v.rule_id WHERE r.seller_id = $1`, [sellerId]);
      const before = (await versions()).rowCount;

      expect((await call(managerToken, 'POST', `/commission-rules/${(await lite.adminPool.query<{ id: string }>(`SELECT id FROM commission_rules WHERE seller_id = $1`, [sellerId])).rows[0]!.id}/versions`, {
        mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 99, effective_from: todayDate, reason: 'tentativa',
      })).status).toBe(403);
      expect((await call(managerToken, 'PATCH', `/sellers/${sellerId}`, { commission_rule_type: 'PERCENTAGE_ON_GROSS', commission_rate: 99 })).status).toBe(403);
      expect((await call(managerToken, 'POST', '/sellers', { name: 'Novo com regra', commission_rule_type: 'FIXED', commission_fixed_amount: 10 })).status).toBe(403);
      expect((await versions()).rowCount).toBe(before);

      // Seller data without commission fields is still allowed.
      expect((await call(managerToken, 'PATCH', `/sellers/${sellerId}`, { phone: '47999990000' })).status).toBe(200);
      expect((await call(managerToken, 'POST', '/sellers', { name: 'Novo sem regra' })).status).toBe(201);
    } finally {
      await lite.adminPool.query(`DELETE FROM user_permissions WHERE user_id = $1 AND permission = 'commissions.rules_manage'`, [userId]);
    }

    const allowed = await call(managerToken, 'PATCH', `/sellers/${sellerId}`, { commission_rule_type: 'PERCENTAGE_ON_GROSS', commission_rate: 12 });
    expect(allowed.status).toBe(200);
    const audit = await lite.adminPool.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM audit_logs WHERE event_type = 'COMMISSION_RULE_REVISED' AND metadata->>'source' = 'seller_legacy_fields'`,
    );
    expect(audit.rowCount).toBeGreaterThan(0);
  });

  it('4. a receipt that released already paid commission cannot be reversed', async () => {
    const sellerId = await seller('Vendedor Estorno');
    const saleId = await sale(sellerId, 1000, cardMethod, 1);
    const { payableId } = await confirmAndApprove(saleId);
    const receivable = (await lite.adminPool.query<{ id: string }>(`SELECT id FROM receivables WHERE sale_id = $1`, [saleId])).rows[0]!.id;
    expect((await call(managerToken, 'POST', `/receivables/${receivable}/receive`, { account_id: accountId })).status).toBe(200);
    expect((await call(managerToken, 'POST', `/payables/${payableId}/pay`, { account_id: accountId })).status).toBe(200);

    const payment = (await lite.adminPool.query<{ id: string }>(
      `SELECT p.id FROM payments p JOIN payment_allocations a ON a.payment_id = p.id WHERE a.receivable_id = $1 AND p.direction = 'IN'`,
      [receivable],
    )).rows[0]!.id;
    const reversal = await call(managerToken, 'POST', `/payments/${payment}/reverse`, { reason: 'cartão estornado' });
    expect(reversal.status).toBe(409);

    const state = await lite.adminPool.query<{ paid_amount: string; status: string }>(`SELECT paid_amount, status FROM receivables WHERE id = $1`, [receivable]);
    expect(state.rows[0]).toMatchObject({ paid_amount: '1000.00', status: 'PAID' });
    const reversals = await lite.adminPool.query(`SELECT 1 FROM payments WHERE reversal_of_payment_id = $1`, [payment]);
    expect(reversals.rowCount).toBe(0);
    const commission = await lite.adminPool.query<{ status: string }>(`SELECT status FROM seller_commissions WHERE sale_id = $1`, [saleId]);
    expect(commission.rows[0]?.status).toBe('PAID');
  });

  it('5. the progressive total equals the sum of the recorded slices', () => {
    const version: RuleVersion = {
      rule_id: 'r', rule_category_id: null, version_id: 'v', version_number: 1, effective_from: '2026-01-01',
      mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 1, apply_on: 'TOTAL', excess_threshold: null, progressive: true,
      tiers: [
        { tier_number: 1, from_amount: 0, to_amount: 0.5, rate: 1 },
        { tier_number: 2, from_amount: 0.5, to_amount: null, rate: 1 },
      ],
    };
    const result = calculateCommission(version, { gross_amount: 1, margin_amount: 0 }, 0);
    if (result.pending_rule) throw new Error('expected a calculation');
    const slices = (result.snapshot.slices as Array<{ commission: number }>).map((slice) => slice.commission);
    expect(slices).toEqual([0.01, 0.01]);
    expect(result.amount).toBe(0.02);
    expect(result.amount).toBe(Math.round(slices.reduce((sum, value) => sum + value, 0) * 100) / 100);
  });
});
