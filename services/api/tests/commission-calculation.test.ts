import { describe, expect, it } from 'vitest';
import {
  COMMISSION_CALC_VERSION,
  calculateCommission,
  selectEffectiveVersion,
  sliceAcrossTiers,
  type CommissionRuleVersion,
} from '../src/commission-calculation';

const tiers = [
  { tier_number: 1, from_amount: 0, to_amount: 50_000, rate: 3 },
  { tier_number: 2, from_amount: 50_000, to_amount: 100_000, rate: 4 },
  { tier_number: 3, from_amount: 100_000, to_amount: null, rate: 5 },
];

function version(partial: Partial<CommissionRuleVersion>): CommissionRuleVersion {
  return {
    scope_id: 's1', version_id: 'v1', version_number: 1, effective_from: '2026-01-01',
    mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 3, apply_on: 'TOTAL', excess_threshold: null,
    progressive: false, tiers: [], ...partial,
  };
}

describe('commission calculation (pure; same oracle as the Lite engine)', () => {
  it('CALC-07: accumulated 45.000 + base 20.000 crosses the first tier -> 750,00', () => {
    const result = calculateCommission(version({ progressive: true, tiers }), { gross_amount: 20_000, margin_amount: 5_000 }, 45_000);
    expect(result).toMatchObject({ pending_rule: false, amount: 750 });
    expect(result.pending_rule === false && result.snapshot).toMatchObject({
      progressive: true, accumulated_before: 45_000, calc_version: COMMISSION_CALC_VERSION,
      slices: [{ tier: 1, amount_on: 5_000, commission: 150 }, { tier: 2, amount_on: 15_000, commission: 600 }],
    });
  });

  it('CALC-08: accumulated 45.000 + base 70.000 crosses two tiers -> 2.900,00', () => {
    const result = calculateCommission(version({ progressive: true, tiers }), { gross_amount: 70_000, margin_amount: 0 }, 45_000);
    expect(result).toMatchObject({ amount: 2_900 });
  });

  it('TOTAL tier mode applies the reached rate to the whole accumulated monthly base', () => {
    const result = calculateCommission(version({ progressive: true, tier_mode: 'TOTAL', tiers }),
      { gross_amount: 20_000, margin_amount: 0 }, 45_000);
    expect(result).toMatchObject({ amount: 2_600 });
    expect(result.pending_rule === false && result.snapshot).toMatchObject({ tier_mode: 'TOTAL', reached_rate: 4 });
  });

  it('a base entirely inside one tier uses that tier only', () => {
    expect(sliceAcrossTiers(tiers, 60_000, 10_000)).toEqual([
      { tier: 2, from_amount: 50_000, to_amount: 100_000, rate: 4, amount_on: 10_000, commission: 400 },
    ]);
  });

  it('percentage on gross and on margin', () => {
    const sale = { gross_amount: 1_000, margin_amount: 200 };
    expect(calculateCommission(version({}), sale)).toMatchObject({ amount: 30, calculation_type: 'PERCENTAGE_ON_GROSS', calculation_base: 1_000 });
    expect(calculateCommission(version({ calculation_base: 'MARGIN' }), sale)).toMatchObject({ amount: 6, calculation_type: 'PERCENTAGE_ON_MARGIN', calculation_base: 200 });
  });

  it('SUPPLIER_SOLD_TOTAL calculates only the supplier amount and snapshots the selected base', () => {
    const result = calculateCommission(version({ calculation_base: 'SUPPLIER_SOLD_TOTAL', value: 1 }),
      { gross_amount: 20_000, margin_amount: 0, supplier_sold_total: 10_000 });
    expect(result).toMatchObject({ amount: 100, calculation_type: 'PERCENTAGE_ON_SUPPLIER_SOLD_TOTAL', calculation_base: 10_000 });
    expect(result.pending_rule === false && result.snapshot).toMatchObject({ rule_type: 'PERCENTAGE_ON_SUPPLIER_SOLD_TOTAL' });
    expect(() => calculateCommission(version({ calculation_base: 'SUPPLIER_SOLD_TOTAL' }), { gross_amount: 10, margin_amount: 0 })).toThrow(/Supplier sold total/);
  });

  it('fixed amount ignores the base', () => {
    expect(calculateCommission(version({ mode: 'FIXED', value: 150 }), { gross_amount: 9_999, margin_amount: 1 })).toMatchObject({
      amount: 150, calculation_type: 'FIXED', fixed_amount: 150,
    });
  });

  it('excess: only the part above the threshold earns commission', () => {
    const rule = version({ apply_on: 'EXCESS', excess_threshold: 10_000, value: 5 });
    expect(calculateCommission(rule, { gross_amount: 12_000, margin_amount: 0 })).toMatchObject({ amount: 100 });
    expect(calculateCommission(rule, { gross_amount: 8_000, margin_amount: 0 })).toMatchObject({ amount: 0 });
  });

  it('no version or mode NONE -> pending rule, never zero', () => {
    expect(calculateCommission(null, { gross_amount: 1, margin_amount: 1 })).toMatchObject({ pending_rule: true });
    expect(calculateCommission(version({ mode: 'NONE' }), { gross_amount: 1, margin_amount: 1 })).toMatchObject({ pending_rule: true });
  });

  it('rounds half away from zero on cents (1.005 -> 1.01)', () => {
    expect(calculateCommission(version({ value: 1 }), { gross_amount: 100.5, margin_amount: 0 })).toMatchObject({ amount: 1.01 });
  });

  it('a progressive rule without tiers or with a non-contiguous ladder is refused (fail closed)', () => {
    expect(() => calculateCommission(version({ progressive: true, tiers: [] }), { gross_amount: 1, margin_amount: 1 }, 0)).toThrow();
    expect(() =>
      calculateCommission(version({ progressive: true, tiers: [tiers[0]!, { ...tiers[2]!, tier_number: 2 }] }), { gross_amount: 1, margin_amount: 1 }, 0),
    ).toThrow();
  });

  it('a negative accumulated or base is refused', () => {
    expect(() => calculateCommission(version({ progressive: true, tiers }), { gross_amount: -1, margin_amount: 0 }, 0)).toThrow();
    expect(() => calculateCommission(version({ progressive: true, tiers }), { gross_amount: 1, margin_amount: 0 }, -5)).toThrow();
  });
});

describe('selectEffectiveVersion (versions are append-only; same-day revisions lose nothing)', () => {
  const v1 = version({ version_id: 'v1', version_number: 1, effective_from: '2026-10-10' });
  const v2 = version({ version_id: 'v2', version_number: 2, effective_from: '2026-11-01' });
  const v3 = version({ version_id: 'v3', version_number: 3, effective_from: '2026-11-01' });

  it('picks the latest effective_from <= date; ties go to the highest version_number', () => {
    expect(selectEffectiveVersion([v1, v2, v3], '2026-10-09')).toBeNull();
    expect(selectEffectiveVersion([v1, v2, v3], '2026-10-31')?.version_id).toBe('v1');
    expect(selectEffectiveVersion([v1, v2, v3], '2026-11-01')?.version_id).toBe('v3');
    expect(selectEffectiveVersion([v3, v1, v2], '2027-01-01')?.version_id).toBe('v3');
  });
});
