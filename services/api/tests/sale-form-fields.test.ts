/* eslint-disable @typescript-eslint/no-unsafe-assignment -- expect.any() matchers */
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

function rules(...entries: Array<[string, boolean, boolean]>): SaleFormRule[] {
  return entries.map(([fieldKey, enabled, required]) => ({ fieldKey, enabled, required }));
}

describe('sale form field registry (ADR-008)', () => {
  it('has unique keys and every field declares where it is available', () => {
    const keys = SALE_FORM_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const field of SALE_FORM_FIELDS) {
      expect(field.availableIn.length).toBeGreaterThan(0);
      expect(field.availableIn).toContain('FULL');
      expect(['column', 'modality']).toContain(field.storage);
    }
  });

  it('locks sale_date and keeps the first-class report fields as columns', () => {
    expect(getSaleFormField('sale_date')?.locked).toBe(true);
    for (const key of ['travel_start_date', 'travel_end_date', 'origin_text', 'destination_text', 'passenger_count']) {
      expect(getSaleFormField(key)?.storage).toBe('column');
    }
  });

  it('never names a commission, rate, base or deadline field (mass-assignment guard)', () => {
    const keys = SALE_FORM_FIELDS.map((f) => f.key);
    for (const forbidden of ['rate', 'base', 'deadline', 'commission']) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe('validateProfileRules', () => {
  it('accepts a valid profile', () => {
    expect(() =>
      validateProfileRules(rules(['origin_text', true, true], ['destination_text', true, false], ['locator', false, false])),
    ).not.toThrow();
  });

  it('rejects unknown keys, duplicates, required-but-disabled and disabling a locked field with 400', () => {
    expect(() => validateProfileRules(rules(['nope', true, false]))).toThrow(ValidationError);
    expect(() => validateProfileRules(rules(['origin_text', true, false], ['origin_text', true, true]))).toThrow(ValidationError);
    expect(() => validateProfileRules(rules(['origin_text', false, true]))).toThrow(ValidationError);
    expect(() => validateProfileRules(rules(['sale_date', false, false]))).toThrow(ValidationError);
  });
});

describe('validateSaleFormValues', () => {
  const profile = rules(['origin_text', true, true], ['destination_text', true, false], ['locator', false, false], ['passenger_count', true, false]);

  it('returns normalized values for enabled fields', () => {
    const result = validateSaleFormValues(profile, { origin_text: '  Porto Alegre ', passenger_count: 3 }, 'create');
    expect(result).toEqual({ origin_text: 'Porto Alegre', passenger_count: 3 });
  });

  it('create: a required enabled field that is missing or blank -> 422 FIELD_REQUIRED', () => {
    for (const values of [{}, { origin_text: '   ' }, { origin_text: null }]) {
      try {
        validateSaleFormValues(profile, values, 'create');
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(FormFieldError);
        expect(error).toMatchObject({ statusCode: 422, code: 'FIELD_REQUIRED', fieldKey: 'origin_text' });
      }
    }
  });

  it('a value for a disabled field is refused, never silently dropped -> 422 FIELD_DISABLED', () => {
    expect(() => validateSaleFormValues(profile, { origin_text: 'A', locator: 'ABC123' }, 'create')).toThrow(
      expect.objectContaining({ statusCode: 422, code: 'FIELD_DISABLED', fieldKey: 'locator' }),
    );
  });

  it('a field absent from the profile counts as disabled', () => {
    expect(() => validateSaleFormValues(profile, { origin_text: 'A', airline: 'X' }, 'create')).toThrow(
      expect.objectContaining({ code: 'FIELD_DISABLED', fieldKey: 'airline' }),
    );
  });

  it('unknown field keys -> 422 FIELD_UNKNOWN', () => {
    expect(() => validateSaleFormValues(profile, { origin_text: 'A', bogus: 'x' }, 'create')).toThrow(
      expect.objectContaining({ code: 'FIELD_UNKNOWN', fieldKey: 'bogus' }),
    );
  });

  it('update validates only the fields that were sent (old sales without the new required field stay editable)', () => {
    expect(validateSaleFormValues(profile, { destination_text: 'Lisboa' }, 'update')).toEqual({ destination_text: 'Lisboa' });
    expect(() => validateSaleFormValues(profile, { origin_text: '' }, 'update')).toThrow(
      expect.objectContaining({ code: 'FIELD_REQUIRED', fieldKey: 'origin_text' }),
    );
  });

  it('validates types and ranges -> 422 FIELD_INVALID', () => {
    for (const values of [{ passenger_count: 0 }, { passenger_count: 1.5 }, { passenger_count: '2' }, { travel_start_date: '2026-02-30' }]) {
      const wide = rules(['origin_text', true, false], ['passenger_count', true, false], ['travel_start_date', true, false]);
      expect(() => validateSaleFormValues(wide, values, 'create')).toThrow(expect.objectContaining({ code: 'FIELD_INVALID' }));
    }
  });

  it('travel_end_date before travel_start_date is invalid', () => {
    const wide = rules(['travel_start_date', true, false], ['travel_end_date', true, false]);
    expect(() =>
      validateSaleFormValues(wide, { travel_start_date: '2026-12-20', travel_end_date: '2026-12-10' }, 'create'),
    ).toThrow(expect.objectContaining({ code: 'FIELD_INVALID', fieldKey: 'travel_end_date' }));
  });

  it('sale_date is locked: always allowed, optional', () => {
    expect(validateSaleFormValues([], { sale_date: '2026-10-01' }, 'create')).toEqual({ sale_date: '2026-10-01' });
  });
});

describe('buildFormSnapshot', () => {
  it('is self-contained: category, revision, labels and rules at sale time', () => {
    const snapshot = buildFormSnapshot({ id: 'c1', name: 'Aéreo', formRevision: 4 }, rules(['origin_text', true, true]));
    expect(snapshot).toMatchObject({
      categoryId: 'c1',
      categoryName: 'Aéreo',
      formRevision: 4,
      fields: [{ fieldKey: 'origin_text', label: expect.any(String), enabled: true, required: true }],
    });
    expect(typeof snapshot.capturedAt).toBe('string');
  });
});
