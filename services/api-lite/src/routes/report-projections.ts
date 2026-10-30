import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from 'fastify';
import { requirePermission } from '../access';
import type { LiteDatabase } from '../database';
import { toCsv } from '../report-csv';
import {
  getReceivablesProjection,
  getRevenueForecast,
  getSupplierBalances,
  parseProjectionFilters,
} from '../report-projections-service';
import { getTenantContext } from '../tenant-context';

type Query = Record<string, unknown>;

function sendCsv(reply: FastifyReply, filename: string, headers: string[], rows: Array<Array<string | number | null>>): FastifyReply {
  reply.header('content-type', 'text/csv; charset=utf-8');
  reply.header('content-disposition', `attachment; filename="${filename}"`);
  reply.header('cache-control', 'private, no-store');
  return reply.send(toCsv(headers, rows));
}

/**
 * Projection reports (Frente 9), Lite subset of the Full ones. Finance
 * permission for the customer receivables, revenue permission for the agency
 * revenue and supplier balances; sale filters are the same in every report.
 */
export function registerReportProjectionRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/reports/receivables-projection', { preHandler: protectedHooks }, async (request, reply) => {
    requirePermission(getTenantContext(), 'reports.finance');
    const query = (request.query ?? {}) as Query;
    const result = await getReceivablesProjection(database, parseProjectionFilters(query));
    if (query.format === 'csv') {
      return sendCsv(reply, 'recebiveis-projecao.csv', ['period', 'openBalance', 'count'], [
        ['late', result.late.openBalance, result.late.count],
        ...result.byMonth.map((row) => [row.month, row.openBalance, row.count]),
      ]);
    }
    return result;
  });

  app.get('/reports/revenue-forecast', { preHandler: protectedHooks }, async (request, reply) => {
    requirePermission(getTenantContext(), 'revenue.read_all');
    const query = (request.query ?? {}) as Query;
    const result = await getRevenueForecast(database, parseProjectionFilters(query, true));
    if (query.format === 'csv') {
      return sendCsv(reply, 'receita-projecao.csv', ['supplierId', 'contracted', 'projected', 'undefined'],
        result.bySupplier.map((row) => [row.supplierId, row.contracted, row.projected, row.undefined]));
    }
    return result;
  });

  app.get('/reports/supplier-balances', { preHandler: protectedHooks }, async (request, reply) => {
    requirePermission(getTenantContext(), 'revenue.read_all');
    const query = (request.query ?? {}) as Query;
    const rows = await getSupplierBalances(database, parseProjectionFilters(query, true));
    if (query.format === 'csv') {
      return sendCsv(reply, 'saldos-fornecedores.csv', ['supplierId', 'expected', 'received', 'difference'],
        rows.map((row) => [row.supplierId, row.expected, row.received, row.difference]));
    }
    return { rows };
  });
}
