import { describe, expect, it } from 'vitest';
import { roundMoney } from '../src/money';

describe('roundMoney', () => {
  it('rounds half away from zero to cents, ignoring floating-point noise', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(3.5175)).toBe(3.52);
    expect(roundMoney(10.994)).toBe(10.99);
  });

  it('is symmetric for negatives and never returns -0', () => {
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(-0.001)).toBe(0);
    expect(Object.is(roundMoney(-0.001), 0)).toBe(true);
  });

  it('keeps exact cent values and rejects non-finite input', () => {
    expect(roundMoney(1234.56)).toBe(1234.56);
    expect(roundMoney(0)).toBe(0);
    expect(() => roundMoney(Number.NaN)).toThrow(RangeError);
    expect(() => roundMoney(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
