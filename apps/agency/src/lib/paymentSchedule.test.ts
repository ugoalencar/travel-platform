import { describe, expect, it } from 'vitest';
import { previewPaymentSchedule } from './paymentSchedule';
import type { PaymentCondition } from './paymentSchedule';

const condition: PaymentCondition = {
  id: 'one', name: 'Mensal', version: 1, scheduleKind: 'EQUAL_INSTALLMENTS', maxInstallments: 10,
  minInstallmentAmount: null, interestFree: true, downPaymentMode: 'NONE', downPaymentValue: 0,
  downPaymentRequired: false, balanceDeadlineAnchor: 'SALE_DATE', balanceDeadlineOffsetDays: 0,
  allowsPartialPayments: true, paymentMethods: ['PIX'], categoryIds: [], productIds: [],
};
describe('prévia indicativa do cronograma', () => {
  it('preserva centavos no resto final e o dia original de cada mês', () => {
    expect(previewPaymentSchedule(condition, 1000, 3, '2026-01-31', null)).toEqual([
      { kind: 'INSTALLMENT', amount: 333.33, dueDate: '2026-01-31' },
      { kind: 'INSTALLMENT', amount: 333.33, dueDate: '2026-02-28' },
      { kind: 'INSTALLMENT', amount: 333.34, dueDate: '2026-03-31' },
    ]);
  });
  it('usa half-up para entrada percentual com quatro casas', () => {
    expect(previewPaymentSchedule({ ...condition, scheduleKind: 'DOWN_PAYMENT_PLUS_BALANCE',
      downPaymentMode: 'PERCENT', downPaymentValue: 33.335 }, 100, 1, '2026-01-31', null)[0]?.amount).toBe(33.34);
  });
  it('exige embarque quando é a âncora e respeita mínimo e limite', () => {
    expect(() => previewPaymentSchedule({ ...condition, balanceDeadlineAnchor: 'TRAVEL_START' }, 1000, 1, '2026-01-31', null)).toThrow('embarque');
    expect(() => previewPaymentSchedule({ ...condition, minInstallmentAmount: 200 }, 1000, 10, '2026-01-31', null)).toThrow('parcelas');
  });
});
