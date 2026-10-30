import { describe, expect, it } from 'vitest';
import {
  allocableAmount,
  entryStatusAfterPayments,
  releasedAmount,
  resolveReleasePolicy,
} from '../src/commission-release';

const profile = { effect: 'SOMENTE_LIBERACAO' as const, profileId: 'p1' };

describe('resolveReleasePolicy: never ON_SALE by omission (COM-03 / F2 dissolved)', () => {
  it('a sale without payment method is BLOCKED', () => {
    expect(resolveReleasePolicy({ hasPaymentMethod: false, requiresReceipt: null, profile })).toEqual({
      status: 'BLOCKED', missing: ['PAYMENT_METHOD_NOT_SET'],
    });
  });

  it('a method whose rule was never decided (null) is BLOCKED, even with a profile', () => {
    expect(resolveReleasePolicy({ hasPaymentMethod: true, requiresReceipt: null, profile })).toEqual({
      status: 'BLOCKED', missing: ['PAYMENT_METHOD_RECEIPT_RULE_UNSET'],
    });
  });

  it('a method that requires receipt without an active financial profile is BLOCKED', () => {
    expect(resolveReleasePolicy({ hasPaymentMethod: true, requiresReceipt: true, profile: null })).toEqual({
      status: 'BLOCKED', missing: ['FINANCIAL_PROFILE_NOT_ACTIVE'],
    });
  });

  it('collects every missing configuration at once', () => {
    expect(resolveReleasePolicy({ hasPaymentMethod: false, requiresReceipt: null, profile: null })).toEqual({
      status: 'BLOCKED', missing: ['PAYMENT_METHOD_NOT_SET', 'FINANCIAL_PROFILE_NOT_ACTIVE'],
    });
  });

  it('an explicit "does not require receipt" resolves without a profile', () => {
    expect(resolveReleasePolicy({ hasPaymentMethod: true, requiresReceipt: false, profile: null })).toEqual({
      status: 'RESOLVED', requiresReceipt: false,
    });
  });

  it('requires receipt + profile resolves with the profile effect', () => {
    expect(resolveReleasePolicy({ hasPaymentMethod: true, requiresReceipt: true, profile })).toEqual({
      status: 'RESOLVED', requiresReceipt: true, effect: 'SOMENTE_LIBERACAO', profileId: 'p1',
    });
  });
});

describe('releasedAmount (same formula as the Lite: amount x min(received/total, 1), cents)', () => {
  const on = { status: 'RESOLVED', requiresReceipt: true, effect: 'SOMENTE_LIBERACAO' } as const;

  it('releases proportionally to what was received', () => {
    expect(releasedAmount(on, 750, 300, 1_000)).toBe(225);
    expect(releasedAmount(on, 750, 1_000, 1_000)).toBe(750);
    expect(releasedAmount(on, 750, 1_200, 1_000)).toBe(750); // never above the recognized amount
    expect(releasedAmount(on, 750, 0, 1_000)).toBe(0);
  });

  it('a sale with no receivable total releases nothing', () => {
    expect(releasedAmount(on, 750, 0, 0)).toBe(0);
  });

  it('does not require receipt / legacy entries release the whole amount; BLOCKED releases nothing', () => {
    expect(releasedAmount({ status: 'RESOLVED', requiresReceipt: false }, 750, 0, 1_000)).toBe(750);
    expect(releasedAmount({ status: 'LEGACY_PRE_FEATURE' }, 750, 0, 1_000)).toBe(750);
    expect(releasedAmount({ status: 'BLOCKED', missing: ['PAYMENT_METHOD_NOT_SET'] }, 750, 1_000, 1_000)).toBe(0);
  });

  it('rounds half away from zero on cents', () => {
    expect(releasedAmount(on, 100, 1, 3)).toBe(33.33);
    expect(releasedAmount(on, 0.05, 1, 2)).toBe(0.03);
  });
});

describe('settlement balances (QP-01..QP-11 numbers)', () => {
  it('QP-01/02: partial allocation keeps PAYABLE, full one makes it PAID', () => {
    expect(allocableAmount(225, 0)).toBe(225);
    expect(entryStatusAfterPayments({ recognized: 750, paid: 225, channel: 'PAYABLE' })).toBe('PAYABLE');
    expect(allocableAmount(750, 225)).toBe(525);
    expect(entryStatusAfterPayments({ recognized: 750, paid: 750, channel: 'PAYABLE' })).toBe('PAID');
  });

  it('QP-03/04: payroll channel stays APPROVED until the paid slices reach the recognized amount', () => {
    expect(entryStatusAfterPayments({ recognized: 750, paid: 225, channel: 'PAYROLL' })).toBe('APPROVED');
    expect(entryStatusAfterPayments({ recognized: 750, paid: 750, channel: 'PAYROLL' })).toBe('PAID');
  });

  it('QP-11: PAID only when paid >= recognized, compared in cents (no float drift)', () => {
    expect(entryStatusAfterPayments({ recognized: 0.3, paid: 0.1 + 0.2, channel: 'PAYABLE' })).toBe('PAID');
    expect(entryStatusAfterPayments({ recognized: 100, paid: 99.99, channel: 'PAYABLE' })).toBe('PAYABLE');
  });

  it('reopening: when paid drops below recognized the entry goes back (QP-08)', () => {
    expect(entryStatusAfterPayments({ recognized: 750, paid: 300, channel: 'PAYABLE' })).toBe('PAYABLE');
    expect(entryStatusAfterPayments({ recognized: 750, paid: 300, channel: 'PAYROLL' })).toBe('APPROVED');
  });

  it('allocable is never negative (QP-09: a receipt reversal below what was paid releases nothing more)', () => {
    expect(allocableAmount(100, 225)).toBe(0);
  });
});
