export interface SupplierCommissionScope {
  id: string;
  employeeId: string | null;
  supplierId: string | null;
  categoryId: string | null;
}

export interface CommissionPayPolicy {
  mode: 'PER_ENTRY' | 'FIXED_DAY' | 'WINDOW';
  day: number | null;
  paymentDays: number;
}

function cents(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Amount must be finite and non-negative');
  return Math.round((value + Number.EPSILON) * 100);
}

/** Resolves the accepted precedence; a supplier rule cannot override employee-specific rules. */
export function resolveSupplierCommissionScope(
  scopes: readonly SupplierCommissionScope[],
  context: { employeeId: string; supplierId: string | null; categoryId: string | null },
): SupplierCommissionScope | null {
  const candidates: Array<[string | null, string | null, string | null]> = [];
  if (context.supplierId) candidates.push([context.employeeId, context.supplierId, null]);
  if (context.categoryId) candidates.push([context.employeeId, null, context.categoryId]);
  candidates.push([context.employeeId, null, null]);
  if (context.supplierId) candidates.push([null, context.supplierId, null]);
  if (context.categoryId) candidates.push([null, null, context.categoryId]);
  candidates.push([null, null, null]);
  for (const [employeeId, supplierId, categoryId] of candidates) {
    const match = scopes.find(scope => scope.employeeId === employeeId && scope.supplierId === supplierId && scope.categoryId === categoryId);
    if (match) return match;
  }
  return null;
}

/** The employee's supplier-gated amount is capped by the agency revenue received for that supplier. */
export function supplierPaymentReleaseCap(commission: number, receivedRevenue: number, expectedRevenue: number): number {
  const commissionCents = cents(commission);
  const receivedCents = cents(receivedRevenue);
  const expectedCents = cents(expectedRevenue);
  if (expectedCents === 0) return 0;
  const released = Math.floor((commissionCents * Math.min(receivedCents, expectedCents) + expectedCents / 2) / expectedCents);
  return Math.min(commissionCents, released) / 100;
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('Date must be YYYY-MM-DD');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new RangeError('Date must be a real civil date');
  return date;
}

function iso(date: Date): string { return date.toISOString().slice(0, 10); }
function monthDay(year: number, month: number, day: number): Date {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, last)));
}

/** Returns the next configured payment date after a commission becomes fully released. */
export function expectedCommissionPayDate(releasedOn: string, policy: CommissionPayPolicy): string {
  const released = parseDate(releasedOn);
  if (policy.mode === 'PER_ENTRY') return releasedOn;
  if (!Number.isInteger(policy.day) || policy.day! < 1 || policy.day! > 31) throw new RangeError('Payment day must be between 1 and 31');
  if (!Number.isInteger(policy.paymentDays) || policy.paymentDays < 0 || policy.paymentDays > 365) throw new RangeError('Payment days must be between 0 and 365');
  const year = released.getUTCFullYear();
  const month = released.getUTCMonth();
  let close = monthDay(year, month, policy.day!);
  if (iso(close) < releasedOn) close = monthDay(year, month + 1, policy.day!);
  if (policy.mode === 'FIXED_DAY') return iso(close);
  close.setUTCDate(close.getUTCDate() + policy.paymentDays);
  return iso(close);
}

/** The supplier's balance deadline is a civil calendar date, independent of server locale. */
export function resolveBalanceDeadlineDate(travelStartDate: string, daysBeforeTravel: number): string {
  const travelStart = parseDate(travelStartDate);
  if (!Number.isInteger(daysBeforeTravel) || daysBeforeTravel < 0 || daysBeforeTravel > 365) {
    throw new RangeError('Balance deadline days must be an integer from 0 to 365');
  }
  travelStart.setUTCDate(travelStart.getUTCDate() - daysBeforeTravel);
  return iso(travelStart);
}
