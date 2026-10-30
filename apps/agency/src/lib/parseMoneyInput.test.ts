import { describe, expect, it } from 'vitest';
import { parseMoneyInput } from './parseMoneyInput';

describe('parseMoneyInput', () => {
  it.each([
    ['2300', 2300],
    ['2300,5', 2300.5],
    ['2300,50', 2300.5],
    ['2.300,50', 2300.5],
    ['1.000.000,00', 1000000],
    ['2300.50', 2300.5],
    [' 150 ', 150],
    ['0', 0],
  ])('accepts %s', (raw, expected) => {
    expect(parseMoneyInput(raw)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '-5', '1.000.00', '12,345', '1,2,3', '1.00,5', '2300,', ',50', '10 reais'])(
    'rejects %j instead of guessing',
    (raw) => {
      expect(parseMoneyInput(raw)).toBeNull();
    },
  );
});
