/**
 * Reports -- management reports: sales, financial aging, supplier exposure,
 * employee expenses, operational expenses, expected vs actual, cash flow
 * by period, profitability, and personnel.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
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

  app.get<{ Querystring: { groupBy?: string; from?: string; to?: string } }>(
    '/reports/sales',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const groupBy = (request.query.groupBy ?? 'period') as SalesGroupBy;
      const from = request.query.from ? new Date(request.query.from) : new Date('2000-01-01');
      const to = request.query.to ? new Date(request.query.to) : new Date('2100-01-01');
      const rows = await getSalesReport(database, groupBy, from, to);
      return { rows };
    }
  );

  app.get('/reports/financial/receivables-aging', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    const rows = await getReceivablesAging(database);
    return { rows };
  });

  app.get('/reports/financial/payables-aging', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    const rows = await getPayablesAging(database);
    return { rows };
  });

  app.get('/reports/financial/supplier-exposure', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    const rows = await getSupplierExposure(database);
    return { rows };
  });

  app.get('/reports/financial/employee-expenses', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    const rows = await getEmployeeExpenses(database);
    return { rows };
  });

  app.get('/reports/financial/operational-expenses', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    const rows = await getOperationalExpensesBreakdown(database);
    return { rows };
  });

  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/reports/financial/expected-vs-actual',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const from = request.query.from ? new Date(request.query.from) : new Date('2000-01-01');
      const to = request.query.to ? new Date(request.query.to) : new Date('2100-01-01');
      const rows = await getExpectedVsActual(database, from, to);
      return { rows };
    }
  );

  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/reports/financial/cash-flow',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const from = request.query.from ? new Date(request.query.from) : new Date('2000-01-01');
      const to = request.query.to ? new Date(request.query.to) : new Date('2100-01-01');
      const rows = await getCashFlowByPeriod(database, from, to);
      return { rows };
    }
  );

  app.get<{ Querystring: { groupBy?: string } }>(
    '/reports/profitability',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const groupBy = (request.query.groupBy ?? 'sale') as ProfitabilityGroupBy;
      const rows = await getProfitabilityReport(database, groupBy);
      return { rows };
    }
  );

  app.get<{ Querystring: { groupBy?: string } }>(
    '/reports/personnel',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const groupBy = (request.query.groupBy ?? 'employee') as PersonnelGroupBy;
      const rows = await getPersonnelReport(database, groupBy);
      return { rows };
    }
  );
}
