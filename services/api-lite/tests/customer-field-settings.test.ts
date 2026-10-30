import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../src/access';
import { CUSTOMER_FIELD_REGISTRY, evaluateCustomerFieldRules } from '../src/customer-field-settings';
import { FormFieldError } from '../src/errors';
import { CUSTOMER_FIELD_REGISTRY as FULL_REGISTRY } from '../../api/src/customer-field-settings';
import { createLiteFixture, type LiteFixture } from './helpers/fixture';

describe('Lite customer field registry', () => {
  it('is a subset of the Full registry with the same keys and labels (DEC-007)', () => {
    const full = new Map(FULL_REGISTRY.map((field) => [field.key, field]));
    for (const field of CUSTOMER_FIELD_REGISTRY) {
      const counterpart = full.get(field.key);
      expect(counterpart, `Full has no field ${field.key}`).toBeDefined();
      expect(counterpart?.label).toBe(field.label);
      expect(counterpart?.availableIn).toContain('LITE');
    }
    expect(CUSTOMER_FIELD_REGISTRY.map((field) => field.key).sort()).toEqual(
      FULL_REGISTRY.filter((field) => field.availableIn.includes('LITE')).map((field) => field.key).sort(),
    );
  });

  it('declares the new administrator permission', () => {
    expect(PERMISSIONS).toContain('customers.fields_manage');
  });
});

describe('evaluateCustomerFieldRules (Lite)', () => {
  const rules = (entries: Array<[string, { enabled: boolean; required: boolean }]>) => new Map(entries);

  it('requires address when any address column is the only content missing', () => {
    expect(() =>
      evaluateCustomerFieldRules(rules([['address', { enabled: true, required: true }]]), { name: 'Ana' }, 'create'),
    ).toThrowError(FormFieldError);
    expect(() =>
      evaluateCustomerFieldRules(rules([['address', { enabled: true, required: true }]]), { name: 'Ana', city: 'SP' }, 'create'),
    ).not.toThrow();
  });

  it('rejects any write to a disabled field, even blank or null, so stored data is never wiped', () => {
    const disabled = rules([['address', { enabled: false, required: false }]]);
    for (const data of [{ street: 'Rua A' }, { street: '' }, { city: null }]) {
      expect(() => evaluateCustomerFieldRules(disabled, data, 'update')).toThrowError(FormFieldError);
    }
    expect(() => evaluateCustomerFieldRules(disabled, { notes: 'x' }, 'update')).not.toThrow();
  });

  it('on update only checks the fields present', () => {
    const phone = rules([['phone', { enabled: true, required: true }]]);
    expect(() => evaluateCustomerFieldRules(phone, { notes: 'x' }, 'update')).not.toThrow();
    expect(() => evaluateCustomerFieldRules(phone, { phone: '' }, 'update')).toThrowError(FormFieldError);
  });
});

describe('Lite customer field settings over HTTP', () => {
  let lite: LiteFixture;
  let adminToken: string;
  let masterToken: string;
  let staffToken: string;
  let viewerToken: string;
  let adminBToken: string;

  beforeAll(async () => {
    lite = await createLiteFixture();
    adminToken = await lite.login('tenant-a', 'admin@a.test');
    masterToken = await lite.login('tenant-a', 'master@a.test');
    staffToken = await lite.login('tenant-a', 'staff@a.test');
    viewerToken = await lite.login('tenant-a', 'viewer@a.test');
    adminBToken = await lite.login('tenant-b', 'admin@b.test');
  });
  afterAll(async () => {
    await lite?.close();
  });
  beforeEach(async () => {
    await lite.adminPool.query('DELETE FROM customer_field_settings');
  });

  const save = (token: string, fields: unknown) =>
    lite.app.inject({
      method: 'PUT',
      url: '/settings/customers/field-settings',
      headers: lite.headers(token),
      payload: { fields } as object,
    });
  const create = (token: string, payload: Record<string, unknown>) =>
    lite.app.inject({ method: 'POST', url: '/customers', headers: lite.headers(token), payload });
  const phoneRequired = [{ field_key: 'phone', enabled: true, required: true }];

  it('requires authentication and the customers.fields_manage permission', async () => {
    const anonymous = await lite.app.inject({ method: 'PUT', url: '/settings/customers/field-settings', payload: { fields: [] } });
    expect(anonymous.statusCode).toBe(401);
    expect((await save(staffToken, phoneRequired)).statusCode).toBe(403);
    expect((await save(viewerToken, phoneRequired)).statusCode).toBe(403);
    expect((await save(adminToken, phoneRequired)).statusCode).toBe(200);
    expect((await save(masterToken, phoneRequired)).statusCode).toBe(200);
  });

  it('is not delegable: a user granted customers.fields_manage by hand still gets 403 (same as Full)', async () => {
    await lite.adminPool.query(
      `INSERT INTO user_permissions (tenant_id, user_id, permission, effect) VALUES ($1, $2, 'customers.fields_manage', 'GRANT')
       ON CONFLICT DO NOTHING`,
      [lite.tenantA, lite.staffA],
    );
    try {
      expect((await save(staffToken, phoneRequired)).statusCode).toBe(403);
    } finally {
      await lite.adminPool.query(`DELETE FROM user_permissions WHERE user_id = $1 AND permission = 'customers.fields_manage'`, [lite.staffA]);
    }
  });

  it('lets any authenticated user read the effective form, with name locked', async () => {
    await save(adminToken, phoneRequired);
    const read = await lite.app.inject({ method: 'GET', url: '/customers/field-settings', headers: lite.headers(viewerToken) });
    expect(read.statusCode).toBe(200);
    const { fields } = read.json<{ fields: Array<{ field_key: string; enabled: boolean; required: boolean; locked: boolean }> }>();
    expect(fields.find((field) => field.field_key === 'phone')).toMatchObject({ enabled: true, required: true, locked: false });
    expect(fields.find((field) => field.field_key === 'name')).toMatchObject({ enabled: true, required: true, locked: true });
  });

  it.each([
    [{ field_key: 'name', enabled: false, required: false }],
    [{ field_key: 'rg', enabled: true, required: false }],
    [{ field_key: 'phone', enabled: false, required: true }],
    [{ field_key: 'phone', enabled: true, required: false, tenant_id: 'x' }],
  ])('rejects invalid configuration %j with 400', async (field) => {
    expect((await save(adminToken, [field])).statusCode).toBe(400);
  });

  it('enforces required on create (422 FIELD_REQUIRED) and accepts when present', async () => {
    await save(adminToken, phoneRequired);
    const missing = await create(staffToken, { name: 'Ana' });
    expect(missing.statusCode).toBe(422);
    expect(missing.json()).toMatchObject({ code: 'FIELD_REQUIRED' });
    expect((await create(staffToken, { name: 'Ana', phone: '11999990000' })).statusCode).toBe(201);
  });

  it('rejects a disabled field sent with a value (422 FIELD_DISABLED)', async () => {
    await save(adminToken, [{ field_key: 'notes', enabled: false, required: false }]);
    const response = await create(staffToken, { name: 'Bia', notes: 'x' });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'FIELD_DISABLED' });
  });

  it('keeps old customers editable: patch validates only present fields', async () => {
    const created = await create(staffToken, { name: 'Cris' });
    const id = created.json<{ customer: { id: string } }>().customer.id;
    await save(adminToken, phoneRequired);
    const ok = await lite.app.inject({ method: 'PATCH', url: `/customers/${id}`, headers: lite.headers(staffToken), payload: { notes: 'ok' } });
    expect(ok.statusCode).toBe(200);
    const blank = await lite.app.inject({ method: 'PATCH', url: `/customers/${id}`, headers: lite.headers(staffToken), payload: { phone: '' } });
    expect(blank.statusCode).toBe(422);
  });

  it('is per tenant', async () => {
    await save(adminToken, phoneRequired);
    const other = await lite.app.inject({ method: 'GET', url: '/customers/field-settings', headers: lite.headers(adminBToken) });
    const { fields } = other.json<{ fields: Array<{ field_key: string; required: boolean }> }>();
    expect(fields.find((field) => field.field_key === 'phone')?.required).toBe(false);
  });

  it('audits one event per real change and none for a no-op', async () => {
    const count = async () =>
      (
        await lite.adminPool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = $1 AND event_type = 'CUSTOMER_FIELD_SETTINGS_CHANGED'`,
          [lite.tenantA],
        )
      ).rows[0]!.n;
    const before = await count();
    await save(adminToken, phoneRequired);
    expect(await count()).toBe(before + 1);
    await save(adminToken, phoneRequired);
    expect(await count()).toBe(before + 1);
    // many changes at once: one event each, none truncated
    const many = ['phone', 'cpf', 'whatsapp', 'email', 'notes', 'birth_date'].map((field_key) => ({
      field_key,
      enabled: false,
      required: false,
    }));
    await save(adminToken, many);
    expect(await count()).toBe(before + 1 + many.length);
  });

  it('the database refuses required-but-disabled and a name row', async () => {
    await expect(
      lite.adminPool.query(
        `INSERT INTO customer_field_settings (tenant_id, field_key, enabled, required) VALUES ($1, 'phone', false, true)`,
        [lite.tenantA],
      ),
    ).rejects.toThrow();
    await expect(
      lite.adminPool.query(
        `INSERT INTO customer_field_settings (tenant_id, field_key, enabled, required) VALUES ($1, 'name', true, false)`,
        [lite.tenantA],
      ),
    ).rejects.toThrow();
  });
});
