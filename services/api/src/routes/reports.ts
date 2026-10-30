/**
 * Reports -- management reports: sales, financial aging, supplier exposure,
 * employee expenses, operational expenses, expected vs actual, cash flow
 * by period, profitability, and personnel.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireExactRole, requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { isCsvRequest, sendReportCsv } from '../report-csv';
import { generateDatasetExport, getReportExportCatalog } from '../report-dataset-export';
import {
  getCashFlowByPeriod,
  getEmployeeExpenses,
  getExpectedVsActual,
  getOperationalExpensesBreakdown,
  getPayablesAging,
  getPersonnelReport,
  getProfitabilityReport,
  getReceivablesAging,
  getSalesReport,
  getSupplierExposure,
  type PersonnelGroupBy,
  type ProfitabilityGroupBy,
  type SalesGroupBy,
} from '../reports';

export interface ReportsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerReportsRoutes(
  app: FastifyInstance,
  options: ReportsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/reports/export/catalog', { preHandler: protectedHooks }, async (_request, reply) => {
    requireExactRole(UserRole.OWNER);
    reply.header('cache-control', 'private, no-store');
    return { datasets: getReportExportCatalog() };
  });

  app.post<{ Body: unknown }>('/reports/export', { preHandler: protectedHooks, bodyLimit: 16 * 1024 }, async (request, reply) => {
    requireExactRole(UserRole.OWNER);
    const result = await generateDatasetExport(database, request.body);
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${result.filename}"`)
      .header('x-export-row-count', String(result.rows))
      .header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff')
      .send(result.csv);
  });

  app.get<{ Querystring: { groupBy?: string; from?: string; to?: string; format?: string } }>(
    '/reports/sales',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const csv = isCsvRequest(request.query.format);
      const groupBy = (request.query.groupBy ?? 'period') as SalesGroupBy;
      const from = request.query.from ? new Date(request.query.from) : new Date('2000-01-01');
      const to = request.query.to ? new Date(request.query.to) : new Date('2100-01-01');
      const rows = await getSalesReport(database, groupBy, from, to);
      if (csv) {
        const filenameGroup = ['period', 'employee', 'destination', 'customer', 'product'].includes(groupBy)
          ? groupBy : 'period';
        return sendReportCsv(reply, `vendas-${filenameGroup}.csv`, ['key', 'label', 'count', 'total'],
          rows.map((row) => [row.key, row.label, row.count, row.total]));
      }
      return { rows };
    }
  );

  app.get<{ Querystring: { format?: string } }>('/reports/financial/receivables-aging', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const csv = isCsvRequest(request.query.format);
    const rows = await getReceivablesAging(database);
    if (csv) {
      return sendReportCsv(reply, 'receivables-aging.csv', ['bucket', 'count', 'total'],
        rows.map((row) => [row.bucket, row.count, row.total]));
    }
    return { rows };
  });

  app.get<{ Querystring: { format?: string } }>('/reports/financial/payables-aging', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const csv = isCsvRequest(request.query.format);
    const rows = await getPayablesAging(database);
    if (csv) {
      return sendReportCsv(reply, 'payables-aging.csv', ['bucket', 'count', 'total'],
        rows.map((row) => [row.bucket, row.count, row.total]));
    }
    return { rows };
  });

  app.get<{ Querystring: { format?: string } }>('/reports/financial/supplier-exposure', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const csv = isCsvRequest(request.query.format);
    const rows = await getSupplierExposure(database);
    if (csv) {
      return sendReportCsv(reply, 'supplier-exposure.csv',
        ['supplierId', 'supplierName', 'openTotal', 'paidTotal', 'count'],
        rows.map((row) => [row.supplierId, row.supplierName, row.openTotal, row.paidTotal, row.count]));
    }
    return { rows };
  });

  app.get<{ Querystring: { format?: string } }>('/reports/financial/employee-expenses', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const csv = isCsvRequest(request.query.format);
    const rows = await getEmployeeExpenses(database);
    if (csv) {
      return sendReportCsv(reply, 'employee-expenses.csv',
        ['employeeId', 'employeeName', 'payrollTotal', 'commissionTotal', 'total'],
        rows.map((row) => [row.employeeId, row.employeeName, row.payrollTotal, row.commissionTotal, row.total]));
    }
    return { rows };
  });

  app.get<{ Querystring: { format?: string } }>('/reports/financial/operational-expenses', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const csv = isCsvRequest(request.query.format);
    const rows = await getOperationalExpensesBreakdown(database);
    if (csv) {
      return sendReportCsv(reply, 'operational-expenses.csv', ['categoryId', 'categoryName', 'total', 'count'],
        rows.map((row) => [row.categoryId, row.categoryName, row.total, row.count]));
    }
    return { rows };
  });

  app.get<{ Querystring: { from?: string; to?: string; format?: string } }>(
    '/reports/financial/expected-vs-actual',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const csv = isCsvRequest(request.query.format);
      const from = request.query.from ? new Date(request.query.from) : new Date('2000-01-01');
      const to = request.query.to ? new Date(request.query.to) : new Date('2100-01-01');
      const rows = await getExpectedVsActual(database, from, to);
      if (csv) {
        return sendReportCsv(reply, 'expected-vs-actual.csv', ['label', 'expected', 'actual'],
          rows.map((row) => [row.label, row.expected, row.actual]));
      }
      return { rows };
    }
  );

  app.get<{ Querystring: { from?: string; to?: string; format?: string } }>(
    '/reports/financial/cash-flow',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const csv = isCsvRequest(request.query.format);
      const from = request.query.from ? new Date(request.query.from) : new Date('2000-01-01');
      const to = request.query.to ? new Date(request.query.to) : new Date('2100-01-01');
      const rows = await getCashFlowByPeriod(database, from, to);
      if (csv) {
        return sendReportCsv(reply, 'fluxo-de-caixa.csv', ['period', 'inflow', 'outflow', 'net'],
          rows.map((row) => [row.period, row.inflow, row.outflow, row.net]));
      }
      return { rows };
    }
  );

  app.get<{ Querystring: { groupBy?: string; format?: string } }>(
    '/reports/profitability',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const csv = isCsvRequest(request.query.format);
      const groupBy = (request.query.groupBy ?? 'sale') as ProfitabilityGroupBy;
      const rows = await getProfitabilityReport(database, groupBy);
      if (csv) {
        return sendReportCsv(reply, 'profitability.csv', ['key', 'label', 'revenue', 'cost', 'margin'],
          rows.map((row) => [row.key, row.label, row.revenue, row.cost, row.margin]));
      }
      return { rows };
    }
  );

  app.get<{ Querystring: { groupBy?: string; format?: string } }>(
    '/reports/personnel',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const csv = isCsvRequest(request.query.format);
      const groupBy = (request.query.groupBy ?? 'employee') as PersonnelGroupBy;
      const rows = await getPersonnelReport(database, groupBy);
      if (csv) {
        return sendReportCsv(reply, 'personnel.csv', ['key', 'label', 'salaryExpense', 'commissionTotal', 'total'],
          rows.map((row) => [row.key, row.label, row.salaryExpense, row.commissionTotal, row.total]));
      }
      return { rows };
    }
  );
}
