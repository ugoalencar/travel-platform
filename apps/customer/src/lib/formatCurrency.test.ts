import { describe, expect, it } from 'vitest';
import { formatBRL } from './formatCurrency';

describe('formatBRL', () => {
  it('formats a number as pt-BR currency', () => {
    expect(formatBRL(1234.5)).toBe('R$ 1.234,50');
  });

  it('formats zero correctly', () => {
    expect(formatBRL(0)).toBe('R$ 0,00');
  });

  it('returns a placeholder for null/undefined instead of rendering the literal value', () => {
    expect(formatBRL(null)).toBe('—');
    expect(formatBRL(undefined)).toBe('—');
  });

  it('supports a custom placeholder', () => {
    expect(formatBRL(null, 'N/A')).toBe('N/A');
  });
});
