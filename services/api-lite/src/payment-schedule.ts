import { FormFieldError } from './errors';

export interface PaymentCondition {
  name: string;
  version: number;
  scheduleKind: 'SINGLE' | 'EQUAL_INSTALLMENTS' | 'DOWN_PAYMENT_PLUS_BALANCE';
  maxInstallments: number;
  minInstallmentAmount: number | null;
  interestFree: boolean;
  downPaymentMode: 'NONE' | 'PERCENT' | 'AMOUNT';
  downPaymentValue: number;
  downPaymentRequired: boolean;
  balanceDeadlineAnchor: 'SALE_DATE' | 'TRAVEL_START';
  balanceDeadlineOffsetDays: number;
  allowsPartialPayments: boolean;
}
export interface ScheduleItem {
  kind: 'SINGLE' | 'INSTALLMENT' | 'DOWN_PAYMENT' | 'BALANCE';
  installmentNumber: number;
  installmentCount: number;
  amount: number;
  dueDate: string;
}
export function scheduleError(message: string): never {
  throw new FormFieldError('FIELD_INVALID', undefined, message);
}

/** NUMERIC(14,2), converted from decimal text before arithmetic. */
export function moneyCents(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value >= 1e12 || !/^\d+(\.\d{1,2})?$/.test(String(value))) {
    return scheduleError('Money must fit NUMERIC(14,2) without rounding');
  }
  const [whole = '0', fraction = ''] = String(value).split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function civilDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return scheduleError('Invalid civil date');
  }
  return date;
}
function dateText(date: Date): string {
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
    return scheduleError('Date outside supported range');
  }
  return date.toISOString().slice(0, 10);
}
function monthlyDate(start: string, index: number): string {
  const date = civilDate(start);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + index);
  const last = new Date(date.getTime());
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, last.getUTCDate()));
  return dateText(date);
}

export function validatePaymentCondition(condition: PaymentCondition): void {
  if (!condition.interestFree) scheduleError('Only interest-free conditions are supported');
  if (!Number.isInteger(condition.maxInstallments) || condition.maxInstallments < 1 || condition.maxInstallments > 999) {
    scheduleError('maxInstallments must be between 1 and 999');
  }
  if (!Number.isInteger(condition.balanceDeadlineOffsetDays) || Math.abs(condition.balanceDeadlineOffsetDays) > 36500) {
    scheduleError('Invalid deadline offset');
  }
  if (condition.minInstallmentAmount !== null) moneyCents(condition.minInstallmentAmount);
  if (condition.downPaymentMode === 'PERCENT') {
    if (!Number.isFinite(condition.downPaymentValue) || condition.downPaymentValue <= 0 || condition.downPaymentValue >= 100 ||
        !/^\d+(\.\d{1,4})?$/.test(String(condition.downPaymentValue))) scheduleError('Invalid entry percentage');
  } else if (condition.downPaymentMode === 'AMOUNT') {
    if (moneyCents(condition.downPaymentValue) <= 0) scheduleError('Entry must be positive');
  } else if (condition.downPaymentValue !== 0) scheduleError('NONE entry must have zero value');
  if (condition.scheduleKind === 'DOWN_PAYMENT_PLUS_BALANCE') {
    if (condition.downPaymentMode === 'NONE') scheduleError('Entry configuration is required');
  } else if (condition.downPaymentMode !== 'NONE' || condition.downPaymentRequired) {
    scheduleError('Entry is only supported with DOWN_PAYMENT_PLUS_BALANCE');
  }
}

export function calculatePaymentSchedule(
  condition: PaymentCondition,
  total: number,
  installments: number,
  dates: { saleDate: string; travelStart: string | null },
): ScheduleItem[] {
  validatePaymentCondition(condition);
  const cents = moneyCents(total);
  if (cents <= 0) scheduleError('Sale total must be positive');
  civilDate(dates.saleDate);
  const anchor = condition.balanceDeadlineAnchor === 'TRAVEL_START' ? dates.travelStart : dates.saleDate;
  if (!anchor) return scheduleError('Travel start is required');
  const deadline = civilDate(anchor);
  deadline.setUTCDate(deadline.getUTCDate() + condition.balanceDeadlineOffsetDays);
  const dueDate = dateText(deadline);
  const minimum = condition.minInstallmentAmount === null ? 0 : moneyCents(condition.minInstallmentAmount);
  const maximum = Math.min(condition.maxInstallments, minimum > 0 ? Math.floor(cents / minimum) : cents);
  if (!Number.isInteger(installments) || installments < 1 || installments > maximum) scheduleError('Installment limit exceeded');
  const item = (kind: ScheduleItem['kind'], amount: number, due: string, n: number, count: number): ScheduleItem =>
    ({ kind, amount: amount / 100, dueDate: due, installmentNumber: n, installmentCount: count });
  if (condition.scheduleKind === 'SINGLE') return [item('SINGLE', cents, dueDate, 1, 1)];
  if (condition.scheduleKind === 'DOWN_PAYMENT_PLUS_BALANCE') {
    if (installments !== 1) scheduleError('Free balance is not a fixed installment plan');
    const scaledPercent = Math.round(condition.downPaymentValue * 10000);
    const entry = condition.downPaymentMode === 'AMOUNT' ? moneyCents(condition.downPaymentValue)
      : Number((BigInt(cents) * BigInt(scaledPercent) + 500000n) / 1000000n);
    if (entry <= 0 || entry >= cents) scheduleError('Entry must be positive and smaller than total');
    return [item('DOWN_PAYMENT', entry, dates.saleDate, 1, 2), item('BALANCE', cents - entry, dueDate, 2, 2)];
  }
  const base = Math.floor(cents / installments);
  return Array.from({ length: installments }, (_, i) => item('INSTALLMENT',
    i === installments - 1 ? cents - base * i : base, monthlyDate(dueDate, i), i + 1, installments));
}
