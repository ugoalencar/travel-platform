import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAgencyId, runWithTenantContext, UnauthorizedError,
} from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import type { DatabaseRuntime } from '../src/database';
import { registerErrorHandler } from '../src/errors';
import { registerReportsRoutes } from '../src/routes/reports';
import * as reports from '../src/reports';

vi.mock('../src/reports', () => ({
  getSalesReport: vi.fn(), getCashFlowByPeriod: vi.fn(),
  getEmployeeExpenses: vi.fn(), getExpectedVsActual: vi.fn(),
  getOperationalExpensesBreakdown: vi.fn(), getPayablesAging: vi.fn(),
  getPersonnelReport: vi.fn(), getProfitabilityReport: vi.fn(),
  getReceivablesAging: vi.fn(), getSupplierExposure: vi.fn(),
}));

const apps: FastifyInstance[] = [];

const remainingReports = [
  {
    path: '/reports/financial/receivables-aging',
    load: vi.mocked(reports.getReceivablesAging),
    rows: [{ bucket: '1-30', count: 3, total: 125.5 }],
    arrange: () => vi.mocked(reports.getReceivablesAging).mockResolvedValue([
      { bucket: '1-30', count: 3, total: 125.5 },
    ]),
    headers: 'bucket,count,total', line: '1-30,3,125.5',
    filename: 'receivables-aging.csv', query: '', args: [],
  },
  {
    path: '/reports/financial/payables-aging',
    load: vi.mocked(reports.getPayablesAging),
    rows: [{ bucket: '60+', count: 4, total: 250.75 }],
    arrange: () => vi.mocked(reports.getPayablesAging).mockResolvedValue([
      { bucket: '60+', count: 4, total: 250.75 },
    ]),
    headers: 'bucket,count,total', line: '60+,4,250.75',
    filename: 'payables-aging.csv', query: '', args: [],
  },
  {
    path: '/reports/financial/supplier-exposure',
    load: vi.mocked(reports.getSupplierExposure),
    rows: [{ supplierId: 'supplier-1', supplierName: '=1+1', openTotal: 10, paidTotal: 20, count: 3 }],
    arrange: () => vi.mocked(reports.getSupplierExposure).mockResolvedValue([
      { supplierId: 'supplier-1', supplierName: '=1+1', openTotal: 10, paidTotal: 20, count: 3 },
    ]),
    headers: 'supplierId,supplierName,openTotal,paidTotal,count', line: "supplier-1,'=1+1,10,20,3",
    filename: 'supplier-exposure.csv', query: '', args: [],
  },
  {
    path: '/reports/financial/employee-expenses',
    load: vi.mocked(reports.getEmployeeExpenses),
    rows: [{ employeeId: 'employee-1', employeeName: '+SUM(A1)', payrollTotal: 100, commissionTotal: 25, total: 125 }],
    arrange: () => vi.mocked(reports.getEmployeeExpenses).mockResolvedValue([
      { employeeId: 'employee-1', employeeName: '+SUM(A1)', payrollTotal: 100, commissionTotal: 25, total: 125 },
    ]),
    headers: 'employeeId,employeeName,payrollTotal,commissionTotal,total', line: "employee-1,'+SUM(A1),100,25,125",
    filename: 'employee-expenses.csv', query: '', args: [],
  },
  {
    path: '/reports/financial/operational-expenses',
    load: vi.mocked(reports.getOperationalExpensesBreakdown),
    rows: [{ categoryId: null, categoryName: 'Travel, "local"', total: -25.5, count: 2 }],
    arrange: () => vi.mocked(reports.getOperationalExpensesBreakdown).mockResolvedValue([
      { categoryId: null, categoryName: 'Travel, "local"', total: -25.5, count: 2 },
    ]),
    headers: 'categoryId,categoryName,total,count', line: ',"Travel, ""local""",-25.5,2',
    filename: 'operational-expenses.csv', query: '', args: [],
  },
  {
    path: '/reports/financial/expected-vs-actual',
    load: vi.mocked(reports.getExpectedVsActual),
    rows: [{ label: '@SUM(A1)', expected: 450, actual: 120 }],
    arrange: () => vi.mocked(reports.getExpectedVsActual).mockResolvedValue([
      { label: '@SUM(A1)', expected: 450, actual: 120 },
    ]),
    headers: 'label,expected,actual', line: "'@SUM(A1),450,120",
    filename: 'expected-vs-actual.csv', query: '&from=2026-10-01&to=2026-10-23',
    args: [new Date('2026-10-01'), new Date('2026-10-23')],
  },
  {
    path: '/reports/profitability',
    load: vi.mocked(reports.getProfitabilityReport),
    rows: [{ key: 'sale-1', label: '-formula', revenue: 80, cost: 100, margin: -20 }],
    arrange: () => vi.mocked(reports.getProfitabilityReport).mockResolvedValue([
      { key: 'sale-1', label: '-formula', revenue: 80, cost: 100, margin: -20 },
    ]),
    headers: 'key,label,revenue,cost,margin', line: "sale-1,'-formula,80,100,-20",
    filename: 'profitability.csv', query: '&groupBy=destination', args: ['destination'],
  },
  {
    path: '/reports/personnel',
    load: vi.mocked(reports.getPersonnelReport),
    rows: [{ key: '2026-10', label: '2026-10', salaryExpense: 750, commissionTotal: 50, total: 800 }],
    arrange: () => vi.mocked(reports.getPersonnelReport).mockResolvedValue([
      { key: '2026-10', label: '2026-10', salaryExpense: 750, commissionTotal: 50, total: 800 },
    ]),
    headers: 'key,label,salaryExpense,commissionTotal,total', line: '2026-10,2026-10,750,50,800',
    filename: 'personnel.csv', query: '&groupBy=month', args: ['month'],
  },
];

async function fixture(role: UserRole | null = UserRole.MANAGER, agencyId = 'test-agency-a') {
  const app = Fastify();
  apps.push(app);
  registerErrorHandler(app);
  app.addHook('onRequest', (_request, _reply, done) => {
    if (role === null) { done(new UnauthorizedError()); return; }
    runWithTenantContext({ agencyId, userId: 'test-user', userRole: role, email: '' }, done);
  });
  registerReportsRoutes(app, { database: {} as DatabaseRuntime, protectedHooks: [] });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const report of remainingReports) report.arrange();
  vi.mocked(reports.getSalesReport).mockImplementation(() => Promise.resolve([
    { key: getAgencyId(), label: '=1+1', count: 2, total: 1500.5 },
  ]));
  vi.mocked(reports.getCashFlowByPeriod).mockResolvedValue([
    { period: '2026-10', inflow: 50, outflow: 200, net: -150 },
  ]);
});

describe.each(remainingReports)('$path CSV opt-in (mocked HTTP, no database)', (report) => {
  it('maps existing row properties in order and sends safe download headers', async () => {
    const app = await fixture();
    const response = await app.inject(`${report.path}?format=csv${report.query}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toBe(`attachment; filename="${report.filename}"`);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.body).toBe(`\uFEFF${report.headers}\r\n${report.line}\r\n`);
    expect(report.load).toHaveBeenCalledExactlyOnceWith(expect.anything(), ...report.args);
  });

  it('preserves default and explicit JSON, row values and query arguments', async () => {
    const app = await fixture();
    for (const format of ['', '&format=json']) {
      const response = await app.inject(`${report.path}?${report.query}${format}`);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-disposition']).toBeUndefined();
      expect(response.json()).toEqual({ rows: report.rows });
    }
    await app.inject(`${report.path}?format=csv${report.query}`);
    expect(report.load.mock.calls[0]).toEqual(report.load.mock.calls[1]);
    expect(report.load.mock.calls[0]).toEqual(report.load.mock.calls[2]);
  });

  it('exports an empty result as headers only', async () => {
    report.load.mockResolvedValue([]);
    const app = await fixture();
    const response = await app.inject(`${report.path}?format=csv`);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(`\uFEFF${report.headers}\r\n`);
  });

  it.each([UserRole.AGENT, UserRole.VIEWER])('denies %s before querying for either format', async (role) => {
    const app = await fixture(role);
    for (const format of ['csv', 'json', 'xml']) {
      expect((await app.inject(`${report.path}?format=${format}`)).statusCode).toBe(403);
    }
    expect(report.load).not.toHaveBeenCalled();
  });

  it.each([UserRole.ADMIN, UserRole.OWNER])('preserves access for %s', async (role) => {
    const app = await fixture(role);
    expect((await app.inject(`${report.path}?format=csv`)).statusCode).toBe(200);
    expect(report.load).toHaveBeenCalledOnce();
  });

  it('denies unauthenticated requests before querying', async () => {
    const app = await fixture(null);
    expect((await app.inject(`${report.path}?format=csv`)).statusCode).toBe(401);
    expect(report.load).not.toHaveBeenCalled();
  });

  it('rejects unsupported formats before querying', async () => {
    const app = await fixture();
    for (const query of ['format=xml', 'format=csv&format=json']) {
      expect((await app.inject(`${report.path}?${query}`)).statusCode).toBe(400);
    }
    expect(report.load).not.toHaveBeenCalled();
  });

  it('keeps authenticated tenant context and ignores query agency overrides', async () => {
    const observedAgencies: string[] = [];
    report.load.mockImplementation(() => {
      observedAgencies.push(getAgencyId());
      return Promise.resolve([]);
    });
    const app = await fixture(UserRole.MANAGER, 'test-agency-b');
    for (const format of ['csv', 'json']) {
      expect((await app.inject(`${report.path}?format=${format}&agencyId=test-agency-a`)).statusCode).toBe(200);
    }
    expect(observedAgencies).toEqual(['test-agency-b', 'test-agency-b']);
  });
});

it.each([
  { path: '/reports/financial/expected-vs-actual', load: vi.mocked(reports.getExpectedVsActual), args: [new Date('2000-01-01'), new Date('2100-01-01')] },
  { path: '/reports/profitability', load: vi.mocked(reports.getProfitabilityReport), args: ['sale'] },
  { path: '/reports/personnel', load: vi.mocked(reports.getPersonnelReport), args: ['employee'] },
])('preserves default filters for $path', async ({ path, load, args }) => {
  const app = await fixture();
  expect((await app.inject(`${path}?format=csv`)).statusCode).toBe(200);
  expect(load).toHaveBeenCalledExactlyOnceWith(expect.anything(), ...args);
});
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

describe('Full report CSV transport (mocked report data, no database)', () => {
  it('exports sales with authentication, formula protection and private headers', async () => {
    const app = await fixture();
    const response = await app.inject('/reports/sales?format=csv&groupBy=customer&from=2026-10-01&to=2026-10-23');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-disposition']).toBe('attachment; filename="vendas-customer.csv"');
    expect(response.body).toBe('\uFEFFkey,label,count,total\r\ntest-agency-a,\'=1+1,2,1500.5\r\n');
    expect(reports.getSalesReport).toHaveBeenCalledWith(
      expect.anything(), 'customer', new Date('2026-10-01'), new Date('2026-10-23'),
    );
  });

  it('keeps the existing JSON contract and the same filter arguments', async () => {
    const app = await fixture();
    const json = await app.inject('/reports/sales?groupBy=customer');
    const csv = await app.inject('/reports/sales?groupBy=customer&format=csv');
    expect(json.json()).toEqual({ rows: [{ key: 'test-agency-a', label: '=1+1', count: 2, total: 1500.5 }] });
    expect(csv.body).toContain('test-agency-a,\'=1+1,2,1500.5');
    expect(vi.mocked(reports.getSalesReport).mock.calls[0]).toEqual(vi.mocked(reports.getSalesReport).mock.calls[1]);
  });

  it('exports cash flow without turning a negative number into text', async () => {
    const app = await fixture();
    const response = await app.inject('/reports/financial/cash-flow?format=csv');
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('\uFEFFperiod,inflow,outflow,net\r\n2026-10,50,200,-150\r\n');
  });

  it.each([UserRole.AGENT, UserRole.VIEWER])('denies %s before loading report data', async (role) => {
    const app = await fixture(role);
    for (const path of ['/reports/sales', '/reports/financial/cash-flow']) {
      expect((await app.inject(`${path}?format=csv`)).statusCode).toBe(403);
    }
    expect(reports.getSalesReport).not.toHaveBeenCalled();
    expect(reports.getCashFlowByPeriod).not.toHaveBeenCalled();
  });

  it('denies requests without authentication', async () => {
    const app = await fixture(null);
    expect((await app.inject('/reports/sales?format=csv')).statusCode).toBe(401);
    expect(reports.getSalesReport).not.toHaveBeenCalled();
  });

  it('uses the authenticated agency even if the query names another one', async () => {
    const app = await fixture(UserRole.MANAGER, 'test-agency-b');
    const response = await app.inject('/reports/sales?format=csv&agencyId=test-agency-a');
    expect(response.body).toContain('test-agency-b');
    expect(response.body).not.toContain('test-agency-a');
  });

  it('rejects invalid format before running the report query', async () => {
    const app = await fixture();
    const response = await app.inject('/reports/sales?format=xml');
    expect(response.statusCode).toBe(400);
    expect(reports.getSalesReport).not.toHaveBeenCalled();
  });
});
