import { describe, expect, it, vi } from 'vitest';
import { runWithTenantContext } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { getSaleRevenue, listRevenueEntries } from '../src/agency-revenue';
import type { DatabaseRuntime, TenantTransactionClient } from '../src/database';

function fixture(restricted: boolean, restrictionError?: Error) {
  const query = vi.fn((sql: string, _values?: readonly unknown[]) => {
    if (sql.includes('FROM permission_restrictions')) {
      if (restrictionError) return Promise.reject(restrictionError);
      return Promise.resolve({ rows: restricted ? [{ id: 'restriction' }] : [], rowCount: restricted ? 1 : 0 });
    }
    if (sql.includes('FROM sales')) return Promise.resolve({ rows: [{}], rowCount: 1 });
    if (sql.includes('FROM agency_revenue_entries')) {
      return Promise.resolve({ rows: [{ id: 'revenue', status: 'RECEIVED', amount: 100, received_amount: 90 }], rowCount: 1 });
    }
    if (sql.includes('FROM commission_entries')) return Promise.resolve({ rows: [{ total: '25' }], rowCount: 1 });
    throw new Error(`Unexpected query: ${sql}`);
  });
  const client = { query } as unknown as TenantTransactionClient;
  const database: DatabaseRuntime = {
    withTenantTransaction: (operation) => operation(client),
    withPlatformTransaction: vi.fn(),
  };
  return { database, query };
}

function readRevenue(database: DatabaseRuntime, role = UserRole.MANAGER) {
  return runWithTenantContext(
    { agencyId: 'agency', userId: 'user', userRole: role, email: 'user@example.test' },
    () => getSaleRevenue(database, 'sale'),
  );
}

function readEntries(database: DatabaseRuntime, role = UserRole.MANAGER) {
  return runWithTenantContext(
    { agencyId: 'agency', userId: 'user', userRole: role, email: 'user@example.test' },
    () => listRevenueEntries(database, { saleId: 'sale', status: 'ENTITLED', supplierId: 'supplier', categoryId: 'category' }),
  );
}

describe('listRevenueEntries', () => {
  it('applies filters inside the current agency scope', async () => {
    const { database, query } = fixture(false);
    const entries = await readEntries(database);
    expect(entries).toHaveLength(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('e.agency_id=$1'), [
      'agency', 'sale', 'ENTITLED', 'supplier', 'category',
    ]);
    expect(query.mock.calls[0]?.[0]).toContain('LIMIT 500');
  });

  it.each([UserRole.AGENT, UserRole.VIEWER])('enforces MANAGER role for %s', async (role) => {
    const { database, query } = fixture(false);
    await expect(readEntries(database, role)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(query).not.toHaveBeenCalled();
  });
});

describe('getSaleRevenue: employee commission restriction', () => {
  it('omits commission and its derived difference for a restricted manager without querying commissions', async () => {
    const { database, query } = fixture(true);
    const result = await readRevenue(database);

    expect(result.analysis).toEqual({ agencyRevenue: 100 });
    expect(result.totals).toMatchObject({ expected: 100, received: 90, difference: 10 });
    expect(result.entries).toHaveLength(1);
    expect(query.mock.calls.some(([sql]) => sql.includes('FROM commission_entries'))).toBe(false);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM permission_restrictions'), [
      'agency', UserRole.MANAGER, 'employees', 'view',
    ]);
  });

  it.each([UserRole.MANAGER, UserRole.ADMIN, UserRole.OWNER])('keeps the comparison for an authorized %s', async (role) => {
    const { database, query } = fixture(role !== UserRole.MANAGER);
    const result = await readRevenue(database, role);

    expect(result.analysis).toEqual({ agencyRevenue: 100, employeeCommission: 25, difference: 75 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM commission_entries'), ['agency', 'sale']);
  });

  it('propagates restriction lookup errors instead of exposing commissions', async () => {
    const error = new Error('Restriction lookup failed');
    const { database, query } = fixture(false, error);

    await expect(readRevenue(database)).rejects.toBe(error);
    expect(query.mock.calls.some(([sql]) => sql.includes('FROM commission_entries'))).toBe(false);
  });

  it.each([UserRole.AGENT, UserRole.VIEWER])('keeps the MANAGER role floor for %s', async (role) => {
    const { database, query } = fixture(false);

    await expect(readRevenue(database, role)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(query).not.toHaveBeenCalled();
  });
});
