import { describe, expect, it } from 'vitest';
import {
  expectedCommissionPayDate,
  resolveBalanceDeadlineDate,
  resolveSupplierCommissionScope,
  supplierPaymentReleaseCap,
  type SupplierCommissionScope,
} from '../src/commission-supplier-policy';

const scopes: SupplierCommissionScope[] = [
  { id: 'default', employeeId: null, supplierId: null, categoryId: null },
  { id: 'category', employeeId: null, supplierId: null, categoryId: 'air' },
  { id: 'supplier', employeeId: null, supplierId: 's1', categoryId: null },
  { id: 'employee', employeeId: 'e1', supplierId: null, categoryId: null },
  { id: 'employee-category', employeeId: 'e1', supplierId: null, categoryId: 'air' },
  { id: 'employee-supplier', employeeId: 'e1', supplierId: 's1', categoryId: null },
];

describe('supplier-scoped commission policies', () => {
  it('resolves employee+supplier before employee+category, employee, supplier, category and agency default', () => {
    expect(resolveSupplierCommissionScope(scopes, { employeeId: 'e1', supplierId: 's1', categoryId: 'air' })?.id).toBe('employee-supplier');
    expect(resolveSupplierCommissionScope(scopes.filter(x => x.id !== 'employee-supplier'), { employeeId: 'e1', supplierId: 's1', categoryId: 'air' })?.id).toBe('employee-category');
    expect(resolveSupplierCommissionScope(scopes.filter(x => !['employee-supplier','employee-category'].includes(x.id)), { employeeId: 'e1', supplierId: 's1', categoryId: 'air' })?.id).toBe('employee');
    expect(resolveSupplierCommissionScope(scopes.filter(x => !['employee-supplier','employee-category','employee'].includes(x.id)), { employeeId: 'e1', supplierId: 's1', categoryId: 'air' })?.id).toBe('supplier');
    expect(resolveSupplierCommissionScope(scopes.filter(x => !['employee-supplier','employee-category','employee','supplier'].includes(x.id)), { employeeId: 'e1', supplierId: 's1', categoryId: 'air' })?.id).toBe('category');
  });

  it('caps supplier-gated release to received agency revenue proportionally', () => {
    expect(supplierPaymentReleaseCap(120, 200, 400)).toBe(60);
    expect(supplierPaymentReleaseCap(120, 400, 400)).toBe(120);
    expect(supplierPaymentReleaseCap(120, 500, 400)).toBe(120);
    expect(supplierPaymentReleaseCap(120, 0, 400)).toBe(0);
  });

  it('computes next fixed pay day and window date from release date', () => {
    expect(expectedCommissionPayDate('2026-10-09', { mode: 'FIXED_DAY', day: 10, paymentDays: 0 })).toBe('2026-10-10');
    expect(expectedCommissionPayDate('2026-10-10', { mode: 'FIXED_DAY', day: 10, paymentDays: 0 })).toBe('2026-10-10');
    expect(expectedCommissionPayDate('2026-10-11', { mode: 'FIXED_DAY', day: 10, paymentDays: 0 })).toBe('2026-11-10');
    expect(expectedCommissionPayDate('2026-10-26', { mode: 'WINDOW', day: 25, paymentDays: 7 })).toBe('2026-12-02');
    expect(expectedCommissionPayDate('2026-02-27', { mode: 'FIXED_DAY', day: 31, paymentDays: 0 })).toBe('2026-02-28');
    expect(expectedCommissionPayDate('2026-10-26', { mode: 'PER_ENTRY', day: null, paymentDays: 0 })).toBe('2026-10-26');
  });

  it('sets supplier balance deadline from travel start using calendar days', () => {
    expect(resolveBalanceDeadlineDate('2027-01-15', 15)).toBe('2026-12-31');
    expect(resolveBalanceDeadlineDate('2026-03-01', 1)).toBe('2026-02-28');
    expect(resolveBalanceDeadlineDate('2026-03-01', 0)).toBe('2026-03-01');
    expect(() => resolveBalanceDeadlineDate('2026-02-30', 3)).toThrow(/civil date/);
  });
});
