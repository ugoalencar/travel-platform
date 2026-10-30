import { describe, expect, it } from 'vitest';
import { SALE_ITEM_LIMITS, saleItemAmountsError } from '../src/sale-items';

describe('sale item column limits', () => {
  const amounts = { qty: 1, unitPrice: 1000, taxes: 0, fees: 0, discount: 0 };

  it.each(['qty', 'unitPrice', 'unitCost', 'discount', 'taxes', 'fees', 'commission'] as const)(
    'rejects more than two decimals in %s',
    (field) => {
      expect(saleItemAmountsError({ ...amounts, [field]: 1.001 })).toBe(`${field} must have at most 2 decimal places`);
      expect(saleItemAmountsError({ ...amounts, [field]: 1.000000001 })).toBe(`${field} must have at most 2 decimal places`);
    },
  );

  it.each(['unitPrice', 'unitCost', 'discount', 'taxes', 'fees', 'commission'] as const)(
    'rejects column overflow in %s',
    (field) => {
      expect(saleItemAmountsError({ ...amounts, [field]: 10_000_000_000 })).toBe(`${field} exceeds the allowed limit`);
    },
  );

  it('rejects quantity and computed total overflow', () => {
    expect(saleItemAmountsError({ ...amounts, qty: 100_000_000 })).toBe('qty exceeds the allowed limit');
    expect(saleItemAmountsError({ ...amounts, qty: 2, unitPrice: SALE_ITEM_LIMITS.maxMoney })).toBe('line total exceeds the allowed limit');
  });

  it('accepts decimal values near the column limits without floating point false rejections', () => {
    expect(saleItemAmountsError({ ...amounts, unitPrice: 9_999_999_999.97 })).toBeNull();
    expect(saleItemAmountsError({ ...amounts, qty: SALE_ITEM_LIMITS.maxQty, unitPrice: 0 })).toBeNull();
  });

  it('accepts a quantity of 1.25', () => {
    expect(saleItemAmountsError({ ...amounts, qty: 1.25 })).toBeNull();
  });
});
