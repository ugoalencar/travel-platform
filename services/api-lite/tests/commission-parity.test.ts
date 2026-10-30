import { describe, expect, it } from 'vitest';
import { calculateCommission as liteCalculate, type RuleVersion } from '../src/commission-engine';
import { calculateCommission as fullCalculate, type CommissionRuleVersion } from '../../api/src/commission-calculation';

const tiers = [
  { tier_number: 1, from_amount: 0, to_amount: 50_000, rate: 3 },
  { tier_number: 2, from_amount: 50_000, to_amount: 100_000, rate: 4 },
  { tier_number: 3, from_amount: 100_000, to_amount: null, rate: 5 },
];

function pair(partial: Partial<RuleVersion>): { lite: RuleVersion; full: CommissionRuleVersion } {
  const lite: RuleVersion = {
    rule_id: 'r1', rule_category_id: null, version_id: 'v1', version_number: 1, effective_from: '2026-01-01',
    mode: 'PERCENTAGE', calculation_base: 'GROSS', value: 3, apply_on: 'TOTAL', excess_threshold: null,
    progressive: false, tiers: [], ...partial,
  };
  const full: CommissionRuleVersion = {
    scope_id: lite.rule_id, version_id: lite.version_id, version_number: lite.version_number,
    effective_from: lite.effective_from, mode: lite.mode, calculation_base: lite.calculation_base ?? 'GROSS',
    value: lite.value, apply_on: lite.apply_on, excess_threshold: lite.excess_threshold,
    progressive: lite.progressive, tiers: lite.tiers,
  };
  return { lite, full };
}

const cases: Array<[string, Partial<RuleVersion>, { gross_amount: number; margin_amount: number }, number]> = [
  ['percent on gross', {}, { gross_amount: 1_000, margin_amount: 200 }, 0],
  ['percent on margin', { calculation_base: 'MARGIN' }, { gross_amount: 1_000, margin_amount: 200 }, 0],
  ['fixed', { mode: 'FIXED', value: 150 }, { gross_amount: 9_999, margin_amount: 1 }, 0],
  ['excess above threshold', { apply_on: 'EXCESS', excess_threshold: 10_000, value: 5 }, { gross_amount: 12_000, margin_amount: 0 }, 0],
  ['excess below threshold', { apply_on: 'EXCESS', excess_threshold: 10_000, value: 5 }, { gross_amount: 8_000, margin_amount: 0 }, 0],
  ['rounding 1.005', { value: 1 }, { gross_amount: 100.5, margin_amount: 0 }, 0],
  ['rounding 18.50 x 3%', { value: 3 }, { gross_amount: 18.5, margin_amount: 0 }, 0],
  ['progressive crossing one tier', { progressive: true, tiers }, { gross_amount: 20_000, margin_amount: 0 }, 45_000],
  ['progressive crossing two tiers', { progressive: true, tiers }, { gross_amount: 70_000, margin_amount: 0 }, 45_000],
  ['progressive inside one tier', { progressive: true, tiers }, { gross_amount: 10_000, margin_amount: 0 }, 60_000],
  ['progressive from zero', { progressive: true, tiers }, { gross_amount: 120_000, margin_amount: 0 }, 0],
  ['progressive on margin', { progressive: true, tiers, calculation_base: 'MARGIN' }, { gross_amount: 0, margin_amount: 30_000 }, 40_000],
  ['no rule', { mode: 'NONE' }, { gross_amount: 1, margin_amount: 1 }, 0],
];

describe('Full and Lite commission calculation agree (COM-01/COM-02 parity)', () => {
  it.each(cases)('%s', (_name, partial, sale, accumulated) => {
    const { lite, full } = pair(partial);
    const a = liteCalculate(lite, sale, accumulated);
    const b = fullCalculate(full, sale, accumulated);
    expect(b.pending_rule).toBe(a.pending_rule);
    if (!a.pending_rule && !b.pending_rule) {
      expect(b.amount).toBe(a.amount);
      expect(b.calculation_type).toBe(a.calculation_type);
      expect(b.calculation_base).toBe(a.calculation_base);
      expect(b.percentage).toBe(a.percentage);
      expect(b.fixed_amount).toBe(a.fixed_amount);
      expect((b.snapshot as { slices?: unknown }).slices).toEqual((a.snapshot as { slices?: unknown }).slices);
    }
  });
});
