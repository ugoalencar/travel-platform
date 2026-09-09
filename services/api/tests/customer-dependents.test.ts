import { describe, expect, it } from 'vitest';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { RelationshipType } from '../../../packages/domain/types';
import {
  createDependent,
  deleteDependent,
  getDependentById,
  listDependents,
  updateDependent,
} from '../src/customer-dependents';
import { ValidationError } from '../src/errors';
import {
  AGENCY_A,
  AGENCY_B,
  CONTEXT_A,
  CONTEXT_B,
  CUSTOMER_A,
  createFakeDatabase,
  dependentRow,
} from './helpers/fake-database';

const validInput = {
  customerId: CUSTOMER_A,
  name: 'Maria Silva',
  relationshipType: RelationshipType.SPOUSE,
};

describe('customer dependents -- tenant scoping', () => {
  it('fails closed when no tenant context is established', async () => {
    const database = createFakeDatabase();

    await expect(listDependents(database, CUSTOMER_A)).rejects.toThrow();
    await expect(getDependentById(database, 'dep-1')).rejects.toThrow();
    await expect(createDependent(database, validInput)).rejects.toThrow();
    await expect(updateDependent(database, 'dep-1', { name: 'X' })).rejects.toThrow();
    await expect(deleteDependent(database, 'dep-1')).rejects.toThrow();
    expect(database.queries).toHaveLength(0);
  });

  it('binds the caller own agency id on every statement', async () => {
    const database = createFakeDatabase(() => [dependentRow()]);

    await runWithTenantContext(CONTEXT_A, async () => {
      await listDependents(database, CUSTOMER_A);
      await getDependentById(database, 'dep-1');
      await createDependent(database, validInput);
      await updateDependent(database, 'dep-1', { name: 'Nova' });
      await deleteDependent(database, 'dep-1');
    });

    for (const query of database.find('customer_dependents')) {
      expect(query.values[0]).toBe(AGENCY_A);
      expect(query.values).not.toContain(AGENCY_B);
    }
  });

  it('scopes a different tenant to its own agency id', async () => {
    const database = createFakeDatabase(() => []);

    await runWithTenantContext(CONTEXT_B, () => listDependents(database, CUSTOMER_A));

    expect(database.findOne('customer_dependents').values[0]).toBe(AGENCY_B);
  });
});

describe('customer dependents -- CRUD across relationship types', () => {
  it.each(Object.values(RelationshipType))('creates a %s dependent', async (relationshipType) => {
    const database = createFakeDatabase(() => [dependentRow({ relationship_type: relationshipType })]);

    const dependent = await runWithTenantContext(CONTEXT_A, () =>
      createDependent(database, { ...validInput, relationshipType }),
    );

    expect(dependent.relationshipType).toBe(relationshipType);
    expect(database.findOne('INSERT INTO customer_dependents').values).toContain(relationshipType);
  });

  it('lists only non-deleted dependents', async () => {
    const database = createFakeDatabase(() => [dependentRow()]);

    await runWithTenantContext(CONTEXT_A, () => listDependents(database, CUSTOMER_A));

    expect(database.findOne('SELECT').text).toContain('deleted_at IS NULL');
  });

  it('maps optional columns onto the domain object only when present', async () => {
    const database = createFakeDatabase(() => [
      dependentRow({ birth_date: '2010-05-04', cpf: '12345678909', nationality: 'Brazilian' }),
    ]);

    const dependent = await runWithTenantContext(CONTEXT_A, () =>
      getDependentById(database, 'dep-1'),
    );

    expect(dependent?.birthDate).toBeInstanceOf(Date);
    expect(dependent?.cpf).toBe('12345678909');
    expect(dependent?.nationality).toBe('Brazilian');
    expect(dependent).not.toHaveProperty('notes');
    expect(dependent).not.toHaveProperty('deletedAt');
  });

  it('returns null for a dependent outside this tenant', async () => {
    const database = createFakeDatabase(() => []);

    await expect(
      runWithTenantContext(CONTEXT_A, () => getDependentById(database, 'dep-other')),
    ).resolves.toBeNull();
  });

  it('updates only the supplied columns', async () => {
    const database = createFakeDatabase(() => [dependentRow({ notes: 'Vegetarian' })]);

    await runWithTenantContext(CONTEXT_A, () =>
      updateDependent(database, 'dep-1', { notes: 'Vegetarian' }),
    );

    const update = database.findOne('UPDATE customer_dependents');
    expect(update.text).toContain('notes = $2');
    expect(update.text).not.toContain('name = ');
  });

  it('allows clearing an optional column with an explicit null', async () => {
    const database = createFakeDatabase(() => [dependentRow()]);

    await runWithTenantContext(CONTEXT_A, () =>
      updateDependent(database, 'dep-1', { cpf: null }),
    );

    expect(database.findOne('UPDATE customer_dependents').values).toContain(null);
  });

  it('short-circuits to a read when the update carries no fields', async () => {
    const database = createFakeDatabase(() => [dependentRow()]);

    await runWithTenantContext(CONTEXT_A, () => updateDependent(database, 'dep-1', {}));

    expect(database.find('UPDATE customer_dependents')).toHaveLength(0);
  });
});

describe('customer dependents -- soft delete', () => {
  it('stamps deleted_at rather than removing the row', async () => {
    const database = createFakeDatabase(() => [dependentRow({ deleted_at: '2026-08-29' })]);

    const dependent = await runWithTenantContext(CONTEXT_A, () =>
      deleteDependent(database, 'dep-1'),
    );

    expect(database.find('DELETE FROM')).toHaveLength(0);
    expect(database.findOne('SET deleted_at = now()').text).toContain('deleted_at IS NULL');
    expect(dependent?.deletedAt).toBeInstanceOf(Date);
  });

  it('is idempotent -- a second delete finds nothing to soft delete', async () => {
    const database = createFakeDatabase(() => []);

    await expect(
      runWithTenantContext(CONTEXT_A, () => deleteDependent(database, 'dep-1')),
    ).resolves.toBeNull();
  });
});

describe('customer dependents -- validation', () => {
  it('rejects a blank name on create', async () => {
    const database = createFakeDatabase();

    await expect(
      runWithTenantContext(CONTEXT_A, () => createDependent(database, { ...validInput, name: '   ' })),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(database.queries).toHaveLength(0);
  });

  it('rejects a blank name on update', async () => {
    const database = createFakeDatabase(() => [dependentRow()]);

    await expect(
      runWithTenantContext(CONTEXT_A, () => updateDependent(database, 'dep-1', { name: '' })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an unknown relationship type', async () => {
    const database = createFakeDatabase();

    await expect(
      runWithTenantContext(CONTEXT_A, () =>
        createDependent(database, {
          ...validInput,
          relationshipType: 'FRIEND' as RelationshipType,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('trims the stored name', async () => {
    const database = createFakeDatabase(() => [dependentRow()]);

    await runWithTenantContext(CONTEXT_A, () =>
      createDependent(database, { ...validInput, name: '  Maria Silva  ' }),
    );

    expect(database.findOne('INSERT INTO customer_dependents').values).toContain('Maria Silva');
  });
});

describe('customer dependents -- audit trail', () => {
  it('records a create event without leaking the dependent name or CPF', async () => {
    const database = createFakeDatabase(() => [dependentRow()]);

    await runWithTenantContext(CONTEXT_A, () =>
      createDependent(database, { ...validInput, cpf: '12345678909' }),
    );

    const audit = database.findOne('audit_logs');
    const serialized = JSON.stringify(audit.values);
    expect(audit.values).toContain('CUSTOMER_DEPENDENT_CREATED');
    expect(serialized).not.toContain('12345678909');
    expect(serialized).not.toContain('Maria Silva');
  });

  it('records update and delete events', async () => {
    const updateDb = createFakeDatabase(() => [dependentRow()]);
    await runWithTenantContext(CONTEXT_A, () =>
      updateDependent(updateDb, 'dep-1', { notes: 'x' }),
    );
    expect(updateDb.findOne('audit_logs').values).toContain('CUSTOMER_DEPENDENT_UPDATED');

    const deleteDb = createFakeDatabase(() => [dependentRow({ deleted_at: '2026-08-29' })]);
    await runWithTenantContext(CONTEXT_A, () => deleteDependent(deleteDb, 'dep-1'));
    expect(deleteDb.findOne('audit_logs').values).toContain('CUSTOMER_DEPENDENT_DELETED');
  });

  it('writes the audit row in the same transaction as the mutation', async () => {
    const database = createFakeDatabase(() => [dependentRow()]);

    await runWithTenantContext(CONTEXT_A, () => createDependent(database, validInput));

    expect(database.transactionCount).toBe(1);
  });
});
