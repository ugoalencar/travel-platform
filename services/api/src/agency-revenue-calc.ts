/**
 * Agency revenue calculation (ADR-007) -- pure module, no I/O.
 *
 * Revenue is what the supplier owes the AGENCY. It is a different amount from
 * the sold value, the supplier cost and the employee commission: nothing here
 * reads or writes those. Money math is done in integer cents with half-up
 * rounding per item (Gadotti D4); the sale revenue is the sum of the rounded
 * items. The same file is mirrored in api-lite and checked by a parity test.
 */

export const REVENUE_CALC_VERSION = 1;

export type RevenueMode =
  | 'PERCENTAGE'
  | 'FIXED_PER_PASSENGER'
  | 'FIXED_PER_SALE'
  | 'FIXED_PER_ITEM'
  | 'NONE';
export type BaseSelector =
  | 'LINE_TOTAL'
  | 'NET_FARE'
  | 'TAXES'
  | 'FEES'
  | 'TAXES_AND_FEES'
  | 'MARGIN';
export type CollectionModel = 'AGENCY_COLLECTS' | 'SUPPLIER_COLLECTS';

export interface RevenueRule {
  ruleVersionId: string;
  mode: RevenueMode;
  /** Required for PERCENTAGE, null otherwise. */
  baseSelector: BaseSelector | null;
  /** Percent (0..100) for PERCENTAGE, money amount otherwise. */
  value: number;
  collectionModel: CollectionModel;
}

export interface RevenueItemInput {
  itemId: string;
  supplierId: string | null;
  qty: number;
  unitPrice: number;
  discount: number;
  taxes: number;
  fees: number;
  /** Existing item margin (sale price minus supplier cost); only used by the MARGIN base. */
  lineMargin: number;
  passengerCount: number;
  rule: RevenueRule | null;
}

export interface RevenueEntryDraft {
  itemId: string;
  supplierId: string | null;
  ruleVersionId: string | null;
  status: 'FORECAST' | 'PENDING_RULE';
  amount: number;
  base: number;
  memory: Record<string, unknown>;
}

interface Decimal { numerator: bigint; denominator: bigint }

function decimal(value: number): Decimal {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid monetary input');
  const [mantissa = '0', exponent = '0'] = String(value).toLowerCase().split('e');
  const [whole = '0', fraction = ''] = mantissa.split('.');
  const scale = fraction.length - Number(exponent);
  const numerator = BigInt(whole + fraction);
  return scale >= 0
    ? { numerator, denominator: 10n ** BigInt(scale) }
    : { numerator: numerator * 10n ** BigInt(-scale), denominator: 1n };
}

function multiply(a: Decimal, b: Decimal): Decimal {
  return { numerator: a.numerator * b.numerator, denominator: a.denominator * b.denominator };
}

function add(a: Decimal, b: Decimal): Decimal {
  return { numerator: a.numerator * b.denominator + b.numerator * a.denominator, denominator: a.denominator * b.denominator };
}

function subtractFloorZero(a: Decimal, b: Decimal): Decimal {
  const numerator = a.numerator * b.denominator - b.numerator * a.denominator;
  return { numerator: numerator > 0n ? numerator : 0n, denominator: a.denominator * b.denominator };
}

/** Round only the final item amount, using exact decimal half-up. */
function roundedCents(value: Decimal): number {
  const cents = (value.numerator * 200n + value.denominator) / (2n * value.denominator);
  const result = Number(cents);
  if (!Number.isSafeInteger(result)) throw new RangeError('Monetary input exceeds safe range');
  return result;
}

const toCents = (value: number): number => roundedCents(decimal(value));
const fromCents = (cents: number): number => cents / 100;

function percentOf(base: Decimal, percent: number): number {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new RangeError('Invalid percentage');
  const result = multiply(base, decimal(percent));
  return roundedCents({ numerator: result.numerator, denominator: result.denominator * 100n });
}

function itemBase(item: RevenueItemInput, selector: BaseSelector): Decimal {
  const fare = subtractFloorZero(multiply(decimal(item.qty), decimal(item.unitPrice)), decimal(item.discount));
  const taxes = decimal(item.taxes);
  const fees = decimal(item.fees);
  switch (selector) {
    case 'NET_FARE': return fare;
    case 'TAXES': return taxes;
    case 'FEES': return fees;
    case 'TAXES_AND_FEES': return add(taxes, fees);
    case 'MARGIN': return decimal(item.lineMargin);
    case 'LINE_TOTAL': return add(add(fare, taxes), fees);
  }
}

export function calculateSaleRevenue(items: readonly RevenueItemInput[]): RevenueEntryDraft[] {
  const appliedPerSale = new Set<string>();
  return items.map((item) => {
    const rule = item.rule;
    const pending = (reason: string, ruleVersionId: string | null): RevenueEntryDraft => ({
      itemId: item.itemId,
      supplierId: item.supplierId,
      ruleVersionId,
      status: 'PENDING_RULE',
      amount: 0,
      base: 0,
      memory: { calcVersion: REVENUE_CALC_VERSION, reason },
    });
    if (item.supplierId === null) return pending('NO_SUPPLIER', null);
    if (!rule) return pending('NO_APPLICABLE_RULE', null);
    if (!Number.isFinite(rule.value) || rule.value < 0) throw new RangeError('Invalid rule value');

    const memory: Record<string, unknown> = {
      calcVersion: REVENUE_CALC_VERSION,
      ruleVersionId: rule.ruleVersionId,
      mode: rule.mode,
      baseSelector: rule.baseSelector,
      collectionModel: rule.collectionModel,
    };
    let base = 0;
    let cents = 0;
    switch (rule.mode) {
      case 'PERCENTAGE': {
        if (!rule.baseSelector) return pending('RULE_WITHOUT_BASE', rule.ruleVersionId);
        if (rule.baseSelector === 'MARGIN' && rule.collectionModel !== 'AGENCY_COLLECTS') {
          return pending('MARGIN_REQUIRES_AGENCY_COLLECTS', rule.ruleVersionId);
        }
        const selectedBase = itemBase(item, rule.baseSelector);
        cents = percentOf(selectedBase, rule.value);
        base = fromCents(roundedCents(selectedBase));
        memory.rate = rule.value;
        break;
      }
      case 'FIXED_PER_PASSENGER':
        if (!Number.isInteger(item.passengerCount) || item.passengerCount < 0) {
          throw new RangeError('Invalid passenger count');
        }
        cents = roundedCents(multiply(decimal(rule.value), decimal(item.passengerCount)));
        memory.passengerCount = item.passengerCount;
        memory.unitAmount = rule.value;
        break;
      case 'FIXED_PER_ITEM':
        cents = toCents(rule.value);
        break;
      case 'FIXED_PER_SALE':
        // Once per rule version across the sale: the first matching item carries it.
        if (!appliedPerSale.has(rule.ruleVersionId)) {
          appliedPerSale.add(rule.ruleVersionId);
          cents = toCents(rule.value);
        } else {
          memory.coveredByEarlierItem = true;
        }
        break;
      case 'NONE':
        break;
    }
    memory.base = base;
    return {
      itemId: item.itemId,
      supplierId: item.supplierId,
      ruleVersionId: rule.ruleVersionId,
      status: 'FORECAST',
      amount: fromCents(cents),
      base,
      memory,
    };
  });
}

export interface RuleCandidate {
  ruleVersionId: string;
  productId: string | null;
  supplierId: string | null;
  categoryId: string | null;
  versionNumber: number;
  /** ISO civil date (YYYY-MM-DD). */
  effectiveFrom: string;
  rule: RevenueRule;
}

export interface RuleContext {
  productId: string | null;
  supplierId: string | null;
  categoryId: string | null;
  /** Civil date the rule must be effective on. */
  onDate: string;
}

/** product+supplier > product > supplier+category > supplier > category > agency default. */
function specificity(candidate: RuleCandidate): number {
  const { productId, supplierId, categoryId } = candidate;
  if (productId && supplierId) return 6;
  if (productId) return 5;
  if (supplierId && categoryId) return 4;
  if (supplierId) return 3;
  if (categoryId) return 2;
  return 1;
}

export function resolveRuleVersion(
  candidates: readonly RuleCandidate[],
  context: RuleContext,
): RuleCandidate | null {
  const matches = candidates.filter(
    (candidate) =>
      candidate.effectiveFrom <= context.onDate &&
      (candidate.productId === null || candidate.productId === context.productId) &&
      (candidate.supplierId === null || candidate.supplierId === context.supplierId) &&
      (candidate.categoryId === null || candidate.categoryId === context.categoryId),
  );
  let best: RuleCandidate | null = null;
  for (const candidate of matches) {
    if (!best) {
      best = candidate;
      continue;
    }
    const rank = specificity(candidate) - specificity(best);
    if (rank > 0) best = candidate;
    else if (rank === 0) {
      if (
        candidate.effectiveFrom > best.effectiveFrom ||
        (candidate.effectiveFrom === best.effectiveFrom && candidate.versionNumber > best.versionNumber)
      ) {
        best = candidate;
      }
    }
  }
  return best;
}
