import { describe, expect, it } from 'vitest';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { AddressType } from '../../../packages/domain/types';
import {
  createAddress,
  deleteAddress,
  getAddressById,
  listAddresses,
  updateAddress,
} from '../src/customer-addresses';
import { ValidationError } from '../src/errors';
import {
  addressRow,
  AGENCY_A,
  AGENCY_B,
  CONTEXT_A,
  CONTEXT_B,
  CUSTOMER_A,
  createFakeDatabase,
} from './helpers/fake-database';

const validInput = {
  customerId: CUSTOMER_A,
  street: 'Rua Um',
  number: '100',
  district: 'Centro',
  city: 'Sao Paulo',
  state: 'SP',
};

describe('customer addresses -- tenant scoping', () => {
  it('fails closed when no tenant context is established', async () => {
    const database = createFakeDatabase();

    await expect(listAddresses(database, CUSTOMER_A)).rejects.toThrow();
    await expect(getAddressById(database, 'addr-1')).rejects.toThrow();
    await expect(createAddress(database, validInput)).rejects.toThrow();
    await expect(updateAddress(database, 'addr-1', { city: 'Rio' })).rejects.toThrow();
    await expect(deleteAddress(database, 'addr-1')).rejects.toThrow();
    expect(database.queries).toHaveLength(0);
  });

  it('binds the caller own agency id on every read and write', async () => {
    const database = createFakeDatabase(() => [addressRow()]);

    await runWithTenantContext(CONTEXT_A, async () => {
      await listAddresses(database, CUSTOMER_A);
      await getAddressById(database, 'addr-1');
      await createAddress(database, validInput);
      await updateAddress(database, 'addr-1', { city: 'Rio' });
      await deleteAddress(database, 'addr-1');
    });

    const tableQueries = database.find('customer_addresses');
    expect(tableQueries.length).toBeGreaterThan(0);
    for (const query of tableQueries) {
      // Reads and writes filter on the tenant; the insert binds it as the
      // first column. Either way $1 is always the caller's own agency.
      if (query.text.includes('INSERT INTO')) {
        expect(query.text).toContain('(agency_id,');
      } else {
        expect(query.text).toContain('agency_id = $1');
      }
      expect(query.values[0]).toBe(AGENCY_A);
      expect(query.values).not.toContain(AGENCY_B);
    }
  });

  it('cannot be steered to another tenant by the ambient context', async () => {
    const database = createFakeDatabase(() => [addressRow({ agency_id: AGENCY_B })]);

    await runWithTenantContext(CONTEXT_B, async () => {
      await listAddresses(database, CUSTOMER_A);
    });

    expect(database.findOne('SELECT').values[0]).toBe(AGENCY_B);
  });
});

describe('customer addresses -- CRUD', () => {
  it('lists only non-deleted addresses, primary first', async () => {
    const database = createFakeDatabase(() => [addressRow({ is_primary: true })]);

    const addresses = await runWithTenantContext(CONTEXT_A, () =>
      listAddresses(database, CUSTOMER_A),
    );

    const query = database.findOne('SELECT');
    expect(query.text).toContain('deleted_at IS NULL');
    expect(query.text).toContain('ORDER BY is_primary DESC');
    expect(addresses).toHaveLength(1);
    expect(addresses[0]?.isPrimary).toBe(true);
  });

  it('maps snake_case rows onto camelCase domain objects', async () => {
    const database = createFakeDatabase(() => [
      addressRow({ is_primary: true, complement: 'Apto 12', deleted_at: null }),
    ]);

    const address = await runWithTenantContext(CONTEXT_A, () =>
      getAddressById(database, 'addr-1'),
    );

    expect(address).toMatchObject({
      id: 'addr-1',
      agencyId: AGENCY_A,
      customerId: CUSTOMER_A,
      type: AddressType.RESIDENTIAL,
      isPrimary: true,
      complement: 'Apto 12',
      city: 'Sao Paulo',
    });
    expect(address?.createdAt).toBeInstanceOf(Date);
    expect(address).not.toHaveProperty('deletedAt');
  });

  it('returns null when the address does not exist in this tenant', async () => {
    const database = createFakeDatabase(() => []);

    const address = await runWithTenantContext(CONTEXT_A, () =>
      getAddressById(database, 'addr-missing'),
    );

    expect(address).toBeNull();
  });

  it('defaults type and country on create', async () => {
    const database = createFakeDatabase(() => [addressRow()]);

    await runWithTenantContext(CONTEXT_A, () => createAddress(database, validInput));

    const insert = database.findOne('INSERT INTO customer_addresses');
    expect(insert.values).toContain(AddressType.RESIDENTIAL);
    expect(insert.values).toContain('Brazil');
  });

  it('returns the unchanged address when an update carries no fields', async () => {
    const database = createFakeDatabase(() => [addressRow()]);

    await runWithTenantContext(CONTEXT_A, () => updateAddress(database, 'addr-1', {}));

    expect(database.find('UPDATE customer_addresses')).toHaveLength(0);
    expect(database.find('SELECT')).toHaveLength(1);
  });

  it('returns null when updating an address that is absent or soft-deleted', async () => {
    const database = createFakeDatabase(() => []);

    const address = await runWithTenantContext(CONTEXT_A, () =>
      updateAddress(database, 'addr-1', { city: 'Rio' }),
    );

    expect(address).toBeNull();
  });
});

describe('customer addresses -- primary uniqueness', () => {
  it('demotes the existing primary before inserting a new primary', async () => {
    const database = createFakeDatabase(() => [addressRow({ is_primary: true })]);

    await runWithTenantContext(CONTEXT_A, () =>
      createAddress(database, { ...validInput, isPrimary: true }),
    );

    const demote = database.findOne('SET is_primary = false');
    const insert = database.findOne('INSERT INTO customer_addresses');

    expect(database.queries.indexOf(demote)).toBeLessThan(database.queries.indexOf(insert));
    expect(demote.values).toEqual([AGENCY_A, CUSTOMER_A, null]);
  });

  it('does not demote anything when the new address is not primary', async () => {
    const database = createFakeDatabase(() => [addressRow()]);

    await runWithTenantContext(CONTEXT_A, () => createAddress(database, validInput));

    expect(database.find('SET is_primary = false')).toHaveLength(0);
  });

  it('demotes siblings but exempts the row being promoted on update', async () => {
    const database = createFakeDatabase((query) =>
      query.text.includes('SELECT customer_id')
        ? [{ customer_id: CUSTOMER_A }]
        : [addressRow({ is_primary: true })],
    );

    await runWithTenantContext(CONTEXT_A, () =>
      updateAddress(database, 'addr-1', { isPrimary: true }),
    );

    const demote = database.findOne('SET is_primary = false');
    expect(demote.values).toEqual([AGENCY_A, CUSTOMER_A, 'addr-1']);
    expect(demote.text).toContain('id <> $3');
  });

  it('returns null without demoting when promoting a nonexistent address', async () => {
    const database = createFakeDatabase(() => []);

    const address = await runWithTenantContext(CONTEXT_A, () =>
      updateAddress(database, 'addr-missing', { isPrimary: true }),
    );

    expect(address).toBeNull();
    expect(database.find('SET is_primary = false')).toHaveLength(0);
  });
});

describe('customer addresses -- soft delete', () => {
  it('stamps deleted_at instead of issuing a DELETE', async () => {
    const database = createFakeDatabase(() => [
      addressRow({ deleted_at: '2026-08-29T12:00:00.000Z' }),
    ]);

    const address = await runWithTenantContext(CONTEXT_A, () =>
      deleteAddress(database, 'addr-1'),
    );

    expect(database.find('DELETE FROM')).toHaveLength(0);
    const update = database.findOne('SET deleted_at = now()');
    expect(update.text).toContain('deleted_at IS NULL');
    expect(address?.deletedAt).toBeInstanceOf(Date);
  });

  it('clears the primary flag so the slot frees up for another address', async () => {
    const database = createFakeDatabase(() => [addressRow({ deleted_at: '2026-08-29' })]);

    await runWithTenantContext(CONTEXT_A, () => deleteAddress(database, 'addr-1'));

    expect(database.findOne('SET deleted_at = now()').text).toContain('is_primary = false');
  });

  it('returns null when the address was already deleted', async () => {
    const database = createFakeDatabase(() => []);

    await expect(
      runWithTenantContext(CONTEXT_A, () => deleteAddress(database, 'addr-1')),
    ).resolves.toBeNull();
  });
});

describe('customer addresses -- validation', () => {
  it.each(['street', 'number', 'district', 'city', 'state'] as const)(
    'rejects a create missing %s',
    async (field) => {
      const database = createFakeDatabase(() => [addressRow()]);
      const input = { ...validInput, [field]: '   ' };

      await expect(
        runWithTenantContext(CONTEXT_A, () => createAddress(database, input)),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(database.queries).toHaveLength(0);
    },
  );

  it('rejects a create with a blank customerId', async () => {
    const database = createFakeDatabase();

    await expect(
      runWithTenantContext(CONTEXT_A, () => createAddress(database, { ...validInput, customerId: '' })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects blanking a required field through update', async () => {
    const database = createFakeDatabase(() => [addressRow()]);

    await expect(
      runWithTenantContext(CONTEXT_A, () => updateAddress(database, 'addr-1', { city: '' })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('trims whitespace from stored values', async () => {
    const database = createFakeDatabase(() => [addressRow()]);

    await runWithTenantContext(CONTEXT_A, () =>
      createAddress(database, { ...validInput, city: '  Sao Paulo  ' }),
    );

    expect(database.findOne('INSERT INTO customer_addresses').values).toContain('Sao Paulo');
  });
});

describe('customer addresses -- audit trail', () => {
  it('records a create event inside the same transaction as the insert', async () => {
    const database = createFakeDatabase(() => [addressRow()]);

    await runWithTenantContext(CONTEXT_A, () => createAddress(database, validInput));

    expect(database.transactionCount).toBe(1);
    expect(database.find('audit_logs')).toHaveLength(1);
    expect(database.findOne('audit_logs').values).toContain('CUSTOMER_ADDRESS_CREATED');
  });

  it('records an update event naming the changed columns', async () => {
    const database = createFakeDatabase(() => [addressRow()]);

    await runWithTenantContext(CONTEXT_A, () =>
      updateAddress(database, 'addr-1', { city: 'Rio', state: 'RJ' }),
    );

    const audit = database.findOne('audit_logs');
    expect(audit.values).toContain('CUSTOMER_ADDRESS_UPDATED');
    expect(JSON.stringify(audit.values)).toContain('city');
    expect(JSON.stringify(audit.values)).toContain('state');
  });

  it('records a delete event', async () => {
    const database = createFakeDatabase(() => [addressRow({ deleted_at: '2026-08-29' })]);

    await runWithTenantContext(CONTEXT_A, () => deleteAddress(database, 'addr-1'));

    expect(database.findOne('audit_logs').values).toContain('CUSTOMER_ADDRESS_DELETED');
  });

  it('records nothing when the target row was not found', async () => {
    const database = createFakeDatabase(() => []);

    await runWithTenantContext(CONTEXT_A, () => deleteAddress(database, 'addr-1'));

    expect(database.find('audit_logs')).toHaveLength(0);
  });
});
