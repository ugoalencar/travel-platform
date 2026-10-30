/**
 * Report projections (Frente 9) -- Lite side of the contract validated in Full
 * (services/api/src/report-projections-service.ts). Every query is scoped by the
 * session's tenant inside withTenantTransaction (RLS on top); filters are
 * parameterised. The arithmetic is the shared pure module (report-projections.ts).
 */
import type { LiteDatabase } from './database';
import { ValidationError } from './errors';
import {
  projectReceivables,
  projectRevenue,
  supplierBalances,
  type ReceivableRow,
  type RevenueRow,
} from './report-projections';
import { getTenantContext } from './tenant-context';

export const PROJECTION_ROW_LIMIT = 5000;

export interface ProjectionFilters {
  saleFrom?: string;
  saleTo?: string;
  travelFrom?: string;
  travelTo?: string;
  origin?: string;
  destination?: string;
  categoryId?: string;
  supplierId?: string;
  productId?: string;
  status?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const SALE_STATUSES = ['DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];

const COMMON_FILTERS = ['saleFrom', 'saleTo', 'travelFrom', 'travelTo', 'origin', 'destination', 'categoryId', 'status', 'format'];
const ITEM_FILTERS = [...COMMON_FILTERS, 'supplierId', 'productId'];

/** `itemLevel` reports (agency revenue) also honour supplier/product; the others refuse them (never ignore silently). */
export function parseProjectionFilters(query: Record<string, unknown>, itemLevel = false): ProjectionFilters {
  const allowed = itemLevel ? ITEM_FILTERS : COMMON_FILTERS;
  for (const key of Object.keys(query)) if (!allowed.includes(key)) throw new ValidationError(`Unknown query parameter "${key}"`);
  const text = (name: string, max: number): string | undefined => {
    const value = query[name];
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || value.length > max) throw new ValidationError(`Query "${name}" is invalid`);
    return value;
  };
  const date = (name: string): string | undefined => {
    const value = text(name, 10);
    if (value !== undefined && !DATE.test(value)) throw new ValidationError(`Query "${name}" must be YYYY-MM-DD`);
    return value;
  };
  const id = (name: string): string | undefined => {
    const value = text(name, 36);
    if (value !== undefined && !UUID.test(value)) throw new ValidationError(`Query "${name}" is invalid`);
    return value;
  };
  const status = text('status', 20);
  if (status !== undefined && !SALE_STATUSES.includes(status)) throw new ValidationError('Query "status" is invalid');
  const filters: ProjectionFilters = {};
  const assign = <K extends keyof ProjectionFilters>(key: K, value: ProjectionFilters[K]) => {
    if (value !== undefined) filters[key] = value;
  };
  assign('saleFrom', date('saleFrom'));
  assign('saleTo', date('saleTo'));
  assign('travelFrom', date('travelFrom'));
  assign('travelTo', date('travelTo'));
  assign('origin', text('origin', 100));
  assign('destination', text('destination', 100));
  assign('categoryId', id('categoryId'));
  assign('supplierId', id('supplierId'));
  assign('productId', id('productId'));
  assign('status', status);
  return filters;
}

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (match) => `\\${match}`);

/** WHERE fragment on `sales s` (always tenant-scoped, always parameterised). */
function saleWhere(filters: ProjectionFilters, params: unknown[]): string {
  const conditions = [`s.tenant_id = $1`];
  const add = (sql: (placeholder: string) => string, value: unknown) => {
    params.push(value);
    conditions.push(sql(`$${params.length}`));
  };
  if (filters.saleFrom) add((p) => `s.sale_date >= ${p}::date`, filters.saleFrom);
  if (filters.saleTo) add((p) => `s.sale_date <= ${p}::date`, filters.saleTo);
  if (filters.travelFrom) add((p) => `s.travel_start_date >= ${p}::date`, filters.travelFrom);
  if (filters.travelTo) add((p) => `s.travel_start_date <= ${p}::date`, filters.travelTo);
  if (filters.origin) add((p) => `s.origin_text ILIKE ${p}`, `%${escapeLike(filters.origin)}%`);
  if (filters.destination) add((p) => `s.destination_text ILIKE ${p}`, `%${escapeLike(filters.destination)}%`);
  if (filters.categoryId) add((p) => `s.category_id = ${p}::uuid`, filters.categoryId);
  if (filters.status) add((p) => `s.status = ${p}`, filters.status);
  else conditions.push(`s.status <> 'CANCELLED'`);
  return conditions.join(' AND ');
}

export const todayCivil = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export async function getReceivablesProjection(database: LiteDatabase, filters: ProjectionFilters) {
  const { tenantId } = getTenantContext();
  const params: unknown[] = [tenantId];
  const where = saleWhere(filters, params);
  const rows = await database.withTenantTransaction(async (client) => {
    const result = await client.query<{ id: string; sale_id: string | null; due: string; amount: string; paid: string; status: string }>(
      `SELECT r.id, r.sale_id, to_char(r.due_at, 'YYYY-MM-DD') AS due, r.amount::text AS amount,
              r.paid_amount::text AS paid, r.status
         FROM receivables r JOIN sales s ON s.tenant_id = r.tenant_id AND s.id = r.sale_id
        WHERE ${where} AND r.tenant_id = $1
        ORDER BY r.due_at, r.id LIMIT ${PROJECTION_ROW_LIMIT + 1}`,
      params,
    );
    return result.rows;
  });
  if (rows.length > PROJECTION_ROW_LIMIT) throw new ValidationError('Too many rows for this report; narrow the filters');
  const data: ReceivableRow[] = rows.map((row) => ({
    id: row.id, saleId: row.sale_id, dueDate: row.due, amount: Number(row.amount), paid: Number(row.paid), status: row.status,
  }));
  return projectReceivables(data, todayCivil());
}

async function loadRevenueRows(database: LiteDatabase, filters: ProjectionFilters): Promise<RevenueRow[]> {
  const { tenantId } = getTenantContext();
  const params: unknown[] = [tenantId];
  const where = saleWhere(filters, params);
  const extra: string[] = [];
  if (filters.supplierId) {
    params.push(filters.supplierId);
    extra.push(`e.supplier_id = $${params.length}::uuid`);
  }
  if (filters.productId) {
    params.push(filters.productId);
    extra.push(`i.product_id = $${params.length}::uuid`);
  }
  const rows = await database.withTenantTransaction(async (client) => {
    const result = await client.query<{
      id: string; supplier_id: string | null; status: string; amount: string; received_amount: string | null;
      entitled_on: string | null; expected_on: string | null;
    }>(
      `SELECT e.id, e.supplier_id, e.status, e.amount::text AS amount, e.received_amount::text AS received_amount,
              to_char(e.entitled_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS entitled_on,
              CASE WHEN e.status = 'FORECAST' AND e.entitlement_event <> 'ON_SALE_CONFIRMATION' THEN
                (SELECT to_char(MAX(r.due_at), 'YYYY-MM-DD') FROM receivables r
                  WHERE r.tenant_id = e.tenant_id AND r.sale_id = e.sale_id AND r.status <> 'CANCELLED')
              END AS expected_on
         FROM agency_revenue_entries e
         JOIN sales s ON s.tenant_id = e.tenant_id AND s.id = e.sale_id
         JOIN sale_items i ON i.tenant_id = e.tenant_id AND i.id = e.sale_item_id
        WHERE ${where}${extra.length ? ` AND ${extra.join(' AND ')}` : ''} AND e.status <> 'CANCELLED'
        ORDER BY e.created_at, e.id LIMIT ${PROJECTION_ROW_LIMIT + 1}`,
      params,
    );
    return result.rows;
  });
  if (rows.length > PROJECTION_ROW_LIMIT) throw new ValidationError('Too many rows for this report; narrow the filters');
  return rows.map((row) => ({
    entryId: row.id,
    supplierId: row.supplier_id,
    status: row.status,
    amount: Number(row.amount),
    receivedAmount: row.received_amount === null ? null : Number(row.received_amount),
    entitledOn: row.entitled_on,
    expectedOn: row.expected_on,
  }));
}

export async function getRevenueForecast(database: LiteDatabase, filters: ProjectionFilters) {
  return projectRevenue(await loadRevenueRows(database, filters));
}

export async function getSupplierBalances(database: LiteDatabase, filters: ProjectionFilters) {
  return supplierBalances(await loadRevenueRows(database, filters));
}
