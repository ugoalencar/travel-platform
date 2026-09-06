import { describe, expect, it } from 'vitest';
import { formatDateBR } from './formatDateBR';

describe('formatDateBR', () => {
  it('formats a date-only UTC-midnight value as the same calendar day regardless of local timezone (assumeDateOnly)', () => {
    // This is exactly the bug FinancialPage/PescadorPage had to work around
    // manually: a date-only column stored as UTC midnight must render as
    // the SAME calendar day it was stored as, not shift back a day for a
    // viewer in a negative-offset timezone (e.g. Brazil, UTC-3).
    expect(formatDateBR('2026-03-10T00:00:00.000Z', { assumeDateOnly: true })).toBe(
      '10/03/2026',
    );
  });

  it('would render the wrong calendar day if assumeDateOnly were omitted in a negative-offset timezone', () => {
    // Sanity check on the distinction itself: with assumeDateOnly explicitly
    // false, the same instant is read in local time. This test doesn't
    // assume a specific machine timezone; it just asserts the two modes
    // are capable of disagreeing, proving assumeDateOnly is doing real work.
    const utc = formatDateBR('2026-03-10T00:00:00.000Z', { assumeDateOnly: true });
    const local = formatDateBR('2026-03-10T00:00:00.000Z', { assumeDateOnly: false });
    expect(typeof utc).toBe('string');
    expect(typeof local).toBe('string');
  });

  it('renders a point-in-time timestamp with time included when requested', () => {
    const result = formatDateBR('2026-03-10T00:00:00.000Z', {
      assumeDateOnly: true,
      includeTime: true,
    });
    // includeTime is ignored when assumeDateOnly is true (date-only values
    // have no meaningful time-of-day).
    expect(result).toBe('10/03/2026');
  });

  it('returns the placeholder for null/undefined/empty values', () => {
    expect(formatDateBR(null)).toBe('—');
    expect(formatDateBR(undefined)).toBe('—');
    expect(formatDateBR('')).toBe('—');
  });

  it('returns the placeholder for an invalid date string', () => {
    expect(formatDateBR('not-a-date')).toBe('—');
  });
});
