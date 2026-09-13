import { describe, expect, it } from 'vitest';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import {
  addInsuranceTraveler,
  createInsuranceDocument,
  createInsurancePolicy,
  createInsuranceProduct,
  listInsurancePolicies,
  listInsuranceProducts,
  updateInsurancePolicyStatus,
} from '../src/insurance';
import { ValidationError, ConflictError } from '../src/errors';
import {
  AGENCY_A,
  AGENCY_B,
  CONTEXT_A,
  CONTEXT_B,
  CUSTOMER_A,
  createFakeDatabase,
  type RecordedQuery,
} from './helpers/fake-database';

const SALE_A = '13000000-0000-4000-8000-000000000001';

function productRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'prod-1',
    agency_id: AGENCY_A,
    insurer_name: 'Affinity',
    supplier_id: null,
    broker_name: 'Corretora XPTO',
    plan_name: 'Plano Ouro',
    coverage_description: 'Cobertura internacional',
    cost_amount: '50.00',
    price_amount: '90.00',
    currency: 'BRL',
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

function policyRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pol-1',
    agency_id: AGENCY_A,
    insurance_product_id: 'prod-1',
    customer_id: CUSTOMER_A,
    sale_id: SALE_A,
    sale_item_id: null,
    policy_number: null,
    coverage_start: '2026-02-01',
    coverage_end: '2026-02-10',
    cost_amount: '50.00',
    sale_amount: '90.00',
    commission_amount: '10.00',
    currency: 'BRL',
    status: 'QUOTED',
    emergency_contact_name: null,
    emergency_contact_phone: null,
    receivable_id: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

function receivableRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'rec-1',
    agency_id: AGENCY_A,
    sale_id: SALE_A,
    customer_id: CUSTOMER_A,
    description: 'Insurance policy pol-1',
    amount: '90.00',
    status: 'OPEN',
    due_at: '2026-01-01T00:00:00Z',
    paid_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function policySaleResponder(query: RecordedQuery): Record<string, unknown>[] | undefined {
  const text = query.text.toLowerCase();
  if (text.startsWith('select 1 from')) return [{ exists: 1 }];
  if (text.includes('insert into insurance_policies')) return [policyRow()];
  if (text.includes('insert into receivables')) return [receivableRow()];
  if (text.includes('update insurance_policies')) return [policyRow({ receivable_id: 'rec-1' })];
  return [];
}

describe('insurance -- tenant scoping', () => {
  it('fails closed when no tenant context is established', async () => {
    const database = createFakeDatabase();

    await expect(listInsuranceProducts(database)).rejects.toThrow();
    await expect(listInsurancePolicies(database)).rejects.toThrow();
    await expect(
      createInsuranceProduct(database, {
        insurerName: 'Affinity',
        planName: 'Plano Ouro',
        costAmount: 50,
        priceAmount: 90,
      }),
    ).rejects.toThrow();
    expect(database.queries).toHaveLength(0);
  });

  it('binds the caller own agency id on every insurance_products statement', async () => {
    const database = createFakeDatabase(() => [productRow()]);

    await runWithTenantContext(CONTEXT_A, async () => {
      await listInsuranceProducts(database);
      await createInsuranceProduct(database, {
        insurerName: 'Affinity',
        planName: 'Plano Ouro',
        costAmount: 50,
        priceAmount: 90,
      });
    });

    for (const query of database.find('insurance_products')) {
      expect(query.values[0]).toBe(AGENCY_A);
      expect(query.values).not.toContain(AGENCY_B);
    }
  });

  it('scopes a different tenant to its own agency id', async () => {
    const database = createFakeDatabase(() => []);

    await runWithTenantContext(CONTEXT_B, () => listInsuranceProducts(database));

    expect(database.findOne('insurance_products').values[0]).toBe(AGENCY_B);
  });
});

describe('insurance products -- validation', () => {
  it('rejects a blank insurer name', async () => {
    const database = createFakeDatabase(() => [productRow()]);

    await runWithTenantContext(CONTEXT_A, async () => {
      await expect(
        createInsuranceProduct(database, { insurerName: '  ', planName: 'X', costAmount: 1, priceAmount: 1 }),
      ).rejects.toThrow(ValidationError);
    });
  });

  it('rejects negative cost/price', async () => {
    const database = createFakeDatabase(() => [productRow()]);

    await runWithTenantContext(CONTEXT_A, async () => {
      await expect(
        createInsuranceProduct(database, {
          insurerName: 'Affinity',
          planName: 'X',
          costAmount: -1,
          priceAmount: 1,
        }),
      ).rejects.toThrow(ValidationError);
    });
  });
});

describe('insurance policies -- finance convergence', () => {
  it('creates a receivable via financial.ts createReceivable when a sale is linked', async () => {
    const database = createFakeDatabase(policySaleResponder);

    const policy = await runWithTenantContext(CONTEXT_A, () =>
      createInsurancePolicy(database, {
        insuranceProductId: 'prod-1',
        customerId: CUSTOMER_A,
        saleId: SALE_A,
        coverageStart: '2026-02-01',
        coverageEnd: '2026-02-10',
        costAmount: 50,
        saleAmount: 90,
        commissionAmount: 10,
      }),
    );

    expect(policy.receivableId).toBe('rec-1');

    const receivableInsert = database.findOne('INSERT INTO receivables');
    expect(receivableInsert.values).toContain(SALE_A);
    expect(receivableInsert.values).toContain(CUSTOMER_A);
    expect(receivableInsert.values).toContain(90);

    // Never a parallel AR table: the only receivable-shaped write is against
    // the existing `receivables` table.
    expect(database.find('insurance_receivable')).toHaveLength(0);
    expect(database.find('insurance_ar')).toHaveLength(0);
  });

  it('does not create a receivable when there is no linked sale', async () => {
    const database = createFakeDatabase((query) => {
      const text = query.text.toLowerCase();
      if (text.startsWith('select 1 from')) return [{ exists: 1 }];
      if (text.includes('insert into insurance_policies')) return [policyRow({ sale_id: null })];
      return [];
    });

    const policy = await runWithTenantContext(CONTEXT_A, () =>
      createInsurancePolicy(database, {
        insuranceProductId: 'prod-1',
        customerId: CUSTOMER_A,
        coverageStart: '2026-02-01',
        coverageEnd: '2026-02-10',
        costAmount: 50,
        saleAmount: 90,
      }),
    );

    expect(policy.receivableId).toBeNull();
    expect(database.find('INSERT INTO receivables')).toHaveLength(0);
  });

  it('rejects coverageEnd before coverageStart', async () => {
    const database = createFakeDatabase(policySaleResponder);

    await runWithTenantContext(CONTEXT_A, async () => {
      await expect(
        createInsurancePolicy(database, {
          insuranceProductId: 'prod-1',
          customerId: CUSTOMER_A,
          coverageStart: '2026-02-10',
          coverageEnd: '2026-02-01',
          costAmount: 50,
          saleAmount: 90,
        }),
      ).rejects.toThrow(ValidationError);
    });
  });
});

describe('insurance policies -- status lifecycle', () => {
  it('rejects transitioning a cancelled policy', async () => {
    const database = createFakeDatabase((query) => {
      const text = query.text.toLowerCase();
      if (text.includes('select status from insurance_policies')) return [{ status: 'CANCELLED' }];
      return [];
    });

    await runWithTenantContext(CONTEXT_A, async () => {
      await expect(updateInsurancePolicyStatus(database, 'pol-1', 'ACTIVE')).rejects.toThrow(
        ConflictError,
      );
    });
  });

  it('rejects an invalid status value', async () => {
    const database = createFakeDatabase(() => []);

    await runWithTenantContext(CONTEXT_A, async () => {
      // @ts-expect-error -- deliberately invalid
      await expect(updateInsurancePolicyStatus(database, 'pol-1', 'BOGUS')).rejects.toThrow(
        ValidationError,
      );
    });
  });
});

describe('insurance travelers', () => {
  it('rejects providing both customerId and dependentId', async () => {
    const database = createFakeDatabase(() => [{ exists: 1 }]);

    await runWithTenantContext(CONTEXT_A, async () => {
      await expect(
        addInsuranceTraveler(database, {
          insurancePolicyId: 'pol-1',
          customerId: CUSTOMER_A,
          dependentId: 'dep-1',
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  it('rejects providing neither customerId nor dependentId', async () => {
    const database = createFakeDatabase(() => [{ exists: 1 }]);

    await runWithTenantContext(CONTEXT_A, async () => {
      await expect(addInsuranceTraveler(database, { insurancePolicyId: 'pol-1' })).rejects.toThrow(
        ValidationError,
      );
    });
  });
});

describe('insurance documents -- metadata only', () => {
  it('rejects a blank file name', async () => {
    const database = createFakeDatabase(() => [{ exists: 1 }]);

    await runWithTenantContext(CONTEXT_A, async () => {
      await expect(
        createInsuranceDocument(database, { insurancePolicyId: 'pol-1', fileName: '  ' }),
      ).rejects.toThrow(ValidationError);
    });
  });
});
