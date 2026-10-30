import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calculateCommission, type RuleVersion } from '../src/commission-engine';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

function version(overrides: Partial<RuleVersion>): RuleVersion {
  return {
    rule_id: 'r',
    rule_category_id: null,
    progressive: false,
    tiers: [],
    version_id: 'v',
    version_number: 1,
    effective_from: '2026-01-01',
    mode: 'PERCENTAGE',
    calculation_base: 'GROSS',
    value: 10,
    apply_on: 'TOTAL',
    excess_threshold: null,
    ...overrides,
  };
}

describe('calculateCommission (pure)', () => {
  const sale = { gross_amount: 1000, margin_amount: 200 };

  it('applies percentage points on gross or margin over the total', () => {
    expect(calculateCommission(version({}), sale)).toMatchObject({ amount: 100, calculation_type: 'PERCENTAGE_ON_GROSS' });
    expect(calculateCommission(version({ calculation_base: 'MARGIN', value: 4 }), sale)).toMatchObject({
      amount: 8,
      calculation_type: 'PERCENTAGE_ON_MARGIN',
      calculation_base: 200,
    });
  });

  it('applies the rate only to the part above the threshold when apply_on is EXCESS', () => {
    const result = calculateCommission(version({ apply_on: 'EXCESS', excess_threshold: 400 }), sale);
    expect(result).toMatchObject({ amount: 60 });
    expect(calculateCommission(version({ apply_on: 'EXCESS', excess_threshold: 5000 }), sale)).toMatchObject({ amount: 0 });
  });

  it('supports fixed values and rounds half away from zero', () => {
    expect(calculateCommission(version({ mode: 'FIXED', calculation_base: null, value: 75.5 }), sale)).toMatchObject({
      amount: 75.5,
      calculation_type: 'FIXED',
    });
    expect(calculateCommission(version({ value: 3.5 }), { gross_amount: 100.5, margin_amount: 0 })).toMatchObject({
      amount: 3.52,
    });
  });

  it('falls closed to PENDING_RULE without a rule or with mode NONE', () => {
    expect(calculateCommission(null, sale).pending_rule).toBe(true);
    expect(calculateCommission(version({ mode: 'NONE', calculation_base: null, value: null }), sale).pending_rule).toBe(true);
  });
});

describe('Travel Lite commission rules', () => {
  let lite: LiteFixture;
  let managerToken: string;
  let sellerToken: string;
  let staffToken: string;
  let foreignToken: string;
  let customerId: string;
  let sellerId: string;
  let otherSellerId: string;
  let categoryId: string;
  let todayDate: string;
  let tomorrow: string;
  let yesterday: string;
  let defaultRuleId: string;

  async function post<T>(token: string, url: string, payload: unknown): Promise<{ status: number; json: T }> {
    const response = await lite.app.inject({ method: 'POST', url, headers: lite.headers(token), payload: payload as object });
    return { status: response.statusCode, json: response.json<T>() };
  }

  async function sellFor(seller: string, grossAmount: number, saleDate?: string): Promise<string> {
    const created = await lite.app.inject({
      method: 'POST',
      url: '/sales',
      headers: lite.headers(staffToken),
      payload: {
        customer_id: customerId,
        seller_id: seller,
        category_id: categoryId,
        gross_amount: grossAmount,
        cost_amount: 0,
        due_date: '2026-12-15',
        installment_count: 1,
        ...(saleDate ? { sale_date: saleDate } : {}),
      },
    });
    const saleId = created.json<{ sale: { id: string } }>().sale.id;
    const confirmed = await lite.app.inject({
      method: 'POST',
      url: `/sales/${saleId}/confirm`,
      headers: lite.headers(staffToken),
    });
    expect(confirmed.statusCode).toBe(200);
    return saleId;
  }

  async function commissionOf(saleId: string) {
    const result = await lite.adminPool.query<{
      status: string;
      commission_amount: string | null;
      rule_snapshot: Record<string, unknown>;
    }>(`SELECT status, commission_amount, rule_snapshot FROM seller_commissions WHERE sale_id = $1`, [saleId]);
    return result.rows[0]!;
  }

  beforeAll(async () => {
    lite = await createLiteFixture();
    managerToken = await lite.login('tenant-a', 'admin@a.test');
    staffToken = await lite.login('tenant-a', 'staff@a.test');
    sellerToken = await lite.login('tenant-a', 'seller1@a.test');
    foreignToken = await lite.login('tenant-b', 'staff@b.test');

    const dates = await lite.adminPool.query<{ today: string; tomorrow: string; yesterday: string }>(
      `SELECT current_date::text AS today, (current_date + 1)::text AS tomorrow, (current_date - 1)::text AS yesterday`,
    );
    todayDate = dates.rows[0]!.today;
    tomorrow = dates.rows[0]!.tomorrow;
    yesterday = dates.rows[0]!.yesterday;

    const customer = await lite.app.inject({
      method: 'POST',
      url: '/customers',
      headers: lite.headers(staffToken),
      payload: { name: 'Cliente Regras', email: 'regras@cliente.test' },
    });
    customerId = customer.json<{ customer: { id: string } }>().customer.id;
    const category = await lite.app.inject({
      method: 'POST',
      url: '/categories',
      headers: lite.headers(managerToken),
      payload: { name: 'REGRAS' },
    });
    categoryId = category.json<{ category: { id: string } }>().category.id;
    for (const [name, assign] of [
      ['Vendedor Sem Regra', (id: string) => (sellerId = id)],
      ['Outro Vendedor', (id: string) => (otherSellerId = id)],
    ] as const) {
      const seller = await lite.app.inject({
        method: 'POST',
        url: '/sellers',
        headers: lite.headers(staffToken),
        payload: { name },
      });
      assign(seller.json<{ seller: { id: string } }>().seller.id);
    }
  });

  afterAll(async () => {
    await lite?.close();
  });

  it('does not let a seller manage rules and validates the version shape', async () => {
    const denied = await post(sellerToken, '/commission-rules', {
      name: 'x', mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 5, effective_from: todayDate,
    });
    expect(denied.status).toBe(403);

    for (const bad of [
      { mode: 'PERCENTAGE', value: 5 },
      { mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 150 },
      { mode: 'FIXED', value: 10, calculation_base: 'GROSS' },
      { mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 5, apply_on: 'EXCESS' },
      { mode: 'NONE', value: 5 },
    ]) {
      const result = await post(managerToken, '/commission-rules', { name: 'bad', effective_from: todayDate, ...bad });
      expect(result.status).toBe(400);
    }
  });

  it('uses the agency default rule and snapshots the rule lineage', async () => {
    const created = await post<{ id: string }>(managerToken, '/commission-rules', {
      name: 'Padrão da agência', mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 10, effective_from: todayDate,
    });
    expect(created.status).toBe(201);
    defaultRuleId = created.json.id;

    const commission = await commissionOf(await sellFor(sellerId, 1000));
    expect(commission).toMatchObject({ status: 'PENDING', commission_amount: '100.00' });
    expect(commission.rule_snapshot).toMatchObject({ rule_id: defaultRuleId, calc_version: 1 });

    const duplicate = await post(managerToken, '/commission-rules', {
      name: 'Outro padrão', mode: 'FIXED', value: 1, effective_from: todayDate,
    });
    expect(duplicate.status).toBe(409);
  });

  it('prefers the seller+category rule over the seller rule and the default', async () => {
    const sellerRule = await post<{ id: string }>(managerToken, '/commission-rules', {
      name: 'Vendedor', seller_id: otherSellerId, mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 20, effective_from: todayDate,
    });
    expect(sellerRule.status).toBe(201);
    expect((await commissionOf(await sellFor(otherSellerId, 1000))).commission_amount).toBe('200.00');

    await post(managerToken, '/commission-rules', {
      name: 'Vendedor + categoria', seller_id: otherSellerId, category_id: categoryId,
      mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 30, effective_from: todayDate,
    });
    expect((await commissionOf(await sellFor(otherSellerId, 1000))).commission_amount).toBe('300.00');
  });

  it('applies EXCESS only above the threshold', async () => {
    const created = await post<{ id: string }>(managerToken, '/commission-rules', {
      name: 'Excedente', seller_id: sellerId, mode: 'PERCENTAGE', calculation_base: 'GROSS',
      value: 10, apply_on: 'EXCESS', excess_threshold: 500, effective_from: todayDate,
    });
    expect(created.status).toBe(201);
    const commission = await commissionOf(await sellFor(sellerId, 1000));
    expect(commission.commission_amount).toBe('50.00');
    expect(commission.rule_snapshot).toMatchObject({ apply_on: 'EXCESS', excess_threshold: 500, computed_on: 500 });
  });

  it('revises by appending versions: future dates do not affect today, no retroactivity', async () => {
    const rules = await lite.app.inject({ method: 'GET', url: '/commission-rules', headers: lite.headers(managerToken) });
    const sellerRule = rules.json<{ items: Array<{ id: string; seller_id: string | null; category_id: string | null }> }>().items.find(
      (r) => r.seller_id === sellerId,
    )!;

    const retro = await post(managerToken, `/commission-rules/${sellerRule.id}/versions`, {
      mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 99, effective_from: yesterday, reason: 'tentativa retroativa',
    });
    expect(retro.status).toBe(400);

    const noReason = await post(managerToken, `/commission-rules/${sellerRule.id}/versions`, {
      mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 12, effective_from: tomorrow,
    });
    expect(noReason.status).toBe(400);

    const future = await post(managerToken, `/commission-rules/${sellerRule.id}/versions`, {
      mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 12, effective_from: tomorrow, reason: 'novo patamar',
    });
    expect(future.status).toBe(201);

    expect((await commissionOf(await sellFor(sellerId, 1000))).commission_amount).toBe('50.00');
    expect((await commissionOf(await sellFor(sellerId, 1000, tomorrow))).commission_amount).toBe('120.00');

    const detail = await lite.app.inject({
      method: 'GET',
      url: `/commission-rules/${sellerRule.id}`,
      headers: lite.headers(managerToken),
    });
    const versions = detail.json<{ versions: Array<{ version_number: number; value: number }> }>().versions;
    expect(versions.map((v) => v.version_number)).toEqual([2, 1]);
    expect(versions[1]?.value).toBe(10);

    const audit = await lite.adminPool.query(
      `SELECT 1 FROM audit_logs WHERE event_type = 'COMMISSION_RULE_REVISED' AND entity_id = $1`,
      [sellerRule.id],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('keeps versions append-only for the runtime role', async () => {
    const grants = await lite.adminPool.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE table_name = 'commission_rule_versions' AND grantee = 'travel_lite_runtime'`,
    );
    expect(grants.rows.map((g) => g.privilege_type).sort()).toEqual(['INSERT', 'SELECT']);
  });

  it('mirrors legacy seller rule edits as revisions and resolves PENDING_RULE through the engine', async () => {
    const created = await lite.app.inject({
      method: 'POST',
      url: '/sellers',
      headers: lite.headers(staffToken),
      payload: { name: 'Vendedor Legado' },
    });
    const legacyId = created.json<{ seller: { id: string } }>().seller.id;
    // A default rule applies to everyone, so disable it for this check.
    await post(managerToken, `/commission-rules/${defaultRuleId}/archive`, {});

    const pendingSale = await sellFor(legacyId, 1000);
    expect((await commissionOf(pendingSale)).status).toBe('PENDING_RULE');

    const patch = await lite.app.inject({
      method: 'PATCH',
      url: `/sellers/${legacyId}`,
      headers: lite.headers(managerToken),
      payload: { commission_rule_type: 'PERCENTAGE_ON_GROSS', commission_rate: 5 },
    });
    expect(patch.statusCode).toBe(200);
    const resolved = await commissionOf(pendingSale);
    expect(resolved).toMatchObject({ status: 'PENDING', commission_amount: '50.00' });
    expect(resolved.rule_snapshot).toMatchObject({ recalculated: true });

    await lite.app.inject({
      method: 'PATCH',
      url: `/sellers/${legacyId}`,
      headers: lite.headers(managerToken),
      payload: { commission_rule_type: 'UNDEFINED' },
    });
    const versions = await lite.adminPool.query<{ mode: string }>(
      `SELECT v.mode FROM commission_rule_versions v JOIN commission_rules r ON r.id = v.rule_id
        WHERE r.seller_id = $1 ORDER BY v.version_number`,
      [legacyId],
    );
    expect(versions.rows.map((v) => v.mode)).toEqual(['PERCENTAGE', 'NONE']);
    expect((await commissionOf(await sellFor(legacyId, 1000))).status).toBe('PENDING_RULE');
  });

  it('shows a seller only the rules that can apply to them and isolates tenants', async () => {
    const own = await lite.app.inject({ method: 'GET', url: '/commission-rules', headers: lite.headers(sellerToken) });
    expect(own.statusCode).toBe(200);
    const ownItems = own.json<{ items: Array<{ seller_id: string | null }> }>().items;
    const sellerLinked = await lite.adminPool.query<{ id: string }>(
      `SELECT s.id FROM sellers s JOIN users u ON u.id = s.user_id WHERE u.email = 'seller1@a.test'`,
    );
    const mine = sellerLinked.rows[0]?.id ?? null;
    expect(ownItems.every((r) => r.seller_id === null || r.seller_id === mine)).toBe(true);

    const foreign = await lite.app.inject({ method: 'GET', url: '/commission-rules', headers: lite.headers(foreignToken) });
    expect(foreign.statusCode).toBe(200);
    expect(foreign.json<{ items: unknown[] }>().items).toHaveLength(0);
    const foreignDetail = await lite.app.inject({
      method: 'GET',
      url: `/commission-rules/${defaultRuleId}`,
      headers: lite.headers(foreignToken),
    });
    expect([403, 404]).toContain(foreignDetail.statusCode);
  });

  it('rolls back rule creation when the required audit row cannot be written', async () => {
    await lite.adminPool.query(`
      CREATE FUNCTION test_block_rule_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.event_type = 'COMMISSION_RULE_CREATED' THEN RAISE EXCEPTION 'audit blocked'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await lite.adminPool.query(
      `CREATE TRIGGER test_block_rule_audit BEFORE INSERT ON audit_logs
         FOR EACH ROW EXECUTE FUNCTION test_block_rule_audit()`,
    );
    try {
      const blocked = await post(managerToken, '/commission-rules', {
        name: 'Sem auditoria', seller_id: sellerId, category_id: categoryId,
        mode: 'FIXED', value: 5, effective_from: todayDate,
      });
      expect(blocked.status).toBe(500);
      const rows = await lite.adminPool.query(`SELECT 1 FROM commission_rules WHERE name = 'Sem auditoria'`);
      expect(rows.rowCount).toBe(0);
    } finally {
      await lite.adminPool.query('DROP TRIGGER test_block_rule_audit ON audit_logs');
      await lite.adminPool.query('DROP FUNCTION test_block_rule_audit()');
    }
  });
});
