import { describe, expect, it } from 'vitest';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { LoyaltyProgramType } from '../../../packages/domain/types';
import {
  createLoyaltyProgram,
  deleteLoyaltyProgram,
  getLoyaltyProgramById,
  listLoyaltyPrograms,
  updateLoyaltyProgram,
} from '../src/customer-loyalty-programs';
import { ValidationError } from '../src/errors';
import {
  AGENCY_A,
  AGENCY_B,
  CONTEXT_A,
  CONTEXT_B,
  CUSTOMER_A,
  createFakeDatabase,
  loyaltyProgramRow,
} from './helpers/fake-database';

const validInput = {
  customerId: CUSTOMER_A,
  programName: 'LATAM Pass',
  memberNumber: '123456789',
};

describe('customer loyalty programs -- tenant scoping', () => {
  it('fails closed when no tenant context is established', async () => {
    const database = createFakeDatabase();

    await expect(listLoyaltyPrograms(database, CUSTOMER_A)).rejects.toThrow();
    await expect(getLoyaltyProgramById(database, 'loy-1')).rejects.toThrow();
    await expect(createLoyaltyProgram(database, validInput)).rejects.toThrow();
    await expect(updateLoyaltyProgram(database, 'loy-1', { tier: 'Gold' })).rejects.toThrow();
    await expect(deleteLoyaltyProgram(database, 'loy-1')).rejects.toThrow();
    expect(database.queries).toHaveLength(0);
  });

  it('binds the caller own agency id on every statement', async () => {
    const database = createFakeDatabase(() => [loyaltyProgramRow()]);

    await runWithTenantContext(CONTEXT_A, async () => {
      await listLoyaltyPrograms(database, CUSTOMER_A);
      await getLoyaltyProgramById(database, 'loy-1');
      await createLoyaltyProgram(database, validInput);
      await updateLoyaltyProgram(database, 'loy-1', { tier: 'Gold' });
      await deleteLoyaltyProgram(database, 'loy-1');
    });

    for (const query of database.find('customer_loyalty_programs')) {
      expect(query.values[0]).toBe(AGENCY_A);
      expect(query.values).not.toContain(AGENCY_B);
    }
  });

  it('cannot read another tenant loyalty programs', async () => {
    const database = createFakeDatabase(() => []);

    const programs = await runWithTenantContext(CONTEXT_B, () =>
      listLoyaltyPrograms(database, CUSTOMER_A),
    );

    expect(programs).toEqual([]);
    expect(database.findOne('customer_loyalty_programs').values[0]).toBe(AGENCY_B);
  });
});

describe('customer loyalty programs -- CRUD', () => {
  it.each(Object.values(LoyaltyProgramType))('creates a %s program', async (programType) => {
    const database = createFakeDatabase(() => [loyaltyProgramRow({ program_type: programType })]);

    const program = await runWithTenantContext(CONTEXT_A, () =>
      createLoyaltyProgram(database, { ...validInput, programType }),
    );

    expect(program.programType).toBe(programType);
  });

  it('defaults programType to OUTRO when omitted', async () => {
    const database = createFakeDatabase(() => [loyaltyProgramRow({ program_type: 'OUTRO' })]);

    await runWithTenantContext(CONTEXT_A, () => createLoyaltyProgram(database, validInput));

    const insert = database.findOne('INSERT INTO customer_loyalty_programs');
    expect(insert.values).toContain('OUTRO');
  });

  it('associates a loyalty program with a dependent rather than the customer', async () => {
    const database = createFakeDatabase(() => [
      loyaltyProgramRow({ dependent_id: 'dep-1' }),
    ]);

    const program = await runWithTenantContext(CONTEXT_A, () =>
      createLoyaltyProgram(database, { ...validInput, dependentId: 'dep-1' }),
    );

    expect(program.dependentId).toBe('dep-1');
  });

  it('lists only non-deleted loyalty programs', async () => {
    const database = createFakeDatabase(() => [loyaltyProgramRow()]);

    await runWithTenantContext(CONTEXT_A, () => listLoyaltyPrograms(database, CUSTOMER_A));

    expect(database.findOne('SELECT').text).toContain('deleted_at IS NULL');
  });

  it('returns null for a program outside this tenant', async () => {
    const database = createFakeDatabase(() => []);

    await expect(
      runWithTenantContext(CONTEXT_A, () => getLoyaltyProgramById(database, 'loy-other')),
    ).resolves.toBeNull();
  });

  it('updates only the changed fields', async () => {
    const database = createFakeDatabase(() => [loyaltyProgramRow({ tier: 'Gold' })]);

    const program = await runWithTenantContext(CONTEXT_A, () =>
      updateLoyaltyProgram(database, 'loy-1', { tier: 'Gold' }),
    );

    expect(program?.tier).toBe('Gold');
    const update = database.findOne('UPDATE customer_loyalty_programs');
    expect(update.text).toContain('tier =');
    expect(update.text).not.toContain('program_name =');
  });
});

describe('customer loyalty programs -- soft delete', () => {
  it('stamps deleted_at rather than removing the row', async () => {
    const database = createFakeDatabase(() => [
      loyaltyProgramRow({ deleted_at: '2026-08-29' }),
    ]);

    const program = await runWithTenantContext(CONTEXT_A, () =>
      deleteLoyaltyProgram(database, 'loy-1'),
    );

    expect(database.find('DELETE FROM')).toHaveLength(0);
    expect(program?.deletedAt).toBeInstanceOf(Date);
  });

  it('returns null when the program was already deleted', async () => {
    const database = createFakeDatabase(() => []);

    await expect(
      runWithTenantContext(CONTEXT_A, () => deleteLoyaltyProgram(database, 'loy-1')),
    ).resolves.toBeNull();
  });
});

describe('customer loyalty programs -- validation', () => {
  it('rejects a blank programName', async () => {
    const database = createFakeDatabase();

    await expect(
      runWithTenantContext(CONTEXT_A, () =>
        createLoyaltyProgram(database, { ...validInput, programName: '   ' }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(database.queries).toHaveLength(0);
  });

  it('rejects a blank memberNumber', async () => {
    const database = createFakeDatabase();

    await expect(
      runWithTenantContext(CONTEXT_A, () =>
        createLoyaltyProgram(database, { ...validInput, memberNumber: '' }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an unknown programType', async () => {
    const database = createFakeDatabase();

    await expect(
      runWithTenantContext(CONTEXT_A, () =>
        createLoyaltyProgram(database, {
          ...validInput,
          programType: 'CRUZEIRO' as LoyaltyProgramType,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects blanking programName through update', async () => {
    const database = createFakeDatabase(() => [loyaltyProgramRow()]);

    await expect(
      runWithTenantContext(CONTEXT_A, () =>
        updateLoyaltyProgram(database, 'loy-1', { programName: '' }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('customer loyalty programs -- audit trail', () => {
  it('records an audit event on create', async () => {
    const database = createFakeDatabase(() => [loyaltyProgramRow()]);

    await runWithTenantContext(CONTEXT_A, () => createLoyaltyProgram(database, validInput));

    expect(database.findOne('audit_logs').values).toContain('CUSTOMER_LOYALTY_PROGRAM_CREATED');
  });

  it('records an audit event on update', async () => {
    const database = createFakeDatabase(() => [loyaltyProgramRow()]);

    await runWithTenantContext(CONTEXT_A, () =>
      updateLoyaltyProgram(database, 'loy-1', { tier: 'Gold' }),
    );

    expect(database.findOne('audit_logs').values).toContain('CUSTOMER_LOYALTY_PROGRAM_UPDATED');
  });

  it('records an audit event on soft delete', async () => {
    const database = createFakeDatabase(() => [loyaltyProgramRow()]);

    await runWithTenantContext(CONTEXT_A, () => deleteLoyaltyProgram(database, 'loy-1'));

    expect(database.findOne('audit_logs').values).toContain('CUSTOMER_LOYALTY_PROGRAM_DELETED');
  });
});
