import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { isCsvRequest, sendReportCsv } from '../report-csv';
import {
  getCommissionsProjection,
  getReceivablesProjection,
  getRevenueForecast,
  getSupplierBalances,
  parseProjectionFilters,
} from '../report-projections-service';

type Query = Record<string, unknown>;

/**
 * Projection reports (Frente 9). MANAGER+ like the other management reports;
 * the sale filters are the same in every report and the CSV goes through the
 * existing report-csv contract (formula protection, ceilings).
 */
export function registerReportProjectionRoutes(
  app: FastifyInstance,
  options: { database: DatabaseRuntime; protectedHooks: preHandlerHooks },
): void {
  const { database, protectedHooks } = options;

  app.get<{ Querystring: Query }>('/reports/receivables-projection', { preHandler: protectedHooks }, async (request, reply) => {
    const csv = isCsvRequest(request.query.format);
    const result = await getReceivablesProjection(database, parseProjectionFilters(request.query));
    if (csv) {
      return sendReportCsv(reply, 'recebiveis-projecao.csv', ['period', 'openBalance', 'count'], [
        ['late', result.late.openBalance, result.late.count],
        ...result.byMonth.map((row) => [row.month, row.openBalance, row.count]),
      ]);
    }
    return result;
  });

  app.get<{ Querystring: Query }>('/reports/revenue-forecast', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const csv = isCsvRequest(request.query.format);
    const result = await getRevenueForecast(database, parseProjectionFilters(request.query, true));
    if (csv) {
      return sendReportCsv(reply, 'receita-projecao.csv', ['entryId','supplierId','status','expectedPaymentDate','forecast','released','paid'],
        result.entries.filter(row=>!['PENDING_RULE','CANCELLED'].includes(row.status)).map(row=>[
          row.entryId,row.supplierId,row.status,row.expectedOn??row.entitledOn,
          row.amount,['ENTITLED','AVAILABLE','RECEIVED'].includes(row.status)?row.amount:0,
          row.status==='RECEIVED'?(row.receivedAmount??0):0,
        ]));
    }
    return result;
  });

  app.get<{ Querystring: Query }>('/reports/supplier-balances', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const csv = isCsvRequest(request.query.format);
    const rows = await getSupplierBalances(database, parseProjectionFilters(request.query, true));
    if (csv) {
      return sendReportCsv(reply, 'saldos-fornecedores.csv', ['supplierId', 'volumeSold', 'expectedRevenue', 'receivedRevenue', 'difference', 'employeeCommissionsPaid', 'agencyResult'],
        rows.map((row) => [row.supplierId, row.volumeSold, row.expected, row.received, row.difference, row.employeeCommissionsPaid, row.result]));
    }
    return { rows };
  });

  app.get<{ Querystring: Query }>('/reports/commissions-projection', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const csv = isCsvRequest(request.query.format);
    const result = await getCommissionsProjection(database, parseProjectionFilters(request.query));
    if (csv) {
      return sendReportCsv(reply, 'comissoes-projecao.csv', ['forecast', 'released', 'paid', 'releasedNotPaid', 'notYetReleased', 'expectedPayMonth', 'releasedNotPaidForMonth'], [
        [result.forecast, result.released, result.paid, result.releasedNotPaid, result.notYetReleased, '', ''],
        ...result.releasedNotPaidByExpectedPayMonth.map(row => ['', '', '', '', '', row.month, row.amount]),
      ]);
    }
    return result;
  });
}

type preHandlerHooks = preHandlerHookHandler[];
