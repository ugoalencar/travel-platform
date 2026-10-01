import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from 'fastify';
import {
  can,
  effectiveSellerFilter,
  requirePermission,
  scopeCondition,
  scopeFor,
  type Scope,
} from '../access';
import type { LiteDatabase } from '../database';
import {
  EFFECTIVE_SALE_STATUSES,
  buildSalesCharts,
  loadSalesReportRows,
  parsePeriod,
  parseSalesReportFilters,
  sumMoney,
} from '../sales-analytics';
import { getTenantContext, type TenantContext } from '../tenant-context';
import { optionalDate, optionalEnum, optionalUuid } from '../validation';

const COMMISSION_STATUSES = ['PENDING_RULE', 'PENDING', 'APPROVED', 'PAID', 'CANCELLED'] as const;
const REPORT_LIMIT = 50_000;
const DEFAULT_CASH_FLOW_DAYS = 90;

function optionalCsvFlag(query: Record<string, string | undefined>): boolean {
  return query.format === 'csv';
}

function escapeCsvCell(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[";\n\r,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function sendCsv(
  reply: FastifyReply,
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null>>,
): FastifyReply {
  reply.header('content-type', 'text/csv; charset=utf-8');
  reply.header('content-disposition', `attachment; filename="${filename}"`);
  return reply.send(toCsv(headers, rows));
}

/**
 * Sales-report scope: reports.sales_all sees every seller, reports.sales_own
 * only the seller linked to the login (asking for another seller -> 403).
 */
function salesReportScope(context: TenantContext): Scope {
  return scopeFor(context, 'reports.sales_all', 'reports.sales_own');
}

/** Seller comparison needs reports.sellers_all; otherwise own figures only. */
function sellerReportScope(context: TenantContext): Scope {
  return can(context, 'reports.sellers_all') ? { all: true } : salesReportScope(context);
}

export function registerReportRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/reports/sales', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    const query = (request.query ?? {}) as Record<string, string | undefined>;
    const filters = parseSalesReportFilters(query, null);
    filters.sellerId = effectiveSellerFilter(salesReportScope(context), filters.sellerId);

    const items = await database.withTenantTransaction((client) =>
      loadSalesReportRows(client, context.tenantId, filters),
    );

    const totals = {
      count: items.length,
      gross_amount: sumMoney(items, 'gross_amount'),
      cost_amount: sumMoney(items, 'cost_amount'),
      margin_amount: sumMoney(items, 'margin_amount'),
      received_amount: sumMoney(items, 'received_amount'),
      pending_amount: sumMoney(items, 'pending_amount'),
      commission_amount: sumMoney(items, 'commission_amount'),
      commission_paid_amount: sumMoney(items, 'commission_paid_amount'),
      commission_pending_amount: sumMoney(items, 'commission_pending_amount'),
    };

    if (optionalCsvFlag(query)) {
      sendCsv(
        reply,
        `vendas-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'sale_number',
          'sale_date',
          'status',
          'customer',
          'seller',
          'category',
          'gross_amount',
          'cost_amount',
          'margin_amount',
          'installment_count',
          'received_amount',
          'pending_amount',
          'commission_amount',
          'commission_status',
        ],
        items.map((r) => [
          r.sale_number,
          r.sale_date,
          r.status,
          r.customer_name,
          r.seller_name,
          r.category_name,
          r.gross_amount,
          r.cost_amount,
          r.margin_amount,
          r.installment_count,
          r.received_amount,
          r.pending_amount,
          r.commission_amount,
          r.commission_status,
        ]),
      );
      return reply;
    }

    return { items, totals, period: { from: filters.from, to: filters.to } };
  });

  // Per-seller totals. Built from the same rows as /reports/sales, so the
  // drill-down (/reports/sales with the same filters + seller_id) always
  // adds up to the seller's line. Without a status filter only effective
  // sales count (drafts and cancelled sales are not "sold").
  app.get('/reports/sellers', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    const query = (request.query ?? {}) as Record<string, string | undefined>;
    const filters = parseSalesReportFilters(query, EFFECTIVE_SALE_STATUSES);
    filters.sellerId = effectiveSellerFilter(sellerReportScope(context), filters.sellerId);

    const { sellers, rows } = await database.withTenantTransaction(async (client) => {
      const sellerResult = await client.query<{ id: string; name: string; status: string }>(
        `SELECT id, name, status FROM sellers
          WHERE tenant_id = $1 AND ($2::uuid IS NULL OR id = $2)
          ORDER BY name`,
        [context.tenantId, filters.sellerId],
      );
      return {
        sellers: sellerResult.rows,
        rows: await loadSalesReportRows(client, context.tenantId, filters),
      };
    });

    const items = sellers
      .map((seller) => {
        const sales = rows.filter((row) => row.seller_id === seller.id);
        return {
          seller_id: seller.id,
          seller_name: seller.name,
          seller_status: seller.status,
          sales_count: sales.length,
          gross_amount: sumMoney(sales, 'gross_amount'),
          cost_amount: sumMoney(sales, 'cost_amount'),
          margin_amount: sumMoney(sales, 'margin_amount'),
          received_amount: sumMoney(sales, 'received_amount'),
          pending_amount: sumMoney(sales, 'pending_amount'),
          commission_amount: sumMoney(sales, 'commission_amount'),
          commission_paid_amount: sumMoney(sales, 'commission_paid_amount'),
          commission_pending_amount: sumMoney(sales, 'commission_pending_amount'),
          commission_pending_rule_count: sales.filter((r) => r.commission_status === 'PENDING_RULE')
            .length,
        };
      })
      // Inactive sellers without sales in the period are noise.
      .filter((item) => item.sales_count > 0 || item.seller_status === 'ACTIVE');

    const totals = {
      sales_count: rows.length,
      gross_amount: sumMoney(rows, 'gross_amount'),
      cost_amount: sumMoney(rows, 'cost_amount'),
      margin_amount: sumMoney(rows, 'margin_amount'),
      received_amount: sumMoney(rows, 'received_amount'),
      pending_amount: sumMoney(rows, 'pending_amount'),
      commission_amount: sumMoney(rows, 'commission_amount'),
      commission_paid_amount: sumMoney(rows, 'commission_paid_amount'),
      commission_pending_amount: sumMoney(rows, 'commission_pending_amount'),
    };

    if (optionalCsvFlag(query)) {
      sendCsv(
        reply,
        `vendedores-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'seller',
          'sales_count',
          'gross_amount',
          'cost_amount',
          'margin_amount',
          'received_amount',
          'pending_amount',
          'commission_amount',
          'commission_paid_amount',
          'commission_pending_amount',
        ],
        items.map((r) => [
          r.seller_name,
          r.sales_count,
          r.gross_amount,
          r.cost_amount,
          r.margin_amount,
          r.received_amount,
          r.pending_amount,
          r.commission_amount,
          r.commission_paid_amount,
          r.commission_pending_amount,
        ]),
      );
      return reply;
    }

    return {
      items,
      totals,
      charts: buildSalesCharts(rows),
      filters: {
        from: filters.from,
        to: filters.to,
        seller_id: filters.sellerId,
        category_id: filters.categoryId,
        statuses: filters.statuses,
      },
    };
  });

  app.get('/reports/commissions', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    const query = (request.query ?? {}) as Record<string, string | undefined>;
    const period = parsePeriod(query);

    const conditions: string[] = ['sc.tenant_id = $1'];
    const params: unknown[] = [context.tenantId];

    function addCondition(column: string, operator: string, value: unknown): void {
      params.push(value);
      conditions.push(`${column} ${operator} $${params.length}`);
    }

    if (period.from) addCondition('sc.created_at', '>=', period.from);
    if (period.to) {
      params.push(period.to);
      conditions.push(`sc.created_at < ($${params.length}::date + interval '1 day')`);
    }
    const scope = scopeFor(context, 'commissions.read_all', 'commissions.read_own');
    const sellerFilter = effectiveSellerFilter(
      scope,
      optionalUuid({ seller_id: query.seller_id ?? null }, 'seller_id'),
    );
    const scoped = scopeCondition(scope, 'sc.seller_id', params);
    if (scoped) conditions.push(scoped);
    else if (sellerFilter) addCondition('sc.seller_id', '=', sellerFilter);
    if (query.status) {
      addCondition(
        'sc.status',
        '=',
        optionalEnum({ status: query.status }, 'status', COMMISSION_STATUSES),
      );
    }
    const where = conditions.join(' AND ');

    const rows = await database.withTenantTransaction(async (client) =>
      client.query<{
        created_at: string;
        sale_number: string;
        seller_name: string;
        status: string;
        calculation_type: string | null;
        commission_amount: string | null;
        paid_at: string | null;
      }>(
        `SELECT sc.created_at, s.sale_number, se.name AS seller_name, sc.status,
                sc.calculation_type, sc.commission_amount, sc.paid_at
           FROM seller_commissions sc
           JOIN sellers se ON se.tenant_id = sc.tenant_id AND se.id = sc.seller_id
           JOIN sales s ON s.tenant_id = sc.tenant_id AND s.id = sc.sale_id
          WHERE ${where}
          ORDER BY sc.created_at DESC
          LIMIT ${REPORT_LIMIT}`,
        params,
      ),
    );

    const items = rows.rows.map((row) => ({
      ...row,
      commission_amount: row.commission_amount !== null ? Number(row.commission_amount) : null,
    }));

    const totals = {
      count: items.length,
      commission_amount: items.reduce((sum, r) => sum + (r.commission_amount ?? 0), 0),
      paid_amount: items
        .filter((r) => r.status === 'PAID')
        .reduce((sum, r) => sum + (r.commission_amount ?? 0), 0),
    };

    if (optionalCsvFlag(query)) {
      sendCsv(
        reply,
        `comissoes-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'created_at',
          'sale_number',
          'seller',
          'status',
          'calculation_type',
          'commission_amount',
          'paid_at',
        ],
        items.map((r) => [
          String(r.created_at).slice(0, 10),
          r.sale_number,
          r.seller_name,
          r.status,
          r.calculation_type,
          r.commission_amount,
          r.paid_at !== null ? String(r.paid_at).slice(0, 10) : null,
        ]),
      );
      return reply;
    }

    return { items, totals, period };
  });

  app.get('/reports/cash-flow', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'reports.finance');
    const query = (request.query ?? {}) as Record<string, string | undefined>;

    let from = optionalDate({ from: query.from ?? null }, 'from');
    let to = optionalDate({ to: query.to ?? null }, 'to');
    if (!from) {
      const defaultFrom = new Date();
      defaultFrom.setDate(defaultFrom.getDate() - DEFAULT_CASH_FLOW_DAYS);
      from = defaultFrom.toISOString().slice(0, 10);
    }
    if (!to) to = new Date().toISOString().slice(0, 10);

    const rows = await database.withTenantTransaction(async (client) =>
      client.query<{ day: string; inflow: string; outflow: string }>(
        `SELECT to_char(occurred_at, 'YYYY-MM-DD') AS day,
                coalesce(sum(amount) FILTER (WHERE type = 'IN'), 0) AS inflow,
                coalesce(sum(amount) FILTER (WHERE type = 'OUT'), 0) AS outflow
           FROM financial_transactions
          WHERE tenant_id = $1 AND occurred_at >= $2 AND occurred_at <= $3
          GROUP BY occurred_at
          ORDER BY occurred_at`,
        [context.tenantId, from, to],
      ),
    );

    const items = rows.rows.map((row) => {
      const inflow = Number(row.inflow);
      const outflow = Number(row.outflow);
      return { day: row.day, inflow, outflow, net: Math.round((inflow - outflow) * 100) / 100 };
    });

    const totals = {
      inflow: Math.round(items.reduce((sum, r) => sum + r.inflow, 0) * 100) / 100,
      outflow: Math.round(items.reduce((sum, r) => sum + r.outflow, 0) * 100) / 100,
    };

    if (optionalCsvFlag(query)) {
      sendCsv(
        reply,
        `fluxo-de-caixa-${from}-a-${to}.csv`,
        ['day', 'inflow', 'outflow', 'net'],
        items.map((r) => [r.day, r.inflow, r.outflow, r.net]),
      );
      return reply;
    }

    return { items, totals, period: { from, to } };
  });

  app.get('/reports/sale-costs', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'reports.finance');
    const query = (request.query ?? {}) as Record<string, string | undefined>;
    const from = optionalDate({ from: query.from ?? null }, 'from');
    const to = optionalDate({ to: query.to ?? null }, 'to');
    const sellerId = optionalUuid({ seller_id: query.seller_id ?? null }, 'seller_id');
    const categoryId = optionalUuid({ category_id: query.category_id ?? null }, 'category_id');

    const conditions = [`s.tenant_id = $1`, `s.status <> 'CANCELLED'`];
    const params: unknown[] = [context.tenantId];
    if (from) {
      params.push(from);
      conditions.push(`s.sale_date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`s.sale_date <= $${params.length}`);
    }
    if (sellerId) {
      params.push(sellerId);
      conditions.push(`s.seller_id = $${params.length}`);
    }
    if (categoryId) {
      params.push(categoryId);
      conditions.push(`s.category_id = $${params.length}`);
    }
    const where = conditions.join(' AND ');

    const result = await database.withTenantTransaction(async (client) => {
      const totals = await client.query<{
        revenue: string;
        direct_costs: string;
        gross_margin: string;
      }>(
        `SELECT COALESCE(sum(s.gross_amount), 0)::text AS revenue,
                COALESCE(sum(s.cost_amount), 0)::text AS direct_costs,
                COALESCE(sum(s.margin_amount), 0)::text AS gross_margin
           FROM sales s
          WHERE ${where}`,
        params,
      );
      const supplierRows = await client.query<{
        financial_party_id: string | null;
        financial_party_name: string | null;
        direct_costs: string;
      }>(
        `SELECT c.financial_party_id, COALESCE(fp.name, 'Sem favorecido') AS financial_party_name,
                COALESCE(sum(c.amount), 0)::text AS direct_costs
           FROM sale_cost_items c
           JOIN sales s ON s.tenant_id = c.tenant_id AND s.id = c.sale_id
           LEFT JOIN financial_parties fp ON fp.tenant_id = c.tenant_id AND fp.id = c.financial_party_id
          WHERE ${where}
          GROUP BY c.financial_party_id, fp.name
          ORDER BY COALESCE(sum(c.amount), 0) DESC, COALESCE(fp.name, 'Sem favorecido')`,
        params,
      );
      return { totals: totals.rows[0]!, bySupplier: supplierRows.rows };
    });

    const revenue = Number(result.totals.revenue);
    const directCosts = Number(result.totals.direct_costs);
    const grossMargin = Number(result.totals.gross_margin);
    const bySupplier = result.bySupplier.map((row) => ({
      financial_party_id: row.financial_party_id,
      financial_party_name: row.financial_party_name,
      direct_costs: Number(row.direct_costs),
    }));

    return {
      totals: {
        revenue,
        direct_costs: directCosts,
        gross_margin: grossMargin,
        margin_percentage: revenue > 0 ? Math.round((grossMargin / revenue) * 10000) / 100 : 0,
      },
      by_supplier: bySupplier,
      charts: { by_supplier: bySupplier },
      period: { from, to },
    };
  });
}
