import { describe, expect, it } from 'vitest';
import { calculatePaymentSchedule as full, moneyCents as fullCents, type PaymentCondition } from '../../api/src/payment-schedule';
import { receivableTimezone as fullTimezone } from '../../api/src/receivable-sql';
import { calculatePaymentSchedule as lite, moneyCents as liteCents } from '../src/payment-schedule';
import { receivableTimezone } from '../src/receivable-sql';

const base: PaymentCondition = {
  name: 'Parity', version: 1, scheduleKind: 'EQUAL_INSTALLMENTS', maxInstallments: 999,
  minInstallmentAmount: null, interestFree: true, downPaymentMode: 'NONE', downPaymentValue: 0,
  downPaymentRequired: false, balanceDeadlineAnchor: 'SALE_DATE', balanceDeadlineOffsetDays: 0,
  allowsPartialPayments: true,
};
describe('Full is the numerical oracle for Lite', () => {
  it('shares timezone and numeric boundaries', () => {
    expect(receivableTimezone).toBe(fullTimezone);
    for (const value of [0, 0.01, 1000, 999999999999.99]) expect(liteCents(value)).toBe(fullCents(value));
    for (const value of [-1, 0.001, 1e12, Infinity, NaN]) {
      expect(() => liteCents(value)).toThrow();
      expect(() => fullCents(value)).toThrow();
    }
  });
  it('conserves cents and matches all schedule kinds and month anchors', () => {
    const conditions: PaymentCondition[] = [base, { ...base, scheduleKind: 'SINGLE' },
      ...[30, 12.3456].map((downPaymentValue): PaymentCondition => ({ ...base,
        scheduleKind: 'DOWN_PAYMENT_PLUS_BALANCE', downPaymentMode: 'PERCENT', downPaymentValue,
        downPaymentRequired: true, balanceDeadlineAnchor: 'TRAVEL_START', balanceDeadlineOffsetDays: -15 })),
      { ...base, scheduleKind: 'DOWN_PAYMENT_PLUS_BALANCE', downPaymentMode: 'AMOUNT', downPaymentValue: 10.01 }];
    for (const condition of conditions) for (const total of [1000, 1050.05, 99999999.99]) {
      for (const count of condition.scheduleKind === 'DOWN_PAYMENT_PLUS_BALANCE' ? [1] : [1, 3, 10, 999]) {
        const dates = { saleDate: '2028-01-31', travelStart: '2028-12-20' };
        const result = lite(condition, total, count, dates);
        expect(result).toEqual(full(condition, total, count, dates));
        expect(result.reduce((sum, row) => sum + liteCents(row.amount), 0)).toBe(liteCents(total));
      }
    }
    for (const count of [0, 1000]) {
      expect(() => lite(base, 1000, count, { saleDate: '2028-01-31', travelStart: null })).toThrow();
      expect(() => full(base, 1000, count, { saleDate: '2028-01-31', travelStart: null })).toThrow();
    }
  });
});
