import { describe, expect, it } from 'vitest';
import { roundMoney } from '../src/money';
import { releasedAmount } from '../../api/src/commission-release';

/** The Lite formula (finance.ts loadCommissionRelease, ON_RECEIPT), written out for the comparison. */
function liteReleased(amount: number, received: number, total: number): number {
  const ratio = total > 0 ? Math.min(received / total, 1) : 0;
  return roundMoney(amount * ratio);
}

describe('Full and Lite release the same commission amount for a receipt-based policy', () => {
  const on = { status: 'RESOLVED', requiresReceipt: true, effect: 'SOMENTE_LIBERACAO' } as const;
  const table: Array<[number, number, number]> = [
    [750, 300, 1_000], [750, 1_000, 1_000], [750, 1_200, 1_000], [750, 0, 1_000], [750, 0, 0],
    [100, 1, 3], [0.05, 1, 2], [18.5, 333.33, 1_000], [1_234.56, 500, 777], [2_900, 70_000, 115_000],
  ];
  it.each(table)('amount=%s received=%s total=%s', (amount, received, total) => {
    expect(releasedAmount(on, amount, received, total)).toBe(liteReleased(amount, received, total));
  });
});
