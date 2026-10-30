/**
 * Commission release policy and settlement balances (Onda E2: COM-03 + Frente 8) -- pure rules.
 *
 * Two axes (decision F2, dissolved): the payment method says WHETHER a sale needs the money received
 * (`requiresReceipt`, tri-state: null = never decided); the agency's financial profile says HOW that affects
 * goals and release. Missing configuration BLOCKS the feature and says what is missing: it is never
 * turned into "release everything now" (ON_SALE) by omission.
 *
 * `releasedAmount` follows the Lite formula (finance.ts loadCommissionRelease): amount x min(received/total, 1),
 * rounded half away from zero on cents. Entry status is derived from the SUM of what was really paid
 * (all channels), compared in cents.
 */

export type ReleaseEffect = 'META_E_LIBERACAO' | 'SOMENTE_LIBERACAO';

export type MissingConfig = 'PAYMENT_METHOD_NOT_SET' | 'PAYMENT_METHOD_RECEIPT_RULE_UNSET' | 'FINANCIAL_PROFILE_NOT_ACTIVE';

export type ReleasePolicy =
  | { status: 'RESOLVED'; requiresReceipt: false }
  | { status: 'RESOLVED'; requiresReceipt: true; effect: ReleaseEffect; profileId?: string }
  | { status: 'LEGACY_PRE_FEATURE' }
  | { status: 'BLOCKED'; missing: MissingConfig[] };

export function resolveReleasePolicy(input: {
  hasPaymentMethod: boolean;
  /** null/undefined = the method's rule was never configured. */
  requiresReceipt: boolean | null | undefined;
  profile: { effect: ReleaseEffect; profileId?: string } | null;
}): ReleasePolicy {
  const missing: MissingConfig[] = [];
  if (!input.hasPaymentMethod) missing.push('PAYMENT_METHOD_NOT_SET');
  else if (input.requiresReceipt === null || input.requiresReceipt === undefined) missing.push('PAYMENT_METHOD_RECEIPT_RULE_UNSET');
  // the profile governs sales that require receipt; an undecided or missing method keeps it relevant
  const profileNeeded = input.requiresReceipt !== false;
  if (profileNeeded && input.profile === null) missing.push('FINANCIAL_PROFILE_NOT_ACTIVE');
  if (missing.length > 0) return { status: 'BLOCKED', missing };
  if (input.requiresReceipt === false) return { status: 'RESOLVED', requiresReceipt: false };
  const profile = input.profile!;
  return {
    status: 'RESOLVED',
    requiresReceipt: true,
    effect: profile.effect,
    ...(profile.profileId !== undefined ? { profileId: profile.profileId } : {}),
  };
}

function roundCents(value: number): number {
  const cents = Number((Math.abs(value) * 100).toPrecision(15));
  return (Math.sign(value) * Math.round(cents)) / 100 || 0;
}

const toCents = (value: number): number => Math.round(Number((value * 100).toPrecision(15)));

/** Amount of the recognized commission that may be paid so far. */
export function releasedAmount(policy: ReleasePolicy, recognized: number, received: number, total: number): number {
  if (policy.status === 'BLOCKED') return 0;
  if (policy.status === 'LEGACY_PRE_FEATURE' || !policy.requiresReceipt) return recognized;
  if (!(total > 0)) return 0;
  const ratio = Math.min(Math.max(received, 0) / total, 1);
  return roundCents(recognized * ratio);
}

/** What can still be allocated now: released minus already paid, never negative. */
export function allocableAmount(released: number, paid: number): number {
  return Math.max(0, toCents(released) - toCents(paid)) / 100;
}

/**
 * Entry status from the SUM of real payments (any channel). A partial payment never marks the whole
 * entry PAID. Payable channel stays PAYABLE, payroll channel stays APPROVED until fully paid.
 */
export function entryStatusAfterPayments(input: {
  recognized: number;
  paid: number;
  channel: 'PAYABLE' | 'PAYROLL';
}): 'PAID' | 'PAYABLE' | 'APPROVED' {
  if (toCents(input.paid) >= toCents(input.recognized)) return 'PAID';
  return input.channel === 'PAYABLE' ? 'PAYABLE' : 'APPROVED';
}
