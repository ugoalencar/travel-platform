/**
 * Pure commission calculation for the progressive / excess trail (Onda E, COM-01/COM-02).
 *
 * Parity contract with the Lite engine (services/api-lite/src/commission-engine.ts):
 * same inputs give the same amount and the same slices; services/api-lite/tests/commission-parity.test.ts
 * runs both over one table. Percent values are percentage points (3 -> 4 is +1 point).
 *
 * Rounding here is half away from zero on cents (the Lite rule). The legacy Full calculation
 * (employee-commissions.ts, e.g. 18,50 x 3% = 0,55) is NOT touched and its history is never
 * reprocessed (decision F4); the divergence between the two rules is recorded in the Onda E report.
 *
 * Marginal ladders charge each slice at its tier rate; TOTAL applies the reached tier rate to the
 * entire accumulated base. Legacy calculations remain in employee-commissions.ts.
 */

export const COMMISSION_CALC_VERSION = 1;

export interface CommissionTier {
  tier_number: number;
  from_amount: number;
  to_amount: number | null;
  rate: number;
}

export interface CommissionRuleVersion {
  scope_id: string;
  version_id: string;
  version_number: number;
  /** Civil date (YYYY-MM-DD). */
  effective_from: string;
  mode: 'PERCENTAGE' | 'FIXED' | 'NONE';
  calculation_base: 'GROSS' | 'MARGIN' | 'SUPPLIER_SOLD_TOTAL';
  value: number | null;
  apply_on: 'TOTAL' | 'EXCESS';
  excess_threshold: number | null;
  progressive: boolean;
  tier_mode?: 'MARGINAL' | 'TOTAL';
  tiers: CommissionTier[];
  release_after_supplier_payment?: boolean;
}

export interface CommissionSaleAmounts {
  gross_amount: number;
  margin_amount: number;
  supplier_sold_total?: number;
}

export type CommissionCalculation =
  | { pending_rule: true; snapshot: Record<string, unknown> }
  | {
      pending_rule: false;
      calculation_type: 'FIXED' | 'PERCENTAGE_ON_GROSS' | 'PERCENTAGE_ON_MARGIN' | 'PERCENTAGE_ON_SUPPLIER_SOLD_TOTAL';
      calculation_base: number | null;
      percentage: number | null;
      fixed_amount: number | null;
      amount: number;
      snapshot: Record<string, unknown>;
    };

/** Half away from zero on cents; floating-point noise is removed first (1.005 -> 1.01). */
export function roundCommission(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('roundCommission requires a finite number');
  const cents = Number((Math.abs(value) * 100).toPrecision(15));
  return (Math.sign(value) * Math.round(cents)) / 100 || 0;
}

/** Slices [accumulated, accumulated + base] across the tiers; each slice is rounded on its own. */
export function sliceAcrossTiers(tiers: readonly CommissionTier[], accumulated: number, base: number) {
  const end = accumulated + base;
  return tiers
    .map((tier) => {
      const upper = tier.to_amount ?? Number.POSITIVE_INFINITY;
      const amountOn = Math.max(Math.min(end, upper) - Math.max(accumulated, tier.from_amount), 0);
      return {
        tier: tier.tier_number,
        from_amount: tier.from_amount,
        to_amount: tier.to_amount,
        rate: tier.rate,
        amount_on: roundCommission(amountOn),
        commission: roundCommission((amountOn * tier.rate) / 100),
      };
    })
    .filter((slice) => slice.amount_on > 0);
}

/** A ladder must start at 0, be contiguous, end open and have unique ascending numbers. */
function assertValidLadder(tiers: readonly CommissionTier[]): void {
  if (tiers.length === 0) throw new RangeError('A progressive rule needs at least one tier');
  const sorted = [...tiers].sort((a, b) => a.tier_number - b.tier_number);
  sorted.forEach((tier, index) => {
    if (tier.tier_number !== index + 1) throw new RangeError('Tier numbers must be 1..n without gaps');
    const expectedFrom = index === 0 ? 0 : sorted[index - 1]!.to_amount;
    if (tier.from_amount !== expectedFrom) throw new RangeError('Tiers must be contiguous and start at 0');
    if (tier.rate < 0) throw new RangeError('Tier rate must not be negative');
    const last = index === sorted.length - 1;
    if (last ? tier.to_amount !== null : tier.to_amount === null || tier.to_amount <= tier.from_amount) {
      throw new RangeError('Only the last tier is open-ended and bounds must increase');
    }
  });
}

/** Version in force on `date`: greatest effective_from <= date; same-day ties go to the highest version_number. */
export function selectEffectiveVersion(versions: readonly CommissionRuleVersion[], date: string): CommissionRuleVersion | null {
  let winner: CommissionRuleVersion | null = null;
  for (const v of versions) {
    if (v.effective_from > date) continue;
    if (
      winner === null ||
      v.effective_from > winner.effective_from ||
      (v.effective_from === winner.effective_from && v.version_number > winner.version_number)
    ) {
      winner = v;
    }
  }
  return winner;
}

export function calculateCommission(
  version: CommissionRuleVersion | null,
  sale: CommissionSaleAmounts,
  accumulatedBefore = 0,
): CommissionCalculation {
  if (!version || version.mode === 'NONE') {
    return {
      pending_rule: true,
      snapshot: {
        rule_type: 'UNDEFINED',
        calc_version: COMMISSION_CALC_VERSION,
        ...(version ? { scope_id: version.scope_id, rule_version_id: version.version_id } : {}),
      },
    };
  }

  const lineage = {
    calc_version: COMMISSION_CALC_VERSION,
    scope_id: version.scope_id,
    rule_version_id: version.version_id,
    rule_version_number: version.version_number,
    effective_from: version.effective_from,
  };

  if (version.mode === 'FIXED') {
    const fixed = version.value ?? 0;
    return {
      pending_rule: false,
      calculation_type: 'FIXED',
      calculation_base: null,
      percentage: null,
      fixed_amount: fixed,
      amount: roundCommission(fixed),
      snapshot: { rule_type: 'FIXED', fixed_amount: fixed, ...lineage },
    };
  }

  const base = version.calculation_base === 'MARGIN'
    ? sale.margin_amount
    : version.calculation_base === 'SUPPLIER_SOLD_TOTAL'
      ? sale.supplier_sold_total
      : sale.gross_amount;
  if (base === undefined) throw new RangeError('Supplier sold total is required for this commission basis');
  if (!Number.isFinite(base) || base < 0) throw new RangeError('Commission base must not be negative');
  if (!Number.isFinite(accumulatedBefore) || accumulatedBefore < 0) throw new RangeError('Accumulated base must not be negative');
  const calculationType = version.calculation_base === 'MARGIN'
    ? 'PERCENTAGE_ON_MARGIN'
    : version.calculation_base === 'SUPPLIER_SOLD_TOTAL' ? 'PERCENTAGE_ON_SUPPLIER_SOLD_TOTAL' : 'PERCENTAGE_ON_GROSS';

  if (version.progressive) {
    assertValidLadder(version.tiers);
    const slices = sliceAcrossTiers(version.tiers, accumulatedBefore, base);
    const reachedTier = [...version.tiers].reverse().find((tier) => accumulatedBefore + base >= tier.from_amount);
    const amount = version.tier_mode === 'TOTAL' && reachedTier
      ? roundCommission(((accumulatedBefore + base) * reachedTier.rate) / 100)
      : roundCommission(slices.reduce((sum, slice) => sum + slice.commission, 0));
    return {
      pending_rule: false,
      calculation_type: calculationType,
      calculation_base: base,
      percentage: null,
      fixed_amount: null,
      amount,
      snapshot: { rule_type: calculationType, progressive: true, tier_mode: version.tier_mode ?? 'MARGINAL', accumulated_before: accumulatedBefore, slices, ...(version.tier_mode === 'TOTAL' ? { reached_rate: reachedTier?.rate ?? 0 } : {}), ...lineage },
    };
  }

  const rate = version.value ?? 0;
  const threshold = version.apply_on === 'EXCESS' ? (version.excess_threshold ?? 0) : 0;
  const computeOn = Math.max(base - threshold, 0);
  return {
    pending_rule: false,
    calculation_type: calculationType,
    calculation_base: base,
    percentage: rate,
    fixed_amount: null,
    amount: roundCommission((computeOn * rate) / 100),
    snapshot: {
      rule_type: calculationType,
      rate,
      apply_on: version.apply_on,
      ...(version.apply_on === 'EXCESS' ? { excess_threshold: threshold, computed_on: computeOn } : {}),
      ...lineage,
    },
  };
}
