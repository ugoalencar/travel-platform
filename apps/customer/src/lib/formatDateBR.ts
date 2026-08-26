// Single shared pt-BR date/time formatter for the customer app.
//
// WHY THIS FILE EXISTS (read this before adding a new date-formatting call
// site anywhere in the app):
//
// A persisted value can mean one of two different things, and each needs a
// different timezone treatment when rendered for a Brazil-based viewer:
//
//   1. A pure CALENDAR DATE (e.g. Offer.validFrom, Proposal.validUntil,
//      Receivable.dueAt) -- conceptually just "a day", with no meaningful
//      time-of-day. These columns are typically persisted as UTC midnight
//      (e.g. `2026-03-10T00:00:00.000Z`). If you format that with the
//      viewer's LOCAL timezone, a Brazil-based viewer (UTC-3) will see it
//      shift back to the previous day (`2026-03-09`) -- the calendar date
//      silently becomes wrong. These must be read back out as UTC so the
//      calendar day that was stored is the calendar day that is shown.
//
//   2. A real POINT IN TIME (e.g. createdAt, updatedAt, a checkpoint
//      timestamp) -- an actual instant that should be localized to the
//      viewer's own timezone, the normal way `toLocaleString` works.
//
// Mixing these up is a real bug this codebase has already shipped once
// (FinancialPage/PescadorPage hard-coded `timeZone: 'UTC'` for everything,
// while most other screens called `new Date(x).toLocaleDateString('pt-BR')`
// with no explicit timezone at all -- an inconsistency with no domain
// reason). `formatDateBR` forces every call site to make the choice
// explicit via `assumeDateOnly` instead of silently defaulting either way.
export interface FormatDateBROptions {
  /**
   * Pass `true` when `value` represents a pure calendar date persisted as
   * UTC midnight (e.g. a `validFrom`/`validUntil`/`dueAt` column) -- the
   * value is read back in UTC so the stored calendar day is what's shown.
   * Pass `false` (default) when `value` is a real point-in-time timestamp
   * (e.g. `createdAt`) that should render in the viewer's local time.
   */
  assumeDateOnly?: boolean;
  /** Also render hours/minutes. Ignored when `assumeDateOnly` is true. */
  includeTime?: boolean;
}

/**
 * Formats an ISO date/timestamp string (or Date) as a pt-BR date, e.g.
 * `10/03/2026`. See the file header for the UTC-vs-local distinction this
 * function exists to make explicit.
 */
export function formatDateBR(
  value: string | Date | null | undefined,
  options: FormatDateBROptions = {},
  placeholder = '—',
): string {
  if (value === null || value === undefined || value === '') {
    return placeholder;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return placeholder;
  }

  const { assumeDateOnly = false, includeTime = false } = options;

  const formatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(includeTime && !assumeDateOnly
      ? { hour: '2-digit' as const, minute: '2-digit' as const }
      : {}),
    ...(assumeDateOnly ? { timeZone: 'UTC' } : {}),
  });

  return formatter.format(date);
}
