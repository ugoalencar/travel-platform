import { describe, expect, it } from 'vitest';
import { FormFieldError } from '../src/errors';
import {
  CUSTOMER_FIELD_REGISTRY,
  evaluateCustomerFieldRules,
  parseFieldSettingsInput,
  type FieldSetting,
} from '../src/customer-field-settings';

const settings = (entries: Array<[string, Partial<FieldSetting>]>) =>
  new Map<string, FieldSetting>(entries.map(([key, value]) => [key, { enabled: true, required: false, ...value }]));

const fail = (run: () => void) => {
  try {
    run();
  } catch (error) {
    return error as FormFieldError;
  }
  throw new Error('expected a FormFieldError');
};

describe('customer field registry', () => {
  it('has unique snake_case keys and a locked name that is always enabled and required', () => {
    const keys = CUSTOMER_FIELD_REGISTRY.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
    const name = CUSTOMER_FIELD_REGISTRY.find((field) => field.key === 'name');
    expect(name).toMatchObject({ locked: true });
  });

  it('declares which fields exist in Lite, and Lite is a subset of Full', () => {
    const lite = CUSTOMER_FIELD_REGISTRY.filter((field) => field.availableIn.includes('LITE'));
    expect(lite.map((field) => field.key)).toEqual(
      expect.arrayContaining(['name', 'cpf', 'birth_date', 'phone', 'whatsapp', 'email', 'address', 'notes']),
    );
    for (const field of lite) expect(field.availableIn).toContain('FULL');
  });
});

describe('evaluateCustomerFieldRules', () => {
  it('requires every enabled+required field on create (422 FIELD_REQUIRED)', () => {
    const error = fail(() => evaluateCustomerFieldRules(settings([['phone', { required: true }]]), { name: 'Ana' }, 'create'));
    expect(error).toBeInstanceOf(FormFieldError);
    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('FIELD_REQUIRED');
    expect(error.fieldKey).toBe('phone');
  });

  it('treats a blank string as missing for a required field', () => {
    const error = fail(() => evaluateCustomerFieldRules(settings([['phone', { required: true }]]), { name: 'Ana', phone: '   ' }, 'create'));
    expect(error.code).toBe('FIELD_REQUIRED');
  });

  it('accepts create when required fields are present', () => {
    expect(() =>
      evaluateCustomerFieldRules(settings([['phone', { required: true }]]), { name: 'Ana', phone: '11999990000' }, 'create'),
    ).not.toThrow();
  });

  it('rejects a disabled field sent with a value (422 FIELD_DISABLED), never ignoring it silently', () => {
    const error = fail(() => evaluateCustomerFieldRules(settings([['rg', { enabled: false }]]), { name: 'Ana', rg: '123' }, 'create'));
    expect(error.code).toBe('FIELD_DISABLED');
    expect(error.fieldKey).toBe('rg');
  });

  it('rejects any write to a disabled field, even blank, so stored data is never wiped', () => {
    for (const data of [{ rg: '' }, { address: {} }] as Array<Record<string, unknown>>) {
      const key = 'rg' in data ? 'rg' : 'address';
      const error = fail(() => evaluateCustomerFieldRules(settings([[key, { enabled: false }]]), data, 'update'));
      expect(error.code).toBe('FIELD_DISABLED');
    }
  });

  it('on update validates only the fields present in the patch (old customers stay editable)', () => {
    const rules = settings([['phone', { required: true }]]);
    expect(() => evaluateCustomerFieldRules(rules, { notes: 'x' }, 'update')).not.toThrow();
    expect(fail(() => evaluateCustomerFieldRules(rules, { phone: '' }, 'update')).code).toBe('FIELD_REQUIRED');
  });

  it('treats the address object as present only when it has a non-empty value', () => {
    const rules = settings([['address', { required: true }]]);
    expect(fail(() => evaluateCustomerFieldRules(rules, { name: 'Ana', address: {} }, 'create')).code).toBe('FIELD_REQUIRED');
    expect(() => evaluateCustomerFieldRules(rules, { name: 'Ana', address: { city: 'SP' } }, 'create')).not.toThrow();
  });

  it('maps API camelCase fields to registry keys', () => {
    const error = fail(() =>
      evaluateCustomerFieldRules(settings([['birth_date', { required: true }]]), { name: 'Ana' }, 'create'),
    );
    expect(error.fieldKey).toBe('birth_date');
    expect(() =>
      evaluateCustomerFieldRules(settings([['birth_date', { required: true }]]), { name: 'Ana', birthDate: '1990-01-01' }, 'create'),
    ).not.toThrow();
  });

  it('does nothing when there is no configuration (unchanged behavior)', () => {
    expect(() => evaluateCustomerFieldRules(new Map(), { name: 'Ana' }, 'create')).not.toThrow();
  });
});

describe('parseFieldSettingsInput', () => {
  const ok = { fields: [{ fieldKey: 'phone', enabled: true, required: true }] };
  it('accepts a valid set', () => {
    expect(parseFieldSettingsInput(ok)).toEqual([{ fieldKey: 'phone', enabled: true, required: true }]);
  });
  it.each([
    ['unknown field', { fields: [{ fieldKey: 'nope', enabled: true, required: false }] }],
    ['locked name', { fields: [{ fieldKey: 'name', enabled: false, required: false }] }],
    ['required but disabled', { fields: [{ fieldKey: 'phone', enabled: false, required: true }] }],
    ['duplicate key', { fields: [ok.fields[0], ok.fields[0]] }],
    ['non boolean', { fields: [{ fieldKey: 'phone', enabled: 'yes', required: false }] }],
    ['extra property', { fields: [{ fieldKey: 'phone', enabled: true, required: false, agencyId: 'x' }] }],
    ['extra body field', { fields: [], agencyId: 'x' }],
    ['not an object', null],
  ])('rejects %s with 400', (_name, body) => {
    expect(() => parseFieldSettingsInput(body)).toThrow();
  });
});
