import { describe, expect, it } from 'vitest';
import {
  SALE_FORM_FIELDS,
  buildFormSnapshot,
  getSaleFormField,
  validateProfileRules,
  validateSaleFormValues,
  type SaleFormRule,
} from '../src/sale-form-fields';
import { FormFieldError, ValidationError } from '../src/errors';
import { SALE_FORM_FIELDS as FULL_SALE_FORM_FIELDS } from '../../api/src/sale-form-fields';
import { SALE_ITEM_LIMITS as FULL_LIMITS, computeLineTotal as fullLineTotal, saleItemAmountsError as fullAmountsError } from '../../api/src/sale-items';
import { SALE_ITEM_LIMITS, computeLineTotal, saleItemAmountsError } from '../src/sale-items';

function rules(...entries: Array<[string, boolean, boolean]>): SaleFormRule[] {
  return entries.map(([fieldKey, enabled, required]) => ({ fieldKey, enabled, required }));
}

describe('Lite sale form registry is a subset of the Full registry (ADR-008 / DEC-007)', () => {
  it('every field available in LITE exists in the Full registry with the same type, storage and lock', () => {
    const full = new Map(FULL_SALE_FORM_FIELDS.map((f) => [f.key, f]));
    expect(SALE_FORM_FIELDS.length).toBeGreaterThan(0);
    for (const field of SALE_FORM_FIELDS) {
      expect(field.availableIn).toContain('LITE');
      const counterpart = full.get(field.key);
      expect(counterpart, `Full is missing ${field.key}`).toBeDefined();
      expect(counterpart?.availableIn).toContain('LITE');
      expect(counterpart).toMatchObject({
        type: field.type,
        storage: field.storage,
        locked: field.locked,
        scope: field.scope,
      });
    }
  });

  it('does not expose a field the Full does not flag as available in LITE', () => {
    const liteKeys = new Set(SALE_FORM_FIELDS.map((f) => f.key));
    for (const field of FULL_SALE_FORM_FIELDS.filter((f) => f.availableIn.includes('LITE'))) {
      expect(liteKeys.has(field.key), `Lite is missing ${field.key} that the Full offers to LITE`).toBe(true);
    }
  });
});

describe('Lite item line total matches the Full oracle', () => {
  it.each([
    [1, 2000, 0, 300, 0],
    [3, 333.33, 10, 5.5, 1.25],
    [2, 0.1, 0, 0, 0],
    [1.5, 99.99, 5, 0, 0],
  ])('qty=%s price=%s discount=%s taxes=%s fees=%s', (qty, price, discount, taxes, fees) => {
    expect(computeLineTotal(qty, price, discount, taxes, fees)).toBe(fullLineTotal(qty, price, discount, taxes, fees));
  });
});

describe('Full and Lite reject exactly the same item amounts', () => {
  const base = { qty: 1, unitPrice: 10, taxes: 0, fees: 0, discount: 0 };
  const table = [
    base, { ...base, qty: 1.1 }, { ...base, qty: 2.25 }, { ...base, qty: 1.001 }, { ...base, qty: 0.001 }, { ...base, qty: 0 },
    { ...base, qty: 100000000 }, { ...base, unitPrice: 1.1 }, { ...base, unitPrice: 10.005 }, { ...base, unitPrice: -1 },
    { ...base, unitPrice: 10_000_000_000 }, { ...base, taxes: 1.005 }, { ...base, fees: -0.01 }, { ...base, discount: 20 },
    { ...base, qty: 99_999_999.99, unitPrice: 9_999_999_999.99 },
  ];
  it.each(table.map((v, i) => [i, v] as const))('case %i', (_i, v) => {
    expect(saleItemAmountsError(v) === null).toBe(fullAmountsError(v) === null);
  });
});

describe('Lite item precision is not above the Full', () => {
  it('declares the same limits as the Full sale_items (migration 055)', () => {
    expect(SALE_ITEM_LIMITS).toEqual(FULL_LIMITS);
  });
});

describe('Lite validateProfileRules', () => {
  it('rejects unknown keys, duplicates, required-but-disabled and disabling the locked sale_date', () => {
    expect(() => validateProfileRules(rules(['origin_text', true, true]))).not.toThrow();
    expect(() => validateProfileRules(rules(['nope', true, false]))).toThrow(ValidationError);
    expect(() => validateProfileRules(rules(['origin_text', true, false], ['origin_text', true, true]))).toThrow(ValidationError);
    expect(() => validateProfileRules(rules(['origin_text', false, true]))).toThrow(ValidationError);
    expect(() => validateProfileRules(rules(['sale_date', false, false]))).toThrow(ValidationError);
  });
});

describe('Lite validateSaleFormValues', () => {
  const profile = rules(['origin_text', true, true], ['destination_text', true, false], ['locator', false, false], ['passenger_count', true, false]);

  it('normalizes and accepts enabled fields', () => {
    expect(validateSaleFormValues(profile, { origin_text: '  POA ', passenger_count: 3 }, 'create')).toEqual({
      origin_text: 'POA',
      passenger_count: 3,
    });
  });

  it('create: missing required -> 422 FIELD_REQUIRED naming the field', () => {
    try {
      validateSaleFormValues(profile, { destination_text: 'LIS' }, 'create');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(FormFieldError);
      expect(error).toMatchObject({ statusCode: 422, code: 'FIELD_REQUIRED', fieldKey: 'origin_text' });
    }
  });

  it('disabled/unlisted fields are refused (FIELD_DISABLED), unknown keys FIELD_UNKNOWN', () => {
    expect(() => validateSaleFormValues(profile, { origin_text: 'A', locator: 'X' }, 'create')).toThrow(
      expect.objectContaining({ statusCode: 422, code: 'FIELD_DISABLED', fieldKey: 'locator' }),
    );
    expect(() => validateSaleFormValues(profile, { origin_text: 'A', airline: 'X' }, 'create')).toThrow(
      expect.objectContaining({ code: 'FIELD_DISABLED', fieldKey: 'airline' }),
    );
    expect(() => validateSaleFormValues(profile, { origin_text: 'A', bogus: 'x' }, 'create')).toThrow(
      expect.objectContaining({ code: 'FIELD_UNKNOWN' }),
    );
  });

  it('update checks only the keys sent; clearing a required field is refused', () => {
    expect(validateSaleFormValues(profile, { destination_text: 'LIS' }, 'update')).toEqual({ destination_text: 'LIS' });
    expect(() => validateSaleFormValues(profile, { origin_text: '' }, 'update')).toThrow(
      expect.objectContaining({ code: 'FIELD_REQUIRED' }),
    );
  });

  it('types, ranges, dates and date order -> FIELD_INVALID', () => {
    const wide = rules(['passenger_count', true, false], ['travel_start_date', true, false], ['travel_end_date', true, false]);
    for (const values of [{ passenger_count: 0 }, { passenger_count: 1.5 }, { passenger_count: '2' }, { travel_start_date: '2026-02-30' }]) {
      expect(() => validateSaleFormValues(wide, values, 'create')).toThrow(expect.objectContaining({ code: 'FIELD_INVALID' }));
    }
    expect(() =>
      validateSaleFormValues(wide, { travel_start_date: '2026-12-20', travel_end_date: '2026-12-10' }, 'create'),
    ).toThrow(expect.objectContaining({ code: 'FIELD_INVALID', fieldKey: 'travel_end_date' }));
  });

  it('sale_date is locked: always allowed', () => {
    expect(validateSaleFormValues([], { sale_date: '2026-10-01' }, 'create')).toEqual({ sale_date: '2026-10-01' });
    expect(getSaleFormField('sale_date')?.locked).toBe(true);
  });
});

describe('Lite buildFormSnapshot', () => {
  it('is self-contained (category, revision, labels, rules)', () => {
    const snapshot = buildFormSnapshot({ id: 'c1', name: 'Aéreo', formRevision: 2 }, rules(['origin_text', true, true]));
    expect(snapshot).toMatchObject({
      categoryId: 'c1',
      categoryName: 'Aéreo',
      formRevision: 2,
      fields: [{ fieldKey: 'origin_text', enabled: true, required: true }],
    });
  });
});
