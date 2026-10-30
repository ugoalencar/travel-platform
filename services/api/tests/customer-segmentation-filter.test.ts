import { describe, expect, it } from 'vitest';
import { compileCustomerFilter } from '../src/customer-segmentation';

describe('compileCustomerFilter', () => {
  it('adds scenario marker values as SQL parameters, never as SQL text', () => {
    const marker = "DEMO-FIN-2026-10%' OR TRUE --";
    const compiled = compileCustomerFilter({
      operator: 'AND',
      conditions: [{ field: 'customer.notes', operator: 'CONTAINS', value: marker }],
    }, ['agency-1']);

    expect(compiled.whereSql).toBe('c.notes ILIKE $2');
    expect(compiled.values).toEqual(['agency-1', `%${marker}%`]);
    expect(compiled.whereSql).not.toContain(marker);
  });

  it('rejects fields outside the customer segment allowlist', () => {
    expect(() => compileCustomerFilter({
      operator: 'AND',
      conditions: [{ field: 'customer.sql', operator: 'CONTAINS', value: 'anything' }],
    })).toThrow(/Unknown or unsupported filter field/);
  });
});
