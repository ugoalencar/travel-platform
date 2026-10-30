import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveReleaseMode } from '../src/commission-release-policy';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

describe('resolveReleaseMode: the same contract as the Full resolveReleasePolicy (COM-03)', () => {
  it('a sale without payment method is BLOCKED', () => {
    expect(resolveReleaseMode({ hasPaymentMethod: false, requiresReceipt: null, hasActiveProfile: true }))
      .toEqual({ mode: 'BLOCKED', missing: ['PAYMENT_METHOD_NOT_SET'] });
  });
  it('an undecided method rule is BLOCKED even with a profile', () => {
    expect(resolveReleaseMode({ hasPaymentMethod: true, requiresReceipt: null, hasActiveProfile: true }))
      .toEqual({ mode: 'BLOCKED', missing: ['PAYMENT_METHOD_RECEIPT_RULE_UNSET'] });
  });
  it('requires receipt without an active profile is BLOCKED', () => {
    expect(resolveReleaseMode({ hasPaymentMethod: true, requiresReceipt: true, hasActiveProfile: false }))
      .toEqual({ mode: 'BLOCKED', missing: ['FINANCIAL_PROFILE_NOT_ACTIVE'] });
  });
  it('collects everything that is missing', () => {
    expect(resolveReleaseMode({ hasPaymentMethod: false, requiresReceipt: null, hasActiveProfile: false }))
      .toEqual({ mode: 'BLOCKED', missing: ['PAYMENT_METHOD_NOT_SET', 'FINANCIAL_PROFILE_NOT_ACTIVE'] });
  });
  it('explicit "no receipt required" resolves ON_SALE without a profile; "required" resolves ON_RECEIPT', () => {
    expect(resolveReleaseMode({ hasPaymentMethod: true, requiresReceipt: false, hasActiveProfile: false })).toEqual({ mode: 'ON_SALE', missing: [] });
    expect(resolveReleaseMode({ hasPaymentMethod: true, requiresReceipt: true, hasActiveProfile: true })).toEqual({ mode: 'ON_RECEIPT', missing: [] });
  });
});

describe('Travel Lite commission release policy over HTTP (COM-03)', () => {
  let lite: LiteFixture;
  let managerToken: string;
  let staffToken: string;
  let customerId: string;
  let categoryId: string;
  let accountId: string;
  let sellerId: string;

  async function call<T>(token: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) {
    const response = await lite.app.inject({ method, url, headers: lite.headers(token), ...(payload === undefined ? {} : { payload: payload as object }) });
    return { status: response.statusCode, json: response.json<T>() };
  }

  /** Test-only: the profile is append-only, so the guard trigger is lifted just to reset it. */
  async function resetProfiles(): Promise<void> {
    await lite.adminPool.query('ALTER TABLE commission_financial_profiles DISABLE TRIGGER commission_financial_profiles_immutable');
    await lite.adminPool.query('DELETE FROM commission_financial_profiles WHERE tenant_id = $1', [lite.tenantA]);
    await lite.adminPool.query('ALTER TABLE commission_financial_profiles ENABLE TRIGGER commission_financial_profiles_immutable');
  }

  async function sellAndApprove(methodId: string | null) {
    const created = await call<{ sale: { id: string } }>(staffToken, 'POST', '/sales', {
      customer_id: customerId, seller_id: sellerId, category_id: categoryId, gross_amount: 1000, cost_amount: 0,
      due_date: '2027-12-15', installment_count: 2, ...(methodId ? { payment_method_id: methodId } : {}),
    });
    expect(created.status).toBe(201);
    const saleId = created.json.sale.id;
    expect((await call(staffToken, 'POST', `/sales/${saleId}/confirm`)).status).toBe(200);
    const commission = await lite.adminPool.query<{ id: string }>('SELECT id FROM seller_commissions WHERE sale_id = $1', [saleId]);
    const commissionId = commission.rows[0]!.id;
    expect((await call(managerToken, 'POST', `/commissions/${commissionId}/approve`, {})).status).toBe(200);
    const payable = await lite.adminPool.query<{ id: string }>('SELECT id FROM payables WHERE commission_id = $1', [commissionId]);
    return { saleId, commissionId, payableId: payable.rows[0]!.id };
  }

  const pay = (payableId: string) => call<{ error?: string }>(managerToken, 'POST', `/payables/${payableId}/pay`, { account_id: accountId });
  const modeOf = async (commissionId: string) =>
    (await lite.adminPool.query<{ release_mode: string; release_blocked_missing: string[] | null }>('SELECT release_mode, release_blocked_missing FROM seller_commissions WHERE id = $1', [commissionId])).rows[0]!;

  beforeAll(async () => {
    lite = await createLiteFixture();
    managerToken = await lite.login('tenant-a', 'admin@a.test');
    staffToken = await lite.login('tenant-a', 'staff@a.test');
    const today = (await lite.adminPool.query<{ d: string }>('SELECT current_date::text AS d')).rows[0]!.d;
    customerId = (await call<{ customer: { id: string } }>(staffToken, 'POST', '/customers', { name: 'Cliente Política', email: 'pol@cliente.test' })).json.customer.id;
    categoryId = (await call<{ category: { id: string } }>(managerToken, 'POST', '/categories', { name: 'POLITICA' })).json.category.id;
    accountId = (await call<{ account: { id: string } }>(managerToken, 'POST', '/financial-accounts', { name: 'Caixa', type: 'CASH' })).json.account.id;
    sellerId = (await call<{ seller: { id: string } }>(staffToken, 'POST', '/sellers', { name: 'Vendedor Política' })).json.seller.id;
    expect((await call(managerToken, 'POST', '/commission-rules', {
      name: 'Regra política', seller_id: sellerId, effective_from: today, mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 10,
    })).status).toBe(201);
  });

  afterAll(async () => {
    await lite?.close();
  });

  it('a sale without payment method gets a BLOCKED commission that cannot be paid and names what is missing', async () => {
    const { commissionId, payableId } = await sellAndApprove(null);
    expect(await modeOf(commissionId)).toMatchObject({ release_mode: 'BLOCKED', release_blocked_missing: ['PAYMENT_METHOD_NOT_SET'] });
    const listed = await call<{ items: Array<{ id: string; release_mode: string; released_amount: number | null }> }>(managerToken, 'GET', '/commissions?pageSize=100');
    expect(listed.json.items.find((c) => c.id === commissionId)).toMatchObject({ release_mode: 'BLOCKED', released_amount: 0 });
    const attempt = await pay(payableId);
    expect(attempt.status).toBe(409);
    expect(attempt.json.error).toContain('COMMISSION_RELEASE_POLICY_MISSING');
  });

  it('a payment method created without the flag is undecided: the commission is BLOCKED until the rule is decided, then unblocks', async () => {
    const methodId = (await call<{ paymentMethod: { id: string } }>(managerToken, 'POST', '/payment-methods', { name: 'Forma indecisa' })).json.paymentMethod.id;
    const listed = await call<{ items: Array<{ id: string; receipt_rule_decided: boolean }> }>(managerToken, 'GET', '/payment-methods');
    expect(listed.json.items.find((m) => m.id === methodId)?.receipt_rule_decided).toBe(false);

    const { commissionId, payableId } = await sellAndApprove(methodId);
    expect(await modeOf(commissionId)).toMatchObject({ release_mode: 'BLOCKED', release_blocked_missing: ['PAYMENT_METHOD_RECEIPT_RULE_UNSET'] });
    expect((await pay(payableId)).status).toBe(409);

    expect((await call(managerToken, 'PATCH', `/payment-methods/${methodId}`, { requires_receipt: false })).status).toBe(200);
    expect((await pay(payableId)).status).toBe(200);
    expect(await modeOf(commissionId)).toMatchObject({ release_mode: 'ON_SALE', release_blocked_missing: null });
  });

  it('a method that requires receipt without an active profile blocks; creating the profile unblocks and releases by receipt', async () => {
    await resetProfiles();
    const methodId = (await call<{ paymentMethod: { id: string } }>(managerToken, 'POST', '/payment-methods', { name: 'Cartão sem perfil', requires_receipt: true })).json.paymentMethod.id;
    const { commissionId, payableId } = await sellAndApprove(methodId);
    expect(await modeOf(commissionId)).toMatchObject({ release_mode: 'BLOCKED', release_blocked_missing: ['FINANCIAL_PROFILE_NOT_ACTIVE'] });
    const config = await call<{ blocked: boolean; missing: string[] }>(managerToken, 'GET', '/commission-release/config');
    expect(config.json).toMatchObject({ blocked: true, missing: expect.arrayContaining(['FINANCIAL_PROFILE_NOT_ACTIVE']) as string[] });
    expect((await pay(payableId)).status).toBe(409);

    expect((await call(managerToken, 'POST', '/commission-release/financial-profiles', { effect: 'SOMENTE_LIBERACAO', effective_from: '2020-01-01' })).status).toBe(201);
    // nothing received yet -> released 0, still refused (ON_RECEIPT), but no longer for a missing configuration
    const afterProfile = await pay(payableId);
    expect(afterProfile.status).toBe(409);
    expect(afterProfile.json.error).not.toContain('COMMISSION_RELEASE_POLICY_MISSING');
    expect(afterProfile.json.error).toContain('follows the sale receipts');

    // receiving the installments releases the commission through the unblocked ON_RECEIPT policy
    const receivables = await lite.adminPool.query<{ id: string }>("SELECT id FROM receivables WHERE sale_id = (SELECT sale_id FROM seller_commissions WHERE id = $1) ORDER BY installment_number", [commissionId]);
    for (const row of receivables.rows) expect((await call(managerToken, 'POST', `/receivables/${row.id}/receive`, { account_id: accountId })).status).toBe(200);
    expect((await pay(payableId)).status).toBe(200);
    expect(await modeOf(commissionId)).toMatchObject({ release_mode: 'ON_RECEIPT', release_blocked_missing: null });
  });

  it('only an administrator creates the profile; it is append-only and a future profile is not in force', async () => {
    expect((await call(staffToken, 'POST', '/commission-release/financial-profiles', { effect: 'SOMENTE_LIBERACAO', effective_from: '2020-01-01' })).status).toBe(403);
    expect((await call(managerToken, 'POST', '/commission-release/financial-profiles', { effect: 'OUTRO', effective_from: '2020-01-01' })).status).toBe(400);
    await resetProfiles();
    expect((await call(managerToken, 'POST', '/commission-release/financial-profiles', { effect: 'SOMENTE_LIBERACAO', effective_from: '2999-01-01' })).status).toBe(201);
    const config = await call<{ profiles: Array<{ active: boolean }>; blocked: boolean }>(managerToken, 'GET', '/commission-release/config');
    expect(config.json.profiles.map((p) => p.active)).toEqual([false]);
    expect(config.json.blocked).toBe(true);
    await expect(lite.adminPool.query("UPDATE commission_financial_profiles SET effect = 'META_E_LIBERACAO'")).rejects.toThrow(/append-only/);
    await expect(lite.runtimePool.query('DELETE FROM commission_financial_profiles')).rejects.toThrow();
  });

  it('migration 016 keeps the behaviour of an existing tenant identical: seeded profile + already-decided methods', async () => {
    const seed = `INSERT INTO commission_financial_profiles (tenant_id, effect, effective_from, reason)
      SELECT t.id, 'SOMENTE_LIBERACAO', DATE '2000-01-01', 'Migrado' FROM tenants t
       WHERE t.id = $1 AND NOT EXISTS (SELECT 1 FROM commission_financial_profiles p WHERE p.tenant_id = t.id)`;
    const count = async () =>
      (await lite.adminPool.query<{ n: number }>('SELECT count(*)::int AS n FROM commission_financial_profiles WHERE tenant_id = $1', [lite.tenantA])).rows[0]!.n;
    // an existing tenant before 016: methods with requires_receipt already set, no profile; the migration seed runs
    await resetProfiles();
    await lite.adminPool.query(seed, [lite.tenantA]);
    expect(await count()).toBe(1);
    const legacy = await lite.adminPool.query<{ id: string }>(
      `INSERT INTO payment_methods (tenant_id, name, requires_receipt) VALUES ($1, 'Legado cartão', true), ($1, 'Legado pix', false) RETURNING id`,
      [lite.tenantA],
    );
    const [card, pix] = legacy.rows.map((r) => r.id);
    const cardSale = await sellAndApprove(card!);
    const pixSale = await sellAndApprove(pix!);
    expect(await modeOf(cardSale.commissionId)).toMatchObject({ release_mode: 'ON_RECEIPT' });
    expect(await modeOf(pixSale.commissionId)).toMatchObject({ release_mode: 'ON_SALE' });
    // nothing is released for free: ON_RECEIPT still waits for the money, ON_SALE pays as before
    expect((await pay(cardSale.payableId)).status).toBe(409);
    expect((await pay(pixSale.payableId)).status).toBe(200);
    // the seed is idempotent
    await lite.adminPool.query(seed, [lite.tenantA]);
    expect(await count()).toBe(1);
  });

  it('tenant B does not see tenant A profiles', async () => {
    const tokenB = await lite.login('tenant-b', 'admin@b.test');
    const config = await call<{ profiles: unknown[] }>(tokenB, 'GET', '/commission-release/config');
    expect(config.status).toBe(200);
    expect(config.json.profiles).toHaveLength(1); // only B's own fixture profile
  });
});
