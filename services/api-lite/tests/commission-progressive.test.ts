import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calculateCommission, type RuleVersion } from '../src/commission-engine';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

const TIERS = [
  { tier_number: 1, from_amount: 0, to_amount: 1000, rate: 10 },
  { tier_number: 2, from_amount: 1000, to_amount: 3000, rate: 20 },
  { tier_number: 3, from_amount: 3000, to_amount: null, rate: 30 },
];

function progressive(overrides: Partial<RuleVersion> = {}): RuleVersion {
  return {
    rule_id: 'r',
    rule_category_id: null,
    version_id: 'v',
    version_number: 1,
    effective_from: '2026-01-01',
    mode: 'PERCENTAGE',
    calculation_base: 'GROSS',
    value: 10,
    apply_on: 'TOTAL',
    excess_threshold: null,
    progressive: true,
    tiers: TIERS,
    ...overrides,
  };
}

describe('calculateCommission with progressive tiers (pure)', () => {
  it('uses only the first tier while the goal is not reached', () => {
    expect(calculateCommission(progressive(), { gross_amount: 600, margin_amount: 0 }, 0)).toMatchObject({ amount: 60 });
  });

  it('splits a sale that crosses a goal between the old and the new rate', () => {
    const result = calculateCommission(progressive(), { gross_amount: 800, margin_amount: 0 }, 600);
    expect(result).toMatchObject({ amount: 120, calculation_base: 800, percentage: null });
    expect(result.snapshot).toMatchObject({
      progressive: true,
      accumulated_before: 600,
      slices: [
        { tier: 1, amount_on: 400, rate: 10, commission: 40 },
        { tier: 2, amount_on: 400, rate: 20, commission: 80 },
      ],
    });
  });

  it('can span several tiers and uses the open-ended last tier', () => {
    // 500 -> 3500: 500@10 + 2000@20 + 500@30
    expect(calculateCommission(progressive(), { gross_amount: 3000, margin_amount: 0 }, 500)).toMatchObject({
      amount: 50 + 400 + 150,
    });
    expect(calculateCommission(progressive(), { gross_amount: 1000, margin_amount: 0 }, 5000)).toMatchObject({ amount: 300 });
  });

  it('applies a 3% -> 4% step as exactly one percentage point on the slice above the goal', () => {
    const version = progressive({
      tiers: [
        { tier_number: 1, from_amount: 0, to_amount: 10000, rate: 3 },
        { tier_number: 2, from_amount: 10000, to_amount: null, rate: 4 },
      ],
    });
    expect(calculateCommission(version, { gross_amount: 2000, margin_amount: 0 }, 9000)).toMatchObject({
      amount: 30 + 40,
    });
  });

  it('uses the margin as base when configured', () => {
    const result = calculateCommission(progressive({ calculation_base: 'MARGIN' }), { gross_amount: 9999, margin_amount: 500 }, 0);
    expect(result).toMatchObject({ amount: 50, calculation_type: 'PERCENTAGE_ON_MARGIN' });
  });
});

describe('Travel Lite progressive commission rules', () => {
  let lite: LiteFixture;
  let managerToken: string;
  let staffToken: string;
  let customerId: string;
  let sellerA: string;
  let sellerB: string;
  let categoryId: string;
  let todayDate: string;
  const months: string[] = [];

  async function post<T>(token: string, url: string, payload: unknown): Promise<{ status: number; json: T }> {
    const response = await lite.app.inject({ method: 'POST', url, headers: lite.headers(token), payload: payload as object });
    return { status: response.statusCode, json: response.json<T>() };
  }

  async function createSale(seller: string, gross: number, saleDate: string): Promise<string> {
    const created = await post<{ sale: { id: string } }>(staffToken, '/sales', {
      customer_id: customerId,
      seller_id: seller,
      category_id: categoryId,
      gross_amount: gross,
      cost_amount: 0,
      due_date: '2027-12-15',
      installment_count: 1,
      sale_date: saleDate,
    });
    expect(created.status).toBe(201);
    return created.json.sale.id;
  }

  async function confirm(saleId: string): Promise<void> {
    const response = await lite.app.inject({ method: 'POST', url: `/sales/${saleId}/confirm`, headers: lite.headers(staffToken) });
    expect(response.statusCode).toBe(200);
  }

  async function sell(seller: string, gross: number, saleDate: string): Promise<string> {
    const saleId = await createSale(seller, gross, saleDate);
    await confirm(saleId);
    return saleId;
  }

  async function commissionOf(saleId: string) {
    const result = await lite.adminPool.query<{ commission_amount: string; status: string; rule_snapshot: Record<string, unknown> }>(
      `SELECT commission_amount, status, rule_snapshot FROM seller_commissions WHERE sale_id = $1 AND status <> 'CANCELLED'`,
      [saleId],
    );
    return result.rows[0]!;
  }

  const tiersPayload = [
    { from_amount: 0, to_amount: 1000, rate: 10 },
    { from_amount: 1000, to_amount: 3000, rate: 20 },
    { from_amount: 3000, to_amount: null, rate: 30 },
  ];

  beforeAll(async () => {
    lite = await createLiteFixture();
    managerToken = await lite.login('tenant-a', 'admin@a.test');
    staffToken = await lite.login('tenant-a', 'staff@a.test');

    const dates = await lite.adminPool.query<{ today: string; m1: string; m2: string; m3: string }>(
      `SELECT current_date::text AS today,
              (date_trunc('month', current_date) + interval '1 month' + interval '9 days')::date::text AS m1,
              (date_trunc('month', current_date) + interval '2 months' + interval '9 days')::date::text AS m2,
              (date_trunc('month', current_date) + interval '3 months' + interval '9 days')::date::text AS m3`,
    );
    todayDate = dates.rows[0]!.today;
    months.push(dates.rows[0]!.m1, dates.rows[0]!.m2, dates.rows[0]!.m3);

    const customer = await post<{ customer: { id: string } }>(staffToken, '/customers', { name: 'Cliente Metas', email: 'metas@cliente.test' });
    customerId = customer.json.customer.id;
    const category = await post<{ category: { id: string } }>(managerToken, '/categories', { name: 'METAS' });
    categoryId = category.json.category.id;
    const a = await post<{ seller: { id: string } }>(staffToken, '/sellers', { name: 'Vendedor A' });
    sellerA = a.json.seller.id;
    const b = await post<{ seller: { id: string } }>(staffToken, '/sellers', { name: 'Vendedor B' });
    sellerB = b.json.seller.id;
  });

  afterAll(async () => {
    await lite?.close();
  });

  it('validates the tier chain', async () => {
    const base = { name: 'Metas', mode: 'PERCENTAGE', calculation_base: 'GROSS', progressive: true, effective_from: todayDate };
    const bad: Array<Record<string, unknown>> = [
      {},
      { tiers: [{ from_amount: 0, to_amount: null, rate: 10 }] },
      { tiers: [{ from_amount: 100, to_amount: 500, rate: 10 }, { from_amount: 500, to_amount: null, rate: 20 }] },
      { tiers: [{ from_amount: 0, to_amount: 500, rate: 10 }, { from_amount: 600, to_amount: null, rate: 20 }] },
      { tiers: [{ from_amount: 0, to_amount: 500, rate: 10 }, { from_amount: 500, to_amount: 900, rate: 20 }] },
      { tiers: [{ from_amount: 0, to_amount: 500, rate: 10 }, { from_amount: 500, to_amount: null, rate: 120 }] },
      { tiers: tiersPayload, value: 5 },
      { tiers: tiersPayload, apply_on: 'EXCESS', excess_threshold: 10 },
      { tiers: tiersPayload, mode: 'FIXED' },
    ];
    for (const extra of bad) {
      const result = await post(managerToken, '/commission-rules', { ...base, ...extra });
      expect(result.status).toBe(400);
    }
    const stray = await post(managerToken, '/commission-rules', { name: 'x', mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 5, effective_from: todayDate, tiers: tiersPayload });
    expect(stray.status).toBe(400);
  });

  it('creates the progressive default rule and exposes its tiers', async () => {
    const created = await post<{ id: string }>(managerToken, '/commission-rules', {
      name: 'Metas mensais', mode: 'PERCENTAGE', calculation_base: 'GROSS', progressive: true, tiers: tiersPayload, effective_from: todayDate,
    });
    expect(created.status).toBe(201);
    const detail = await lite.app.inject({ method: 'GET', url: `/commission-rules/${created.json.id}`, headers: lite.headers(managerToken) });
    const version = detail.json<{ versions: Array<{ progressive: boolean; value: number; tiers: Array<{ rate: number; to_amount: number | null }> }> }>().versions[0]!;
    expect(version.progressive).toBe(true);
    expect(version.tiers.map((t) => t.rate)).toEqual([10, 20, 30]);
    expect(version.tiers.at(-1)?.to_amount).toBeNull();
    expect(version.value).toBe(10);

    const list = await lite.app.inject({ method: 'GET', url: '/commission-rules', headers: lite.headers(managerToken) });
    expect(list.json<{ items: Array<{ progressive: boolean; tiers: unknown[] }> }>().items[0]).toMatchObject({ progressive: true });
  });

  it('raises the rate within the month as the goal is reached, per seller', async () => {
    const [m1] = months;
    const first = await sell(sellerA, 600, m1!);
    expect((await commissionOf(first)).commission_amount).toBe('60.00');

    const second = await sell(sellerA, 800, m1!);
    const secondCommission = await commissionOf(second);
    expect(secondCommission.commission_amount).toBe('120.00');
    expect(secondCommission.rule_snapshot).toMatchObject({ progressive: true, accumulated_before: 600 });

    // Seller B accumulates on its own.
    expect((await commissionOf(await sell(sellerB, 600, m1!))).commission_amount).toBe('60.00');

    // The earlier commission is never rewritten by the later, higher tier.
    expect((await commissionOf(first)).commission_amount).toBe('60.00');

    const third = await sell(sellerA, 3000, m1!);
    expect((await commissionOf(third)).commission_amount).toBe('740.00');
  });

  it('does not count cancelled sales and restarts in the next month', async () => {
    const [m1, m2] = months;
    const lastSale = await lite.adminPool.query<{ id: string }>(
      `SELECT id FROM sales WHERE seller_id = $1 AND gross_amount = 3000 AND sale_date = $2`,
      [sellerA, m1],
    );
    const cancel = await lite.app.inject({ method: 'POST', url: `/sales/${lastSale.rows[0]!.id}/cancel`, headers: lite.headers(managerToken) });
    expect(cancel.statusCode).toBe(200);

    // Accumulated is back to 1400 (600 + 800): 1600@20 + 1400@30.
    expect((await commissionOf(await sell(sellerA, 3000, m1!))).commission_amount).toBe('740.00');
    expect((await commissionOf(await sell(sellerA, 600, m2!))).commission_amount).toBe('60.00');
  });

  it('serializes concurrent confirmations of the same seller and month', async () => {
    const m3 = months[2]!;
    const a = await createSale(sellerB, 600, m3);
    const b = await createSale(sellerB, 800, m3);
    await Promise.all([confirm(a), confirm(b)]);
    const total = await lite.adminPool.query<{ total: string }>(
      `SELECT sum(commission_amount)::text AS total FROM seller_commissions WHERE sale_id = ANY($1::uuid[])`,
      [[a, b]],
    );
    // 1400 accumulated either way: 1000@10 + 400@20 = 180 (without the lock both would start at 0).
    expect(total.rows[0]?.total).toBe('180.00');
  });

  it('keeps tiers append-only for the runtime role', async () => {
    const grants = await lite.adminPool.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE table_name = 'commission_rule_tiers' AND grantee = 'travel_lite_runtime'`,
    );
    expect(grants.rows.map((g) => g.privilege_type).sort()).toEqual(['INSERT', 'SELECT']);
  });
});
