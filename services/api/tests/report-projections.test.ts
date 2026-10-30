import { describe, expect, it } from 'vitest';
import {
  projectCommissions,
  projectReceivables,
  projectRevenue,
  supplierBalances,
  type CommissionRow,
  type ReceivableRow,
  type RevenueRow,
} from '../src/report-projections';

const receivable = (over: Partial<ReceivableRow>): ReceivableRow => ({
  id: 'r',
  saleId: 's',
  dueDate: '2026-11-10',
  amount: 100,
  paid: 0,
  status: 'OPEN',
  ...over,
});

describe('projectReceivables (customer receivables by due date)', () => {
  it('open balance is amount minus allocations, bucketed by due date, late separated', () => {
    const result = projectReceivables(
      [
        receivable({ id: 'a', dueDate: '2026-10-20', amount: 500, paid: 200, status: 'PARTIALLY_PAID' }),
        receivable({ id: 'b', dueDate: '2026-11-10', amount: 300 }),
        receivable({ id: 'c', dueDate: '2026-11-25', amount: 200, paid: 50, status: 'PARTIALLY_PAID' }),
        receivable({ id: 'd', dueDate: '2026-12-05', amount: 100 }),
      ],
      '2026-10-24',
    );
    expect(result.late).toEqual({ count: 1, openBalance: 300 });
    expect(result.byMonth).toEqual([
      { month: '2026-11', openBalance: 450, count: 2 },
      { month: '2026-12', openBalance: 100, count: 1 },
    ]);
    expect(result.totalOpen).toBe(850);
  });

  it('a due date equal to today is not late; settled and cancelled rows are ignored', () => {
    const result = projectReceivables(
      [
        receivable({ id: 'a', dueDate: '2026-10-24', amount: 100 }),
        receivable({ id: 'b', dueDate: '2026-10-01', amount: 100, paid: 100, status: 'PAID' }),
        receivable({ id: 'c', dueDate: '2026-10-01', amount: 100, status: 'CANCELLED' }),
      ],
      '2026-10-24',
    );
    expect(result.late).toEqual({ count: 0, openBalance: 0 });
    expect(result.byMonth).toEqual([{ month: '2026-10', openBalance: 100, count: 1 }]);
    expect(result.totalOpen).toBe(100);
  });

  it('works in cents (no floating point drift)', () => {
    const result = projectReceivables(
      [receivable({ amount: 0.3, paid: 0.1 }), receivable({ id: 'x', amount: 0.2 })],
      '2026-10-24',
    );
    expect(result.totalOpen).toBe(0.4);
  });
});

const revenue = (over: Partial<RevenueRow>): RevenueRow => ({
  entryId: 'e',
  supplierId: 's1',
  status: 'FORECAST',
  amount: 100,
  receivedAmount: null,
  entitledOn: null,
  expectedOn: null,
  ...over,
});

describe('projectRevenue (contracted / projected / undefined; never PENDING_RULE)', () => {
  it('classifies ENTITLED/AVAILABLE as CONTRATADO, FORECAST with a date as PROJETADO, FORECAST without as INDEFINIDO', () => {
    const result = projectRevenue([
      revenue({ entryId: '1', status: 'ENTITLED', amount: 70, entitledOn: '2026-10-20' }),
      revenue({ entryId: '2', status: 'ENTITLED', amount: 45, entitledOn: '2026-10-22' }),
      revenue({ entryId: '3', status: 'AVAILABLE', amount: 120, entitledOn: '2026-10-25' }),
      revenue({ entryId: '4', status: 'FORECAST', amount: 80, expectedOn: '2026-12-02' }),
      revenue({ entryId: '5', status: 'FORECAST', amount: 60 }),
    ]);
    expect(result.contracted.total).toBe(235);
    expect(result.projected.total).toBe(80);
    expect(result.undefined.total).toBe(60);
    expect(result.contracted.byMonth).toEqual([{ month: '2026-10', amount: 235 }]);
    expect(result.projected.byMonth).toEqual([{ month: '2026-12', amount: 80 }]);
    expect(result.grandTotal).toBe(375);
  });

  it('never counts PENDING_RULE, CANCELLED or RECEIVED entries', () => {
    const result = projectRevenue([
      revenue({ entryId: '1', status: 'PENDING_RULE', amount: 0 }),
      revenue({ entryId: '2', status: 'CANCELLED', amount: 50 }),
      revenue({ entryId: '3', status: 'RECEIVED', amount: 90, receivedAmount: 90 }),
      revenue({ entryId: '4', status: 'ENTITLED', amount: 10, entitledOn: '2026-10-20' }),
    ]);
    expect(result.grandTotal).toBe(10);
  });

  it('groups by supplier too', () => {
    const result = projectRevenue([
      revenue({ entryId: '1', supplierId: 'A', status: 'ENTITLED', amount: 100, entitledOn: '2026-10-20' }),
      revenue({ entryId: '2', supplierId: 'B', status: 'ENTITLED', amount: 50, entitledOn: '2026-10-21' }),
      revenue({ entryId: '3', supplierId: 'A', status: 'FORECAST', amount: 25 }),
    ]);
    expect(result.bySupplier).toEqual([
      { supplierId: 'A', contracted: 100, projected: 0, undefined: 25 },
      { supplierId: 'B', contracted: 50, projected: 0, undefined: 0 },
    ]);
  });
});

describe('supplierBalances (expected x received x difference, per supplier)', () => {
  it('shows the open difference and keeps unreceived entitled money visible', () => {
    const result = supplierBalances([
      revenue({ entryId: '1', supplierId: 'A', status: 'RECEIVED', amount: 100, receivedAmount: 90 }),
      revenue({ entryId: '2', supplierId: 'A', status: 'ENTITLED', amount: 40, entitledOn: '2026-10-20' }),
      revenue({ entryId: '3', supplierId: 'B', status: 'RECEIVED', amount: 30, receivedAmount: 30 }),
      revenue({ entryId: '4', supplierId: 'A', status: 'PENDING_RULE', amount: 0 }),
      revenue({ entryId: '5', supplierId: 'A', status: 'CANCELLED', amount: 500 }),
    ]);
    expect(result).toEqual([
      { supplierId: 'A', volumeSold: 0, expected: 140, received: 90, difference: 50, employeeCommissionsPaid: 0, result: 90 },
      { supplierId: 'B', volumeSold: 0, expected: 30, received: 30, difference: 0, employeeCommissionsPaid: 0, result: 30 },
    ]);
  });

  it('adds sold volume and employee commissions paid without mixing the revenue amounts', () => {
    const result = supplierBalances([
      revenue({ supplierId: 'MSC', status: 'RECEIVED', amount: 400, receivedAmount: 400 }),
    ], [{ supplierId: 'MSC', volumeSold: 12_000, employeeCommissionsPaid: 120 }]);
    expect(result).toEqual([{
      supplierId: 'MSC', volumeSold: 12_000, expected: 400, received: 400, difference: 0,
      employeeCommissionsPaid: 120, result: 280,
    }]);
  });

  it('keeps R$10,000 sold volume separate from R$1,000 agency revenue and R$100 employee cost', () => {
    const result = supplierBalances([
      revenue({ supplierId: 'A', status: 'RECEIVED', amount: 1_000, receivedAmount: 1_000 }),
    ], [{ supplierId: 'A', volumeSold: 10_000, employeeCommissionsPaid: 100 }]);
    expect(result).toEqual([{
      supplierId: 'A', volumeSold: 10_000, expected: 1_000, received: 1_000, difference: 0,
      employeeCommissionsPaid: 100, result: 900,
    }]);
  });
});

const commission = (over: Partial<CommissionRow>): CommissionRow => ({
  entryId: 'c',
  amount: 100,
  released: 0,
  paid: 0,
  status: 'APPROVED',
  expectedPayDate: null,
  ...over,
});

describe('projectCommissions (forecast x released x paid; independent of the agency revenue)', () => {
  it('separates what is forecast, what is released by customer receipts and what was paid', () => {
    const result = projectCommissions([
      commission({ entryId: '1', amount: 1000, released: 300, paid: 100 }),
      commission({ entryId: '2', amount: 200, released: 200, paid: 200, status: 'PAID' }),
      commission({ entryId: '3', amount: 500, released: 0 }),
      commission({ entryId: '4', amount: 999, released: 999, status: 'CANCELLED' }),
    ]);
    expect(result).toEqual({
      forecast: 1700,
      released: 500,
      paid: 300,
      releasedNotPaid: 200,
      notYetReleased: 1200,
      releasedNotPaidByExpectedPayMonth: [],
    });
  });

  it('groups released unpaid commission by its expected payment month', () => {
    const result = projectCommissions([
      commission({ entryId: '1', amount: 100, released: 100, paid: 40, expectedPayDate: '2026-11-10' }),
      commission({ entryId: '2', amount: 80, released: 80, paid: 0, expectedPayDate: '2026-11-10' }),
      commission({ entryId: '3', amount: 75, released: 75, paid: 0, expectedPayDate: '2026-12-10' }),
      commission({ entryId: '4', amount: 50, released: 50, paid: 0, expectedPayDate: null }),
    ]);
    expect(result.releasedNotPaidByExpectedPayMonth).toEqual([
      { month: '2026-11', amount: 140 },
      { month: '2026-12', amount: 75 },
    ]);
  });

  it('never lets released exceed the amount or paid exceed released', () => {
    const result = projectCommissions([commission({ amount: 100, released: 150, paid: 130 })]);
    expect(result.released).toBe(100);
    expect(result.paid).toBe(100);
    expect(result.releasedNotPaid).toBe(0);
  });
});
