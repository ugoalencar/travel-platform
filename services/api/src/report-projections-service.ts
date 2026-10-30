/**
 * Report projections over the agency's own data (Frente 9). Every query is
 * scoped by the session's agency inside withTenantTransaction (RLS on top);
 * filters are parameterised. The arithmetic lives in report-projections.ts.
 */
import { getAgencyId, getTenantContext, requireRole } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { requireRoleOrAreaGrant } from './area-grants';
import { computeEntryRelease } from './commission-release-service';
import { assertNotRestricted } from './permission-restrictions';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';
import {
  projectCommissions,
  projectReceivables,
  projectRevenue,
  supplierBalances,
  type CommissionRow,
  type ReceivableRow,
  type RevenueRow,
  type SupplierBalanceSupplement,
} from './report-projections';

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
  employeeId?: string;
  productId?: string;
  status?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SALE_STATUSES = ['PENDING', 'CONFIRMED', 'PAID', 'CANCELLED'];

const COMMON_FILTERS = ['saleFrom', 'saleTo', 'travelFrom', 'travelTo', 'origin', 'destination', 'categoryId', 'status', 'format', 'supplierId', 'productId', 'employeeId'];
const ITEM_FILTERS = [...COMMON_FILTERS, 'supplierId', 'productId'];

/** All reports use the same filters; the optional legacy flag is retained for callers. */
export function parseProjectionFilters(query: Record<string, unknown>, _itemLevel = false): ProjectionFilters {
  const allowed = ITEM_FILTERS;
  for (const key of Object.keys(query)) if (!allowed.includes(key)) throw new ValidationError(`Unknown query parameter "${key}"`);
  const text = (name: string, max: number): string | undefined => {
    const value = query[name];
    if (value === undefined || value === '') return undefined;
    if (typeof value !== 'string' || value.length > max) throw new ValidationError(`Query "${name}" is invalid`);
    return value;
  };
  const date = (name: string): string | undefined => {
    const value = text(name, 10);
    if (value !== undefined && (!DATE.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value)) throw new ValidationError(`Query "${name}" must be YYYY-MM-DD`);
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
  assign('categoryId', text('categoryId', 64));
  assign('supplierId', text('supplierId', 64));
  assign('employeeId', text('employeeId', 64));
  assign('productId', text('productId', 64));
  assign('status', status);
  if ((filters.saleFrom && filters.saleTo && filters.saleFrom>filters.saleTo) ||
      (filters.travelFrom && filters.travelTo && filters.travelFrom>filters.travelTo)) throw new ValidationError('Invalid date range');
  return filters;
}

/** Sale and item selectors use EXISTS to avoid multiplying obligations. */
function saleWhere(filters: ProjectionFilters, params: unknown[]): string {
  const conditions=['s.agency_id = $1'];
  const add=(sql:(p:string)=>string,value:unknown)=>{params.push(value);conditions.push(sql('$'+params.length));};
  if(filters.saleFrom) add(p=>`s.sale_date>=${p}::date`,filters.saleFrom);
  if(filters.saleTo) add(p=>`s.sale_date<=${p}::date`,filters.saleTo);
  if(filters.travelFrom) add(p=>`s.travel_start_date>=${p}::date`,filters.travelFrom);
  if(filters.travelTo) add(p=>`s.travel_start_date<=${p}::date`,filters.travelTo);
  if(filters.origin) add(p=>`s.origin_text ILIKE ${p}`, '%'+escapeLike(filters.origin)+'%');
  if(filters.destination) add(p=>`s.destination_text ILIKE ${p}`, '%'+escapeLike(filters.destination)+'%');
  if(filters.categoryId) add(p=>`s.category_id=${p}`,filters.categoryId);
  if(filters.supplierId||filters.productId) {
    const item=["fi.agency_id=s.agency_id","fi.sale_id=s.id","fi.status='ACTIVE'"];
    if(filters.supplierId) {params.push(filters.supplierId);item.push('fi.supplier_id=$'+params.length);}
    if(filters.productId) {params.push(filters.productId);item.push('fi.product_id=$'+params.length);}
    conditions.push('EXISTS (SELECT 1 FROM sale_items fi WHERE '+item.join(' AND ')+')');
  }
  if(filters.employeeId) add(p=>`EXISTS (SELECT 1 FROM commission_entries fc WHERE fc.agency_id=s.agency_id AND fc.sale_id=s.id AND fc.employee_id=${p} AND fc.status<>'CANCELLED')`,filters.employeeId);
  if(filters.status) add(p=>`s.status::text=${p}`,filters.status);
  else conditions.push("s.status::text <> 'CANCELLED'");
  return conditions.join(' AND ');
}

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (match) => `\\${match}`);

export const todayCivil = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

async function guardEmployeeFilter(database:DatabaseRuntime,filters:ProjectionFilters) {
  if(filters.employeeId) await database.withTenantTransaction(client=>assertNotRestricted(client,getTenantContext().userRole,'employees','view'));
}

export async function getReceivablesProjection(database: DatabaseRuntime, filters: ProjectionFilters) {
  // Same guard as the source receivables endpoint (role floor / area grant, minus restrictions and REVOKE).
  await requireRoleOrAreaGrant(database, UserRole.MANAGER, 'FINANCIAL_RECEIVABLES');
  await guardEmployeeFilter(database,filters);
  const params: unknown[] = [getAgencyId()];
  const where = saleWhere(filters, params);
  const rows = await database.withTenantTransaction(async (client) => {
    const result = await client.query<{ id: string; sale_id: string | null; due: string; amount: string; paid: string; status: string }>(
      `SELECT r.id, r.sale_id,
              COALESCE(r.due_date::text, to_char(r.due_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')) AS due,
              r.amount::text AS amount, COALESCE(SUM(pa.amount) FILTER (WHERE p.direction='IN' AND NOT EXISTS (
                SELECT 1 FROM sale_payment_reversals spr WHERE spr.agency_id=p.agency_id AND spr.original_payment_id=p.id)), 0)::text AS paid, r.status::text AS status
         FROM receivables r
         JOIN sales s ON s.agency_id = r.agency_id AND s.id = r.sale_id
         LEFT JOIN payment_allocations pa ON pa.agency_id = r.agency_id AND pa.receivable_id = r.id
         LEFT JOIN payments p ON p.agency_id=pa.agency_id AND p.id=pa.payment_id
        WHERE ${where} AND r.agency_id = $1
        GROUP BY r.id
        ORDER BY due, r.id
        LIMIT ${PROJECTION_ROW_LIMIT + 1}`,
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

async function loadRevenueRows(database: DatabaseRuntime, filters: ProjectionFilters): Promise<RevenueRow[]> {
  await guardEmployeeFilter(database,filters);
  const params: unknown[] = [getAgencyId()];
  const where = saleWhere(filters, params);
  const extra: string[] = [];
  if (filters.supplierId) {
    params.push(filters.supplierId);
    extra.push(`e.supplier_id = $${params.length}`);
  }
  if (filters.productId) {
    params.push(filters.productId);
    extra.push(`i.product_id = $${params.length}`);
  }
  const rows = await database.withTenantTransaction(async (client) => {
    const result = await client.query<{
      id: string; supplier_id: string | null; status: string; amount: string; received_amount: string | null;
      entitled_on: string | null; expected_on: string | null;
    }>(
      `SELECT e.id, e.supplier_id, e.status, e.amount::text AS amount, e.received_amount::text AS received_amount,
              to_char(e.entitled_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS entitled_on,
              COALESCE(e.expected_payment_date::text, CASE WHEN e.status = 'FORECAST' AND e.entitlement_event <> 'ON_SALE_CONFIRMATION' THEN
                (SELECT MAX(COALESCE(r.due_date::text, to_char(r.due_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')))
                   FROM receivables r WHERE r.agency_id = e.agency_id AND r.sale_id = e.sale_id AND r.status::text <> 'CANCELLED')
              END) AS expected_on
         FROM agency_revenue_entries e
         JOIN sales s ON s.agency_id = e.agency_id AND s.id = e.sale_id
         JOIN sale_items i ON i.agency_id = e.agency_id AND i.id = e.sale_item_id
        WHERE ${where}${extra.length ? ` AND ${extra.join(' AND ')}` : ''} AND e.status <> 'CANCELLED'
        ORDER BY e.created_at, e.id
        LIMIT ${PROJECTION_ROW_LIMIT + 1}`,
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

export async function getRevenueForecast(database: DatabaseRuntime, filters: ProjectionFilters) {
  requireRole(UserRole.MANAGER);
  const rows=await loadRevenueRows(database, filters);
  const sum=(statuses:string[],received=false)=>Math.round(rows.filter(r=>statuses.includes(r.status)).reduce((total,r)=>total+Math.round((received?(r.receivedAmount??0):r.amount)*100),0))/100;
  return {...projectRevenue(rows),totals:{forecast:sum(['FORECAST','ENTITLED','AVAILABLE','RECEIVED']),released:sum(['ENTITLED','AVAILABLE','RECEIVED']),paid:sum(['RECEIVED'],true)},entries:rows};
}

export async function getSupplierBalances(database: DatabaseRuntime, filters: ProjectionFilters) {
  requireRole(UserRole.MANAGER);
  const [revenueRows, supplements] = await Promise.all([
    loadRevenueRows(database, filters),
    loadSupplierBalanceSupplements(database, filters),
  ]);
  return supplierBalances(revenueRows, supplements);
}

async function loadSupplierBalanceSupplements(database: DatabaseRuntime, filters: ProjectionFilters): Promise<SupplierBalanceSupplement[]> {
  await guardEmployeeFilter(database, filters);
  const buildFilter = () => {
    const params: unknown[] = [getAgencyId()];
    return { params, where: saleWhere(filters, params) };
  };
  const volumeFilter = buildFilter();
  const volumeItemFilters: string[] = ["i.status='ACTIVE'", 'i.supplier_id IS NOT NULL'];
  if (filters.supplierId) { volumeFilter.params.push(filters.supplierId); volumeItemFilters.push(`i.supplier_id=$${volumeFilter.params.length}`); }
  if (filters.productId) { volumeFilter.params.push(filters.productId); volumeItemFilters.push(`i.product_id=$${volumeFilter.params.length}`); }
  const paidFilter = buildFilter();
  const paidItemFilters: string[] = ["ce.status<>'CANCELLED'", 'ce.supplier_id IS NOT NULL'];
  if (filters.supplierId) { paidFilter.params.push(filters.supplierId); paidItemFilters.push(`ce.supplier_id=$${paidFilter.params.length}`); }
  if (filters.productId) {
    paidFilter.params.push(filters.productId);
    paidItemFilters.push(`EXISTS (SELECT 1 FROM sale_items i WHERE i.agency_id=ce.agency_id AND i.sale_id=ce.sale_id AND i.supplier_id=ce.supplier_id AND i.product_id=$${paidFilter.params.length} AND i.status='ACTIVE')`);
  }
  if (filters.employeeId) { paidFilter.params.push(filters.employeeId); paidItemFilters.push(`ce.employee_id=$${paidFilter.params.length}`); }
  return database.withTenantTransaction(async client => {
    const [volume, paid] = await Promise.all([
      client.query<{ supplier_id: string; amount: string }>(
        `SELECT i.supplier_id,COALESCE(SUM(i.line_total),0)::text AS amount
           FROM sale_items i JOIN sales s ON s.agency_id=i.agency_id AND s.id=i.sale_id
          WHERE ${volumeFilter.where} AND ${volumeItemFilters.join(' AND ')}
          GROUP BY i.supplier_id`, volumeFilter.params),
      client.query<{ supplier_id: string; amount: string }>(
        `SELECT ce.supplier_id,COALESCE(SUM(pa.amount),0)::text AS amount
           FROM commission_entries ce
           JOIN sales s ON s.agency_id=ce.agency_id AND s.id=ce.sale_id
           JOIN payables p ON p.agency_id=ce.agency_id AND p.commission_entry_id=ce.id AND p.status<>'CANCELLED'
           JOIN payment_allocations pa ON pa.agency_id=p.agency_id AND pa.payable_id=p.id
          WHERE ${paidFilter.where} AND ${paidItemFilters.join(' AND ')}
          GROUP BY ce.supplier_id`, paidFilter.params),
    ]);
    const totals = new Map<string, SupplierBalanceSupplement>();
    for (const row of volume.rows) totals.set(row.supplier_id, { supplierId: row.supplier_id, volumeSold: Number(row.amount), employeeCommissionsPaid: 0 });
    for (const row of paid.rows) {
      const current = totals.get(row.supplier_id) ?? { supplierId: row.supplier_id, volumeSold: 0, employeeCommissionsPaid: 0 };
      current.employeeCommissionsPaid = Number(row.amount);
      totals.set(row.supplier_id, current);
    }
    return [...totals.values()];
  });
}

/** Employee commission: forecast x released by customer receipts x paid (the revenue is never mixed in). */
/** One lookup per entry (the release state is computed per entry), so this report has a lower ceiling. */
export const COMMISSION_PROJECTION_LIMIT = 1000;

export async function getCommissionsProjection(database: DatabaseRuntime, filters: ProjectionFilters) {
  requireRole(UserRole.MANAGER);
  const restrictionContext = getTenantContext();
  // Same restriction as the source employee-commission report.
  await database.withTenantTransaction((client) =>
    assertNotRestricted(client, restrictionContext.userRole, 'employees', 'view'),
  );
  const params: unknown[] = [getAgencyId()];
  let where = saleWhere(filters, params);
  if(filters.employeeId) {params.push(filters.employeeId);where+=' AND ce.employee_id=$'+params.length;}
  return database.withTenantTransaction(async (client) => {
    const entries = await client.query<{ id: string; amount: string; status: string }>(
      `SELECT ce.id, ce.amount::text AS amount, ce.status
         FROM commission_entries ce JOIN sales s ON s.agency_id = ce.agency_id AND s.id = ce.sale_id
        WHERE ${where} AND ce.agency_id = $1
        ORDER BY ce.created_at, ce.id LIMIT ${COMMISSION_PROJECTION_LIMIT + 1}`,
      params,
    );
    if (entries.rows.length > COMMISSION_PROJECTION_LIMIT) throw new ValidationError('Too many rows for this report; narrow the filters');
    const rows: CommissionRow[] = [];
    for (const entry of entries.rows) {
      const release = await computeEntryRelease(client, getAgencyId(), entry.id);
      rows.push({ entryId: entry.id, amount: Number(entry.amount), released: release.released, paid: release.paid, status: entry.status, expectedPayDate: release.expectedPayDate });
    }
    return projectCommissions(rows);
  });
}
