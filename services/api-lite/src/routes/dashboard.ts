/**
 * Configurable dashboard. Widget definitions live here (code); the
 * database only stores the tenant's choice of order and enabled flags
 * (dashboard_settings). Every widget is computed inside the viewer's
 * scope: the same "Vendas do mês" is the whole agency for a MASTER and
 * only the seller's own sales for a SELLER — there is no second dashboard.
 */
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { can, requirePermission, type Permission, type Scope } from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import type { LiteDatabase, TenantClient } from '../database';
import { ValidationError } from '../errors';
import {
  EFFECTIVE_SALE_STATUSES,
  buildSalesCharts,
  loadSalesReportRows,
  sumMoney,
  type SalesReportRow,
} from '../sales-analytics';
import { getTenantContext, type TenantContext } from '../tenant-context';
import { parseObjectBody } from '../validation';

type WidgetKind = 'kpi' | 'chart' | 'table';

interface WidgetDefinition {
  key: string;
  title: string;
  kind: WidgetKind;
  /** Which data the widget reads; decides visibility and row scope. */
  source: 'sales' | 'finance' | 'commissions';
}

export const WIDGETS: readonly WidgetDefinition[] = [
  { key: 'sales_month', title: 'Vendas do mês', kind: 'kpi', source: 'sales' },
  { key: 'sales_amount', title: 'Valor vendido no mês', kind: 'kpi', source: 'sales' },
  { key: 'received', title: 'Recebido no mês', kind: 'kpi', source: 'sales' },
  { key: 'receivable', title: 'A receber', kind: 'kpi', source: 'sales' },
  { key: 'expenses', title: 'Despesas pagas no mês', kind: 'kpi', source: 'finance' },
  { key: 'payable', title: 'A pagar', kind: 'kpi', source: 'finance' },
  { key: 'result', title: 'Resultado do mês', kind: 'kpi', source: 'finance' },
  { key: 'pending_commissions', title: 'Comissões a pagar', kind: 'kpi', source: 'commissions' },
  { key: 'sales_by_category_chart', title: 'Vendas por categoria (6 meses)', kind: 'chart', source: 'sales' },
  { key: 'sales_evolution_chart', title: 'Evolução de vendas e margem (6 meses)', kind: 'chart', source: 'sales' },
  { key: 'seller_ranking', title: 'Ranking de vendedores no mês', kind: 'table', source: 'sales' },
  { key: 'cash_flow', title: 'Fluxo de caixa (30 dias)', kind: 'chart', source: 'finance' },
];

const WIDGET_KEYS = new Set(WIDGETS.map((widget) => widget.key));

interface StoredWidget {
  key: string;
  enabled: boolean;
}

/** Stored order first (unknown keys dropped), then widgets added since. */
function mergeLayout(stored: StoredWidget[] | null): StoredWidget[] {
  const known = (stored ?? []).filter((item) => WIDGET_KEYS.has(item.key));
  const seen = new Set(known.map((item) => item.key));
  return [...known, ...WIDGETS.filter((w) => !seen.has(w.key)).map((w) => ({ key: w.key, enabled: true }))];
}

function optionalScope(context: TenantContext, all: Permission, own: Permission): Scope | null {
  if (can(context, all)) return { all: true };
  if (can(context, own) && context.sellerId) return { all: false, sellerId: context.sellerId };
  return null;
}

interface Scopes {
  sales: Scope | null;
  finance: boolean;
  commissions: Scope | null;
}

function viewerScopes(context: TenantContext): Scopes {
  return {
    sales: optionalScope(context, 'reports.sales_all', 'reports.sales_own'),
    finance: can(context, 'finance.read'),
    commissions: optionalScope(context, 'commissions.read_all', 'commissions.read_own'),
  };
}

function visible(widget: WidgetDefinition, scopes: Scopes): boolean {
  if (widget.source === 'finance') return scopes.finance;
  return scopes[widget.source] !== null;
}

function sellerOf(scope: Scope | null): string | null {
  return scope && !scope.all ? scope.sellerId : null;
}

async function loadLayout(client: TenantClient, tenantId: string): Promise<StoredWidget[]> {
  const result = await client.query<{ widgets: StoredWidget[] }>(
    'SELECT widgets FROM dashboard_settings WHERE tenant_id = $1',
    [tenantId],
  );
  return mergeLayout(result.rows[0]?.widgets ?? null);
}

interface Periods {
  month_from: string;
  month_to: string;
  six_from: string;
  cash_from: string;
  today: string;
}

/**
 * Money received/paid in a window through allocations. A reversal payment
 * has no allocation of its own; it is matched through the original
 * payment and counts with the opposite sign.
 */
async function settledAmount(
  client: TenantClient,
  tenantId: string,
  target: 'receivable' | 'payable',
  from: string,
  to: string,
  sellerId: string | null,
): Promise<number> {
  const positive = target === 'receivable' ? 'IN' : 'OUT';
  const join =
    target === 'receivable'
      ? `JOIN receivables t ON t.tenant_id = a.tenant_id AND t.id = a.receivable_id
         LEFT JOIN sales s ON s.tenant_id = t.tenant_id AND s.id = t.sale_id`
      : 'JOIN payables t ON t.tenant_id = a.tenant_id AND t.id = a.payable_id';
  const result = await client.query<{ total: string }>(
    `SELECT coalesce(sum(CASE WHEN p.direction = '${positive}' THEN p.amount ELSE -p.amount END), 0) AS total
       FROM payments p
       JOIN payment_allocations a
         ON a.tenant_id = p.tenant_id AND a.payment_id = coalesce(p.reversal_of_payment_id, p.id)
       ${join}
      WHERE p.tenant_id = $1 AND p.paid_at BETWEEN $2 AND $3
        ${sellerId && target === 'receivable' ? 'AND s.seller_id = $4' : ''}`,
    sellerId && target === 'receivable' ? [tenantId, from, to, sellerId] : [tenantId, from, to],
  );
  return Number(result.rows[0]?.total ?? 0);
}

async function openBalance(
  client: TenantClient,
  tenantId: string,
  table: 'receivables' | 'payables',
  sellerId: string | null,
): Promise<number> {
  const sellerJoin =
    sellerId && table === 'receivables'
      ? 'JOIN sales s ON s.tenant_id = t.tenant_id AND s.id = t.sale_id AND s.seller_id = $2'
      : '';
  const result = await client.query<{ total: string }>(
    `SELECT coalesce(sum(t.amount - t.paid_amount), 0) AS total
       FROM ${table} t ${sellerJoin}
      WHERE t.tenant_id = $1 AND t.status IN ('OPEN', 'PARTIALLY_PAID')`,
    sellerJoin ? [tenantId, sellerId] : [tenantId],
  );
  return Number(result.rows[0]?.total ?? 0);
}

async function computeWidgets(
  client: TenantClient,
  context: TenantContext,
  keys: string[],
): Promise<Array<{ key: string; title: string; kind: WidgetKind; data: unknown }>> {
  const scopes = viewerScopes(context);
  const periodResult = await client.query<Periods>(
    `SELECT to_char(date_trunc('month', CURRENT_DATE), 'YYYY-MM-DD') AS month_from,
            to_char(date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day', 'YYYY-MM-DD') AS month_to,
            to_char(date_trunc('month', CURRENT_DATE) - interval '5 months', 'YYYY-MM-DD') AS six_from,
            to_char(CURRENT_DATE - 29, 'YYYY-MM-DD') AS cash_from,
            to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today`,
  );
  const periods = periodResult.rows[0]!;
  const salesSeller = sellerOf(scopes.sales);

  let monthRows: SalesReportRow[] | null = null;
  let sixMonthRows: SalesReportRow[] | null = null;
  const salesRows = async (from: string): Promise<SalesReportRow[]> =>
    loadSalesReportRows(client, context.tenantId, {
      from,
      to: periods.month_to,
      sellerId: salesSeller,
      categoryId: null,
      statuses: [...EFFECTIVE_SALE_STATUSES],
    });
  const month = async () => (monthRows ??= await salesRows(periods.month_from));
  const sixMonths = async () => (sixMonthRows ??= await salesRows(periods.six_from));
  const received = () =>
    settledAmount(client, context.tenantId, 'receivable', periods.month_from, periods.month_to, salesSeller);
  const expenses = () =>
    settledAmount(client, context.tenantId, 'payable', periods.month_from, periods.month_to, null);

  const money = (value: number) => ({ value, format: 'money' as const });
  const loaders: Record<string, () => Promise<unknown>> = {
    sales_month: async () => ({ value: (await month()).length, format: 'count' }),
    sales_amount: async () => money(sumMoney(await month(), 'gross_amount')),
    received: async () => money(await received()),
    receivable: async () => money(await openBalance(client, context.tenantId, 'receivables', salesSeller)),
    expenses: async () => money(await expenses()),
    payable: async () => money(await openBalance(client, context.tenantId, 'payables', null)),
    result: async () => money(Math.round(((await received()) - (await expenses())) * 100) / 100),
    pending_commissions: async () => {
      const sellerId = sellerOf(scopes.commissions);
      const result = await client.query<{ amount: string; count: number; rule_count: number }>(
        `SELECT coalesce(sum(commission_amount) FILTER (WHERE status IN ('PENDING', 'APPROVED')), 0) AS amount,
                count(*) FILTER (WHERE status IN ('PENDING', 'APPROVED'))::int AS count,
                count(*) FILTER (WHERE status = 'PENDING_RULE')::int AS rule_count
           FROM seller_commissions
          WHERE tenant_id = $1 AND ($2::uuid IS NULL OR seller_id = $2)`,
        [context.tenantId, sellerId],
      );
      const row = result.rows[0]!;
      return { value: Number(row.amount), format: 'money', count: row.count, pending_rule_count: row.rule_count };
    },
    sales_by_category_chart: async () => ({ series: buildSalesCharts(await sixMonths()).by_category }),
    sales_evolution_chart: async () => ({ series: buildSalesCharts(await sixMonths()).by_month }),
    seller_ranking: async () => {
      const bySeller = new Map<string, SalesReportRow[]>();
      for (const row of await month()) {
        const name = row.seller_name ?? '—';
        bySeller.set(name, [...(bySeller.get(name) ?? []), row]);
      }
      return {
        rows: [...bySeller.entries()]
          .map(([seller_name, rows]) => ({
            seller_name,
            sales_count: rows.length,
            gross_amount: sumMoney(rows, 'gross_amount'),
            margin_amount: sumMoney(rows, 'margin_amount'),
          }))
          .sort((a, b) => b.gross_amount - a.gross_amount),
      };
    },
    cash_flow: async () => {
      const result = await client.query<{ day: string; inflow: string; outflow: string }>(
        `SELECT to_char(occurred_at, 'YYYY-MM-DD') AS day,
                coalesce(sum(amount) FILTER (WHERE type = 'IN'), 0) AS inflow,
                coalesce(sum(amount) FILTER (WHERE type = 'OUT'), 0) AS outflow
           FROM financial_transactions
          WHERE tenant_id = $1 AND occurred_at BETWEEN $2 AND $3
          GROUP BY occurred_at ORDER BY occurred_at`,
        [context.tenantId, periods.cash_from, periods.today],
      );
      return {
        series: result.rows.map((row) => ({
          day: row.day,
          inflow: Number(row.inflow),
          outflow: Number(row.outflow),
        })),
      };
    },
  };

  const widgets = [];
  for (const key of keys) {
    const definition = WIDGETS.find((w) => w.key === key)!;
    if (!visible(definition, scopes)) continue;
    widgets.push({ key, title: definition.title, kind: definition.kind, data: await loaders[key]!() });
  }
  return widgets;
}

function parseLayout(body: Record<string, unknown>): StoredWidget[] {
  const raw = body.widgets;
  if (!Array.isArray(raw)) throw new ValidationError('Field widgets must be an array');
  const layout = raw.map((item: unknown) => {
    const entry = item as { key?: unknown; enabled?: unknown };
    if (typeof entry?.key !== 'string' || !WIDGET_KEYS.has(entry.key) || typeof entry.enabled !== 'boolean') {
      throw new ValidationError('Each widget needs a known key and a boolean enabled');
    }
    return { key: entry.key, enabled: entry.enabled };
  });
  // Configuration only: every system widget must still be listed exactly once.
  const keys = new Set(layout.map((item) => item.key));
  if (keys.size !== layout.length || keys.size !== WIDGET_KEYS.size) {
    throw new ValidationError('Field widgets must list every widget exactly once');
  }
  return layout;
}

export function registerDashboardRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/dashboard', { preHandler: protectedHooks }, async () => {
    const context = getTenantContext();
    const widgets = await database.withTenantTransaction(async (client) => {
      const layout = await loadLayout(client, context.tenantId);
      return computeWidgets(
        client,
        context,
        layout.filter((item) => item.enabled).map((item) => item.key),
      );
    });
    return { widgets, can_configure: can(context, 'dashboard.configure') };
  });

  app.get('/dashboard/settings', { preHandler: protectedHooks }, async () => {
    const context = getTenantContext();
    requirePermission(context, 'dashboard.configure');
    const layout = await database.withTenantTransaction((client) => loadLayout(client, context.tenantId));
    return {
      widgets: layout.map((item) => {
        const definition = WIDGETS.find((w) => w.key === item.key)!;
        return { ...item, title: definition.title, kind: definition.kind };
      }),
    };
  });

  app.put('/dashboard/settings', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'dashboard.configure');
    const layout = parseLayout(parseObjectBody(request.body));
    await database.withTenantTransaction(async (client) => {
      await client.query(
        `INSERT INTO dashboard_settings (tenant_id, widgets, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, now())
         ON CONFLICT (tenant_id) DO UPDATE
           SET widgets = EXCLUDED.widgets, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [context.tenantId, JSON.stringify(layout), context.userId],
      );
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.DASHBOARD_CONFIGURED,
        entityType: 'dashboard',
        metadata: {
          enabled: layout.filter((item) => item.enabled).map((item) => item.key).join(','),
        },
      });
    });
    return { widgets: layout };
  });
}
