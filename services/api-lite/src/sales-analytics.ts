/**
 * Per-sale analytics shared by the reports and the dashboard: one query
 * (loadSalesReportRows) feeds tables, per-seller totals and chart series,
 * so a chart can never disagree with the table next to it.
 */
import type { TenantClient } from './database';
import { optionalDate, optionalEnum, optionalUuid } from './validation';

export const SALE_STATUSES = ['DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;
const REPORT_LIMIT = 50_000;

export interface PeriodFilters {
  from: string | null;
  to: string | null;
}

export function parsePeriod(query: Record<string, string | undefined>): PeriodFilters {
  return {
    from: optionalDate({ from: query.from ?? null }, 'from'),
    to: optionalDate({ to: query.to ?? null }, 'to'),
  };
}

export const EFFECTIVE_SALE_STATUSES = ['CONFIRMED', 'PARTIALLY_PAID', 'PAID'] as const;

export type SaleStatus = (typeof SALE_STATUSES)[number];

export interface SalesReportFilters extends PeriodFilters {
  sellerId: string | null;
  categoryId: string | null;
  statuses: SaleStatus[] | null;
}

/** `status` accepts one value or a comma-separated list (e.g. CONFIRMED,PAID). */
export function parseSalesReportFilters(
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

export interface SalesReportRow {
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
export async function loadSalesReportRows(
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

export type MoneyField = {
  [K in keyof SalesReportRow]: SalesReportRow[K] extends number ? K : never;
}[keyof SalesReportRow];

/** Sums in cents so report totals never drift by floating-point error. */
export function sumMoney(rows: SalesReportRow[], field: MoneyField): number {
  return rows.reduce((cents, row) => cents + Math.round(row[field] * 100), 0) / 100;
}

export interface MonthPoint {
  month: string;
  sales_count: number;
  gross_amount: number;
  cost_amount: number;
  margin_amount: number;
  received_amount: number;
  pending_amount: number;
  commission_amount: number;
  commission_paid_amount: number;
}

export interface CategoryPoint {
  category_name: string;
  sales_count: number;
  gross_amount: number;
  margin_amount: number;
}

/** Chart series grouped from the same rows as the tabular totals. */
export function buildSalesCharts(rows: SalesReportRow[]): {
  by_month: MonthPoint[];
  by_category: CategoryPoint[];
} {
  const months = new Map<string, SalesReportRow[]>();
  const categories = new Map<string, SalesReportRow[]>();
  for (const row of rows) {
    const month = row.sale_date.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), row]);
    const category = row.category_name ?? '—';
    categories.set(category, [...(categories.get(category) ?? []), row]);
  }
  return {
    by_month: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, group]) => ({
        month,
        sales_count: group.length,
        gross_amount: sumMoney(group, 'gross_amount'),
        cost_amount: sumMoney(group, 'cost_amount'),
        margin_amount: sumMoney(group, 'margin_amount'),
        received_amount: sumMoney(group, 'received_amount'),
        pending_amount: sumMoney(group, 'pending_amount'),
        commission_amount: sumMoney(group, 'commission_amount'),
        commission_paid_amount: sumMoney(group, 'commission_paid_amount'),
      })),
    by_category: [...categories.entries()]
      .map(([category_name, group]) => ({
        category_name,
        sales_count: group.length,
        gross_amount: sumMoney(group, 'gross_amount'),
        margin_amount: sumMoney(group, 'margin_amount'),
      }))
      .sort((a, b) => b.gross_amount - a.gross_amount),
  };
}
