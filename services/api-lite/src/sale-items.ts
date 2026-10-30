import { roundMoney } from './money';

/**
 * Column limits of a sale item. Same as the Full (migration 055): qty NUMERIC(10,2), money NUMERIC(12,2).
 * tests/sale-form-fields.test.ts compares both products.
 */
export const SALE_ITEM_LIMITS = {
  qtyDecimals: 2,
  moneyDecimals: 2,
  maxQty: 99_999_999.99,
  maxMoney: 9_999_999_999.99,
} as const;

const isTwoDecimals = (n: number): boolean => Math.abs(n * 100 - Math.round(n * 100)) <= 1e-6;

/**
 * Validates the amounts of a sale item against the column limits shared by Full and Lite
 * (qty NUMERIC(10,2), money NUMERIC(12,2)). Returns a message, or null when valid.
 * The Lite has an identical function; tests/sale-form-fields.test.ts runs both over one table.
 */
export function saleItemAmountsError(v: {
  qty: number;
  unitPrice: number;
  unitCost?: number;
  taxes: number;
  fees: number;
  discount: number;
  commission?: number;
}): string | null {
  if (!Number.isFinite(v.qty) || v.qty <= 0) return 'qty must be greater than zero';
  if (!isTwoDecimals(v.qty)) return 'qty must have at most 2 decimal places';
  if (v.qty > SALE_ITEM_LIMITS.maxQty) return 'qty exceeds the allowed limit';
  const money: Record<string, number> = {
    unitPrice: v.unitPrice,
    unitCost: v.unitCost ?? 0,
    taxes: v.taxes,
    fees: v.fees,
    discount: v.discount,
    commission: v.commission ?? 0,
  };
  for (const [field, value] of Object.entries(money)) {
    if (!Number.isFinite(value) || value < 0) return `${field} must not be negative`;
    if (!isTwoDecimals(value)) return `${field} must have at most 2 decimal places`;
    if (value > SALE_ITEM_LIMITS.maxMoney) return `${field} exceeds the allowed limit`;
  }
  const total = (Math.round(v.qty * v.unitPrice * 100) - Math.round(v.discount * 100) + Math.round(v.taxes * 100) + Math.round(v.fees * 100)) / 100;
  if (total < 0) return 'line total must not be negative';
  if (total > SALE_ITEM_LIMITS.maxMoney) return 'line total exceeds the allowed limit';
  return null;
}

/**
 * Line total of a sale item: qty * unit_price - discount + taxes + fees, in cents.
 * Same formula as the Full (services/api/src/sale-items.ts computeLineTotal);
 * tests/sale-form-fields.test.ts compares both.
 */
export function computeLineTotal(
  qty: number,
  unitPrice: number,
  discount: number,
  taxes: number,
  fees: number,
): number {
  const cents =
    Math.round(qty * unitPrice * 100) -
    Math.round(discount * 100) +
    Math.round(taxes * 100) +
    Math.round(fees * 100);
  return roundMoney(cents / 100);
}
