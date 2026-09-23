import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../services/api/src/app';
import type { DatabaseRuntime } from '../../services/api/src/database';
import { ValidationError } from '../../services/api/src/errors';
import {
  assertMappingAllowed,
  assertMappingInUnion,
  getAllowedImportFields,
} from '../../services/api/src/import/allowlist';
import { dryRunImport } from '../../services/api/src/import/service';
import {
  EMPLOYEE_FIELDS,
  CUSTOMER_FIELDS,
  ImportEntityType,
} from '../../services/api/src/import/types';
import { runWithTenantContext } from '../../packages/domain/tenant-context';
import { UserRole } from '../../packages/domain/types';

const job = {
  id: 'job-1',
  agencyId: 'agency-1',
  createdBy: 'user-1',
  entityType: ImportEntityType.CUSTOMER,
  sourceSystem: null,
  originalFilename: 'x.csv',
  storageKey: 'imports/x.csv',
  status: 'DRY_RUN',
  mapping: {},
  totalRows: 0,
  validRows: 0,
  warningRows: 0,
  errorRows: 0,
  createdRows: 0,
  updatedRows: 0,
  skippedRows: 0,
  errors: [],
  preview: [],
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildTestApp() {
  const withTenantTransaction = vi.fn((operation: (client: unknown) => unknown) => {
    const client = {
      query: () => Promise.resolve({ rows: [job], rowCount: 1 }),
    };
    return Promise.resolve(operation(client));
  });

  const database = {
    withTenantTransaction,
    withPlatformTransaction: () => Promise.resolve([]),
  } as unknown as DatabaseRuntime;

  const app = buildApp({
    authProvider: { authenticate: () => Promise.resolve(null) },
    validateUserAgencyAccess: () => Promise.resolve(false),
    database,
    rateLimit: {
      classLimits: { SYSTEM_INTERNAL: { windowMs: 60_000, max: 50 } },
    },
  });

  return { app, withTenantTransaction };
}

describe('F-03: import column allowlist', () => {
  it('never exposes `role` as an employee import field', () => {
    expect(EMPLOYEE_FIELDS.map((f) => f.field)).not.toContain('role');
    expect(getAllowedImportFields(ImportEntityType.EMPLOYEE)).toEqual(['name', 'email']);
  });

  it('keeps customer/supplier/tag fields aligned with the documented allowlist', () => {
    expect(getAllowedImportFields(ImportEntityType.CUSTOMER)).toEqual([
      'name',
      'email',
      'phone',
      'cpf',
      'birth_date',
      'notes',
    ]);
    expect(getAllowedImportFields(ImportEntityType.SUPPLIER)).toEqual([
      'name',
      'trade_name',
      'email',
      'phone',
      'cnpj',
      'category',
      'notes',
    ]);
    expect(getAllowedImportFields(ImportEntityType.TAG)).toEqual(['name', 'category', 'color']);
    expect(CUSTOMER_FIELDS.map((f) => f.field)).toEqual([
      'name',
      'email',
      'phone',
      'cpf',
      'birth_date',
      'notes',
    ]);
  });

  it('assertMappingInUnion rejects SQL-injection style and privilege targets', () => {
    expect(() => assertMappingInUnion({ col: 'name; DROP TABLE users--' })).toThrow(ValidationError);
    expect(() => assertMappingInUnion({ col: 'role' })).toThrow(ValidationError);
    expect(() => assertMappingInUnion({ col: 'password_hash' })).toThrow(ValidationError);
    expect(() => assertMappingInUnion({ col: 'is_admin' })).toThrow(ValidationError);
    expect(() => assertMappingInUnion({ agency: 'agency_id' })).not.toThrow();
    expect(() => assertMappingInUnion({ nome: 'name', email: 'email' })).not.toThrow();
  });

  it('assertMappingAllowed rejects fields outside the entity allowlist', () => {
    expect(() =>
      assertMappingAllowed(ImportEntityType.EMPLOYEE, { col: 'role' }),
    ).toThrow(ValidationError);
    expect(() =>
      assertMappingAllowed(ImportEntityType.CUSTOMER, { col: 'cnpj' }),
    ).toThrow(ValidationError);
    expect(() =>
      assertMappingAllowed(ImportEntityType.CUSTOMER, { col: 'name' }),
    ).not.toThrow();
  });

  it('dryRunImport rejects a poisoned mapping after loading the job', async () => {
    const withTenantTransaction = vi.fn((operation: (client: unknown) => unknown) => {
      return Promise.resolve(
        operation({
          query: () => Promise.resolve({ rows: [job], rowCount: 1 }),
        }),
      );
    });
    const database = {
      withTenantTransaction,
      withPlatformTransaction: () => Promise.resolve([]),
    } as unknown as DatabaseRuntime;

    const context = {
      agencyId: 'agency-1',
      userId: 'user-1',
      userRole: UserRole.ADMIN,
      email: 'admin@example.test',
    };
    await expect(
      runWithTenantContext(context, () =>
        dryRunImport(database, 'job-1', { col: 'role' }, [{ rowNumber: 2, data: {} }]),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    // Job load must have happened (one transaction), but no row validation
    // or job update may have run for a rejected mapping.
    expect(withTenantTransaction).toHaveBeenCalledTimes(1);
  });

  it('POST /api/import/:jobId/validate returns 400 for a non-allowlisted mapping before any tenant transaction', async () => {
    const { app, withTenantTransaction } = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/import/job-1/validate',
      payload: {
        mapping: { Funcao: 'role' },
        parsedRows: [{ rowNumber: 2, data: { Funcao: 'ADMIN' } }],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(withTenantTransaction).not.toHaveBeenCalled();
    await app.close();
  });

  it('POST /api/import/:jobId/validate returns 400 for SQL-injection style target fields', async () => {
    const { app, withTenantTransaction } = buildTestApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/import/job-1/validate',
      payload: {
        mapping: { col: 'name); DROP TABLE customers; --' },
        parsedRows: [{ rowNumber: 2, data: { col: 'x' } }],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(withTenantTransaction).not.toHaveBeenCalled();
    await app.close();
  });
});
