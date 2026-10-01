import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from 'fastify';
import type { LiteDatabase, TenantClient } from '../database';
import { getTenantContext } from '../tenant-context';
import { optionalDate, optionalEnum, optionalUuid } from '../validation';

const SALE_STATUSES = ['DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;
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

interface PeriodFilters {
  from: string | null;
  to: string | null;
}

function parsePeriod(query: Record<string, string | undefined>): PeriodFilters {
  return {
    from: optionalDate({ from: query.from ?? null }, 'from'),
    to: optionalDate({ to: query.to ?? null }, 'to'),
  };
}

const EFFECTIVE_SALE_STATUSES = ['CONFIRMED', 'PARTIALLY_PAID', 'PAID'] as const;

type SaleStatus = (typeof SALE_STATUSES)[number];

interface SalesReportFilters extends PeriodFilters {
  sellerId: string | null;
  categoryId: string | null;
  statuses: SaleStatus[] | null;
}

/** `status` accepts one value or a comma-separated list (e.g. CONFIRMED,PAID). */
function parseSalesReportFilters(
  query: Record<string, string | undefined>,
  defaultStatuses: readonly SaleStatus[] | null,
): SalesReportFilters {
  const statuses = query.status
    ? [
        ...new Set(
          query.status
            .split(',')
            .map((value) => optionalEnum({ status: value }, 'status', SALE_STATUSES))
            .filter((value): value is SaleStatus => value !== null),
        ),
      ]
    : null;
  return {
    ...parsePeriod(query),
    sellerId: optionalUuid({ seller_id: query.seller_id ?? null }, 'seller_id'),
    categoryId: optionalUuid({ category_id: query.category_id ?? null }, 'category_id'),
    statuses: statuses && statuses.length > 0 ? statuses : defaultStatuses ? [...defaultStatuses] : null,
  };
}

interface SalesReportRow {
  sale_id: string;
  sale_number: string;
  sale_date: string;
  status: string;
  customer_name: string | null;
  seller_id: string;
  seller_name: string | null;
  category_name: string | null;
  installment_count: number;
  gross_amount: number;
  cost_amount: number;
  margin_amount: number;
  received_amount: number;
  pending_amount: number;
  commission_status: string | null;
  commission_amount: number;
  commission_paid_amount: number;
  commission_pending_amount: number;
}

/**
 * One row per sale with its financial position: received/pending come from
 * the sale's non-cancelled receivables, commission figures from its active
 * (non-cancelled) commission. Commission "pending" = valued but not yet
 * paid (PENDING or APPROVED); PENDING_RULE has no value yet.
 */
async function loadSalesReportRows(
  client: TenantClient,
  tenantId: string,
  filters: SalesReportFilters,
): Promise<SalesReportRow[]> {
  const conditions: string[] = ['s.tenant_id = $1'];
  const params: unknown[] = [tenantId];
  function addCondition(sql: (placeholder: string) => string, value: unknown): void {
    params.push(value);
    conditions.push(sql(`$${params.length}`));
  }
  if (filters.from) addCondition((p) => `s.sale_date >= ${p}`, filters.from);
  if (filters.to) addCondition((p) => `s.sale_date <= ${p}`, filters.to);
  if (filters.sellerId) addCondition((p) => `s.seller_id = ${p}`, filters.sellerId);
  if (filters.categoryId) addCondition((p) => `s.category_id = ${p}`, filters.categoryId);
  if (filters.statuses) addCondition((p) => `s.status = ANY(${p}::text[])`, filters.statuses);

  const result = await client.query<{
    sale_id: string;
    sale_number: string;
    sale_date: string;
    status: string;
    customer_name: string | null;
    seller_id: string;
    seller_name: string | null;
    category_name: string | null;
    installment_count: number;
    gross_amount: string;
    cost_amount: string;
    margin_amount: string;
    received_amount: string;
    pending_amount: string;
    commission_status: string | null;
    commission_amount: string | null;
  }>(
    `SELECT s.id AS sale_id, s.sale_number, to_char(s.sale_date, 'YYYY-MM-DD') AS sale_date,
            s.status, c.name AS customer_name, s.seller_id, se.name AS seller_name,
            cat.name AS category_name, s.installment_count,
            s.gross_amount, s.cost_amount, s.margin_amount,
            coalesce(r.received, 0) AS received_amount,
            coalesce(r.pending, 0) AS pending_amount,
            sc.status AS commission_status, sc.commission_amount
       FROM sales s
       LEFT JOIN customers c ON c.tenant_id = s.tenant_id AND c.id = s.customer_id
       LEFT JOIN sellers se ON se.tenant_id = s.tenant_id AND se.id = s.seller_id
       LEFT JOIN sale_categories cat ON cat.tenant_id = s.tenant_id AND cat.id = s.category_id
       LEFT JOIN LATERAL (
         SELECT sum(rc.paid_amount) AS received, sum(rc.amount - rc.paid_amount) AS pending
           FROM receivables rc
          WHERE rc.tenant_id = s.tenant_id AND rc.sale_id = s.id AND rc.status <> 'CANCELLED'
       ) r ON true
       LEFT JOIN seller_commissions sc
         ON sc.tenant_id = s.tenant_id AND sc.sale_id = s.id AND sc.status <> 'CANCELLED'
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.sale_date DESC, s.sale_number
      LIMIT ${REPORT_LIMIT}`,
    params,
  );

  return result.rows.map((row) => {
    const commission = Number(row.commission_amount ?? 0);
    return {
      ...row,
      gross_amount: Number(row.gross_amount),
      cost_amount: Number(row.cost_amount),
      margin_amount: Number(row.margin_amount),
      received_amount: Number(row.received_amount),
      pending_amount: Number(row.pending_amount),
      commission_amount: commission,
      commission_paid_amount: row.commission_status === 'PAID' ? commission : 0,
      commission_pending_amount:
        row.commission_status === 'PENDING' || row.commission_status === 'APPROVED' ? commission : 0,
    };
  });
}

type MoneyField = {
  [K in keyof SalesReportRow]: SalesReportRow[K] extends number ? K : never;
}[keyof SalesReportRow];

/** Sums in cents so report totals never drift by floating-point error. */
function sumMoney(rows: SalesReportRow[], field: MoneyField): number {
  return rows.reduce((cents, row) => cents + Math.round(row[field] * 100), 0) / 100;
}

export function registerReportRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/dashboard', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const query = (request.query ?? {}) as Record<string, string | undefined>;
    const period = parsePeriod(query);

    const result = await database.withTenantTransaction(async (client) => {
      const salesMonth = await client.query<{ count: number; gross: string; margin: string }>(
        `SELECT count(*)::int AS count,
                coalesce(sum(gross_amount), 0) AS gross,
                coalesce(sum(margin_amount), 0) AS margin
           FROM sales
          WHERE tenant_id = $1
            AND sale_date >= date_trunc('month', CURRENT_DATE)::date
            AND status IN ('CONFIRMED', 'PARTIALLY_PAID', 'PAID')`,
        [context.tenantId],
      );

      const commissions = await client.query<{
        pending_count: number;
        pending_amount: string;
        rule_count: number;
      }>(
        `SELECT count(*) FILTER (WHERE status = 'PENDING')::int AS pending_count,
                coalesce(sum(commission_amount) FILTER (WHERE status = 'PENDING'), 0) AS pending_amount,
                count(*) FILTER (WHERE status = 'PENDING_RULE')::int AS rule_count
           FROM seller_commissions WHERE tenant_id = $1`,
        [context.tenantId],
      );

      const receivables = await client.query<{
        open_amount: string;
        overdue_amount: string;
        overdue_count: number;
      }>(
        `SELECT coalesce(sum(amount - paid_amount), 0) AS open_amount,
                coalesce(sum(amount - paid_amount) FILTER (WHERE due_at < CURRENT_DATE), 0) AS overdue_amount,
                count(*) FILTER (WHERE due_at < CURRENT_DATE)::int AS overdue_count
           FROM receivables
          WHERE tenant_id = $1 AND status IN ('OPEN', 'PARTIALLY_PAID')`,
        [context.tenantId],
      );

      const payables = await client.query<{
        open_amount: string;
        overdue_amount: string;
        overdue_count: number;
      }>(
        `SELECT coalesce(sum(amount - paid_amount), 0) AS open_amount,
                coalesce(sum(amount - paid_amount) FILTER (WHERE due_at < CURRENT_DATE), 0) AS overdue_amount,
                count(*) FILTER (WHERE due_at < CURRENT_DATE)::int AS overdue_count
           FROM payables
          WHERE tenant_id = $1 AND status IN ('OPEN', 'PARTIALLY_PAID')`,
        [context.tenantId],
      );

      const accounts = await client.query<{
        id: string;
        name: string;
        type: string;
        balance: string;
      }>(
        `SELECT a.id, a.name, a.type,
                (a.initial_balance
                  + coalesce((SELECT sum(t.amount) FROM financial_transactions t
                               WHERE t.tenant_id = a.tenant_id AND t.account_id = a.id AND t.type = 'IN'), 0)
                  - coalesce((SELECT sum(t.amount) FROM financial_transactions t
                               WHERE t.tenant_id = a.tenant_id AND t.account_id = a.id AND t.type = 'OUT'), 0)
                ) AS balance
           FROM financial_accounts a
          WHERE a.tenant_id = $1 AND a.active
          ORDER BY a.name`,
        [context.tenantId],
      );

      return {
        salesMonth: salesMonth.rows[0],
        commissions: commissions.rows[0],
        receivables: receivables.rows[0],
        payables: payables.rows[0],
        accounts: accounts.rows,
        period,
      };
    });

    return {
      sales_this_month: {
        count: result.salesMonth?.count ?? 0,
        gross_amount: Number(result.salesMonth?.gross ?? 0),
        margin_amount: Number(result.salesMonth?.margin ?? 0),
      },
      commissions: {
        pending_count: result.commissions?.pending_count ?? 0,
        pending_amount: Number(result.commissions?.pending_amount ?? 0),
        pending_rule_count: result.commissions?.rule_count ?? 0,
      },
      receivables: {
        open_amount: Number(result.receivables?.open_amount ?? 0),
        overdue_amount: Number(result.receivables?.overdue_amount ?? 0),
        overdue_count: result.receivables?.overdue_count ?? 0,
      },
      payables: {
        open_amount: Number(result.payables?.open_amount ?? 0),
        overdue_amount: Number(result.payables?.overdue_amount ?? 0),
        overdue_count: result.payables?.overdue_count ?? 0,
      },
      accounts: result.accounts.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        balance: Number(row.balance),
      })),
      period: result.period,
    };
  });

  app.get('/reports/sales', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    const query = (request.query ?? {}) as Record<string, string | undefined>;
    const filters = parseSalesReportFilters(query, null);

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
    if (query.seller_id) {
      addCondition('sc.seller_id', '=', optionalUuid({ seller_id: query.seller_id }, 'seller_id'));
    }
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
}
