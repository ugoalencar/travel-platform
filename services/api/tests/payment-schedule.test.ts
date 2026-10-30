import { describe, expect, it } from 'vitest';
import { calculatePaymentSchedule, type PaymentCondition } from '../src/payment-schedule';

const condition: PaymentCondition = {
  name: 'Condição de teste', version: 1, scheduleKind: 'EQUAL_INSTALLMENTS',
  maxInstallments: 10, minInstallmentAmount: 100, interestFree: true,
  downPaymentMode: 'NONE', downPaymentValue: 0, downPaymentRequired: false,
  balanceDeadlineAnchor: 'SALE_DATE', balanceDeadlineOffsetDays: 0,
  allowsPartialPayments: true,
};
const dates = { saleDate: '2026-10-24', travelStart: '2026-12-20' };
const down: PaymentCondition = { ...condition, scheduleKind: 'DOWN_PAYMENT_PLUS_BALANCE',
  downPaymentMode: 'PERCENT', downPaymentValue: 30, downPaymentRequired: true,
  balanceDeadlineAnchor: 'TRAVEL_START', balanceDeadlineOffsetDays: -15 };

describe('ADR-006 pure schedule oracle', () => {
  it('P1: 1000, maximum ten, minimum 100', () => {
    expect(calculatePaymentSchedule(condition, 1000, 10, dates).map((p) => p.amount)).toEqual(Array(10).fill(100));
    expect(() => calculatePaymentSchedule(condition, 1000, 11, dates)).toThrow();
  });
  it('P2: minimum reduces maximum to nine', () => {
    expect(calculatePaymentSchedule({ ...condition, maxInstallments: 12 }, 999, 9, dates).map((p) => p.amount)).toEqual(Array(9).fill(111));
    expect(() => calculatePaymentSchedule({ ...condition, maxInstallments: 12 }, 999, 10, dates)).toThrow();
  });
  it('P3: remainder belongs to the final installment', () => {
    expect(calculatePaymentSchedule(condition, 1000, 3, dates).map((p) => p.amount)).toEqual([333.33, 333.33, 333.34]);
  });
  it('P4/P5: entry half-up and balance deadline', () => {
    expect(calculatePaymentSchedule(down, 1000, 1, dates)).toMatchObject([
      { kind: 'DOWN_PAYMENT', amount: 300, dueDate: '2026-10-24' },
      { kind: 'BALANCE', amount: 700, dueDate: '2026-12-05' },
    ]);
    expect(calculatePaymentSchedule(down, 1050.05, 1, dates).map((p) => p.amount)).toEqual([315.02, 735.03]);
  });
  it('P8: traveler installments do not split SINGLE', () => {
    expect(calculatePaymentSchedule({ ...condition, scheduleKind: 'SINGLE' }, 1000, 10, dates)).toHaveLength(1);
  });
  it('supports configured fixed entry and percentage with four decimals', () => {
    expect(calculatePaymentSchedule({ ...down,downPaymentMode: 'AMOUNT',downPaymentValue: 200.01 },1000,1,dates)
      .map((p) => p.amount)).toEqual([200.01,799.99]);
    expect(calculatePaymentSchedule({ ...down,downPaymentValue: 12.3456 },1000,1,dates)
      .map((p) => p.amount)).toEqual([123.46,876.54]);
  });
  it('clamps monthly dates without overflow', () => {
    expect(calculatePaymentSchedule(condition, 1000, 3, { saleDate: '2028-01-31', travelStart: null }).map((p) => p.dueDate))
      .toEqual(['2028-01-31', '2028-02-29', '2028-03-31']);
  });
  it('always conserves integer cents across totals and installment counts', () => {
    for (const total of [0.01, 1.01, 999, 1000, 1050.05, 99999999.99]) {
      for (let n = 1; n <= Math.min(10, Math.round(total * 100)); n++) {
        const rows = calculatePaymentSchedule({ ...condition, minInstallmentAmount: null }, total, n, dates);
        expect(rows.reduce((sum, p) => sum + Math.round(p.amount * 100), 0)).toBe(Math.round(total * 100));
      }
    }
  });
  it.each([0, -1, 1.1, NaN, Infinity])('rejects invalid count %s', (n) => {
    expect(() => calculatePaymentSchedule(condition, 1000, n, dates)).toThrow();
  });
  it.each([0, -1, 1.001, NaN, Infinity, 1e12])('rejects invalid total %s', (total) => {
    expect(() => calculatePaymentSchedule(condition, total, 1, dates)).toThrow();
  });
  it('fails closed on missing travel date, invalid date, absent entry and interest', () => {
    expect(() => calculatePaymentSchedule(down, 1000, 1, { ...dates, travelStart: null })).toThrow();
    expect(() => calculatePaymentSchedule(condition, 1000, 1, { ...dates, saleDate: '2026-02-30' })).toThrow();
    expect(() => calculatePaymentSchedule({ ...down, downPaymentValue: 0 }, 1000, 1, dates)).toThrow();
    expect(() => calculatePaymentSchedule({ ...condition, interestFree: false }, 1000, 1, dates)).toThrow();
  });
});
