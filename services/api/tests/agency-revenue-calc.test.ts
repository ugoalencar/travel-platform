import { describe, expect, it } from 'vitest';
import {
  calculateSaleRevenue,
  resolveRuleVersion,
  type RevenueItemInput,
  type RevenueRule,
  type RuleCandidate,
} from '../src/agency-revenue-calc';

const rule = (over: Partial<RevenueRule>): RevenueRule => ({
  ruleVersionId: 'v1',
  mode: 'PERCENTAGE',
  baseSelector: 'LINE_TOTAL',
  value: 7,
  collectionModel: 'AGENCY_COLLECTS',
  ...over,
});
const item = (over: Partial<RevenueItemInput>): RevenueItemInput => ({
  itemId: 'i1',
  supplierId: 's1',
  qty: 1,
  unitPrice: 1000,
  discount: 0,
  taxes: 0,
  fees: 0,
  lineMargin: 0,
  passengerCount: 1,
  rule: rule({}),
  ...over,
});

describe('agency revenue calculation (ADR-007 reference cases)', () => {
  it('keeps an item without a supplier pending even with an applicable rule', () => {
    expect(calculateSaleRevenue([item({ supplierId: null })])[0]).toMatchObject({
      status: 'PENDING_RULE', amount: 0, ruleVersionId: null,
    });
  });

  it('D4: rounds fixed 1.005 half-up to 1.01', () => {
    expect(calculateSaleRevenue([item({ rule: rule({ mode: 'FIXED_PER_ITEM', baseSelector: null, value: 1.005 }) })])[0]?.amount).toBe(1.01);
  });

  it('D4: multiplies 0.014 by four passengers before rounding to 0.06', () => {
    expect(calculateSaleRevenue([item({ passengerCount: 4, rule: rule({ mode: 'FIXED_PER_PASSENGER', baseSelector: null, value: 0.014 }) })])[0]?.amount).toBe(0.06);
  });

  it('R1: 7% of 1,000.00 LINE_TOTAL = 70.00', () => {
    const [entry] = calculateSaleRevenue([item({})]);
    expect(entry).toMatchObject({ status: 'FORECAST', amount: 70, base: 1000 });
  });

  it('R2: fixed per passenger 25.00 x 4 = 100.00, x 3 = 75.00', () => {
    const fixed = rule({ mode: 'FIXED_PER_PASSENGER', baseSelector: null, value: 25 });
    expect(calculateSaleRevenue([item({ rule: fixed, passengerCount: 4 })])[0]?.amount).toBe(100);
    expect(calculateSaleRevenue([item({ rule: fixed, passengerCount: 3 })])[0]?.amount).toBe(75);
  });

  it('R3: MSC cruise 10% only on R$ 4,000.00 taxes = R$ 400.00, not on R$ 12,000.00', () => {
    const [entry] = calculateSaleRevenue([
      item({ unitPrice: 8000, taxes: 4000, rule: rule({ baseSelector: 'TAXES', value: 10 }) }),
    ]);
    expect(entry).toMatchObject({ amount: 400, base: 4000 });
  });

  it('R4: air with several suppliers and different percentages = 505.00 on 5,150.00', () => {
    const entries = calculateSaleRevenue([
      item({ itemId: 'a', supplierId: 'A', unitPrice: 2000, rule: rule({ ruleVersionId: 'rA', value: 5 }) }),
      item({ itemId: 'b', supplierId: 'B', unitPrice: 3000, rule: rule({ ruleVersionId: 'rB', value: 12 }) }),
      item({ itemId: 'c', supplierId: 'C', unitPrice: 150, rule: rule({ ruleVersionId: 'rC', value: 30 }) }),
    ]);
    expect(entries.map((entry) => entry.amount)).toEqual([100, 360, 45]);
    expect(entries.reduce((sum, entry) => sum + entry.amount, 0)).toBe(505);
    expect(entries.map((entry) => entry.ruleVersionId)).toEqual(['rA', 'rB', 'rC']);
  });

  it('R5: 333.33 @ 7% = 23.33', () => {
    expect(calculateSaleRevenue([item({ unitPrice: 333.33 })])[0]?.amount).toBe(23.33);
  });

  it('R6: 18.50 @ 3% = 0.56 (half-up, decimal safe)', () => {
    expect(calculateSaleRevenue([item({ unitPrice: 18.5, rule: rule({ value: 3 }) })])[0]?.amount).toBe(0.56);
  });

  it('R7: an item without an applicable rule is PENDING_RULE with zero revenue', () => {
    const [entry] = calculateSaleRevenue([item({ rule: null })]);
    expect(entry).toMatchObject({ status: 'PENDING_RULE', amount: 0, ruleVersionId: null });
  });

  it('rounds per item and sums the rounded items (no rounding of the total)', () => {
    const entries = calculateSaleRevenue([
      item({ itemId: 'x', unitPrice: 0.05, rule: rule({ value: 10 }) }),
      item({ itemId: 'y', unitPrice: 0.05, rule: rule({ value: 10 }) }),
    ]);
    expect(entries.map((entry) => entry.amount)).toEqual([0.01, 0.01]);
  });

  it('bases: NET_FARE excludes taxes and fees, TAXES_AND_FEES sums them, discount reduces the fare', () => {
    const base = { unitPrice: 500, qty: 2, discount: 100, taxes: 80, fees: 20 };
    const run = (baseSelector: RevenueRule['baseSelector']) =>
      calculateSaleRevenue([item({ ...base, rule: rule({ baseSelector, value: 10 }) })])[0]?.base;
    expect(run('NET_FARE')).toBe(900);
    expect(run('TAXES')).toBe(80);
    expect(run('FEES')).toBe(20);
    expect(run('TAXES_AND_FEES')).toBe(100);
    expect(run('LINE_TOTAL')).toBe(1000);
  });

  it('MARGIN base is only valid when the agency collects; otherwise the item is PENDING_RULE', () => {
    const margin = (collectionModel: RevenueRule['collectionModel']) =>
      calculateSaleRevenue([
        item({ lineMargin: 200, rule: rule({ baseSelector: 'MARGIN', value: 50, collectionModel }) }),
      ])[0];
    expect(margin('AGENCY_COLLECTS')).toMatchObject({ amount: 100, base: 200 });
    expect(margin('SUPPLIER_COLLECTS')?.status).toBe('PENDING_RULE');
  });

  it('FIXED_PER_SALE applies once per rule version across the items of the sale', () => {
    const fixed = rule({ mode: 'FIXED_PER_SALE', baseSelector: null, value: 40, ruleVersionId: 'fx' });
    const entries = calculateSaleRevenue([item({ itemId: 'a', rule: fixed }), item({ itemId: 'b', rule: fixed })]);
    expect(entries.map((entry) => entry.amount)).toEqual([40, 0]);
  });

  it('FIXED_PER_ITEM applies to each item; NONE yields zero without pending', () => {
    const perItem = rule({ mode: 'FIXED_PER_ITEM', baseSelector: null, value: 15 });
    expect(calculateSaleRevenue([item({ itemId: 'a', rule: perItem }), item({ itemId: 'b', rule: perItem })]).map((e) => e.amount)).toEqual([15, 15]);
    const none = calculateSaleRevenue([item({ rule: rule({ mode: 'NONE', baseSelector: null, value: 0 }) })])[0];
    expect(none).toMatchObject({ amount: 0, status: 'FORECAST' });
  });

  it('keeps a full memory of the calculation (snapshot) on every entry', () => {
    const [entry] = calculateSaleRevenue([item({})]);
    expect(entry?.memory).toMatchObject({ mode: 'PERCENTAGE', baseSelector: 'LINE_TOTAL', rate: 7, base: 1000, calcVersion: 1 });
  });

  it('rejects non-finite or negative inputs', () => {
    expect(() => calculateSaleRevenue([item({ unitPrice: Number.NaN })])).toThrow();
    expect(() => calculateSaleRevenue([item({ rule: rule({ value: -1 }) })])).toThrow();
    expect(() => calculateSaleRevenue([item({ rule: rule({ value: 101 }) })])).toThrow();
  });
});

describe('resolveRuleVersion (precedence and effective date)', () => {
  const candidate = (over: Partial<RuleCandidate>): RuleCandidate => ({
    ruleVersionId: 'v',
    productId: null,
    supplierId: null,
    categoryId: null,
    versionNumber: 1,
    effectiveFrom: '2026-01-01',
    rule: rule({}),
    ...over,
  });
  const ctx = { productId: 'p1', supplierId: 's1', categoryId: 'c1', onDate: '2026-10-24' };

  it('picks product+supplier > product > supplier+category > supplier > category > agency default', () => {
    const all = [
      candidate({ ruleVersionId: 'default' }),
      candidate({ ruleVersionId: 'category', categoryId: 'c1' }),
      candidate({ ruleVersionId: 'supplier', supplierId: 's1' }),
      candidate({ ruleVersionId: 'supplier+category', supplierId: 's1', categoryId: 'c1' }),
      candidate({ ruleVersionId: 'product', productId: 'p1' }),
      candidate({ ruleVersionId: 'product+supplier', productId: 'p1', supplierId: 's1' }),
    ];
    const order: string[] = [];
    let pool = all;
    while (pool.length > 0) {
      const found = resolveRuleVersion(pool, ctx);
      order.push(found?.ruleVersionId ?? 'none');
      pool = pool.filter((entry) => entry.ruleVersionId !== found?.ruleVersionId);
    }
    expect(order).toEqual(['product+supplier', 'product', 'supplier+category', 'supplier', 'category', 'default']);
  });

  it('ignores scopes that do not match the item', () => {
    expect(resolveRuleVersion([candidate({ supplierId: 'other' })], ctx)).toBeNull();
    expect(resolveRuleVersion([], ctx)).toBeNull();
  });

  it('uses the latest version effective on the date, never a future one; same day: highest version', () => {
    const found = resolveRuleVersion(
      [
        candidate({ ruleVersionId: 'v1', versionNumber: 1, effectiveFrom: '2026-01-01' }),
        candidate({ ruleVersionId: 'v2', versionNumber: 2, effectiveFrom: '2026-10-01' }),
        candidate({ ruleVersionId: 'v3', versionNumber: 3, effectiveFrom: '2026-12-01' }),
        candidate({ ruleVersionId: 'v2b', versionNumber: 4, effectiveFrom: '2026-10-01' }),
      ],
      ctx,
    );
    expect(found?.ruleVersionId).toBe('v2b');
  });
});
