/**
 * Agency revenue persistence and lifecycle (ADR-007, Frente 6/7).
 *
 * Three distinct events: right (ENTITLED), availability (AVAILABLE, produced by
 * batches in a later wave) and settlement (RECEIVED). None implies the other.
 * The employee commission is a different obligation: it is neither read nor
 * changed here (D3); the link column on commission_entries is analysis only.
 */
import { ForbiddenError, getAgencyId, getTenantContext, getUserId, requireRole } from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import {
  calculateSaleRevenue,
  resolveRuleVersion,
  type BaseSelector,
  type CollectionModel,
  type RevenueMode,
  type RuleCandidate,
} from './agency-revenue-calc';
import { AuditEventType, recordAuditEvent } from './audit-log';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { assertNotRestricted } from './permission-restrictions';
import { resolveBalanceDeadlineDate } from './commission-supplier-policy';

export type EntitlementEvent = 'ON_SALE_CONFIRMATION' | 'ON_FULL_SETTLEMENT' | 'ON_BALANCE_DEADLINE';
export type EntryStatus = 'PENDING_RULE' | 'FORECAST' | 'ENTITLED' | 'AVAILABLE' | 'RECEIVED' | 'CANCELLED';

const MODES: readonly RevenueMode[] = ['PERCENTAGE', 'FIXED_PER_PASSENGER', 'FIXED_PER_SALE', 'FIXED_PER_ITEM', 'NONE'];
const BASES: readonly BaseSelector[] = ['LINE_TOTAL', 'NET_FARE', 'TAXES', 'FEES', 'TAXES_AND_FEES', 'MARGIN'];
const EVENTS: readonly EntitlementEvent[] = ['ON_SALE_CONFIRMATION', 'ON_FULL_SETTLEMENT', 'ON_BALANCE_DEADLINE'];
const MODELS: readonly CollectionModel[] = ['AGENCY_COLLECTS', 'SUPPLIER_COLLECTS'];

export interface RuleInput {
  supplierId: string | null;
  productId: string | null;
  categoryId: string | null;
  mode: RevenueMode;
  baseSelector: BaseSelector | null;
  value: number;
  entitlementEvent: EntitlementEvent;
  collectionModel: CollectionModel;
  effectiveFrom: string;
  reason: string;
  balanceDeadlineDays: number;
}

const optionalId = (value: unknown, name: string): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) throw new ValidationError(`Field "${name}" is invalid`);
  return value;
};

export function parseRuleInput(body: unknown): RuleInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Request body must be an object');
  const record = body as Record<string, unknown>;
  const allowed = ['supplierId', 'productId', 'categoryId', 'mode', 'baseSelector', 'value', 'entitlementEvent', 'collectionModel', 'effectiveFrom', 'reason', 'balanceDeadlineDays'];
  for (const key of Object.keys(record)) if (!allowed.includes(key)) throw new ValidationError(`Unknown field "${key}"`);
  const mode = record.mode as RevenueMode;
  if (!MODES.includes(mode)) throw new ValidationError('Field "mode" is invalid');
  const baseSelector = (record.baseSelector ?? null) as BaseSelector | null;
  if (mode === 'PERCENTAGE' ? !baseSelector || !BASES.includes(baseSelector) : baseSelector !== null) {
    throw new ValidationError('Field "baseSelector" is required for PERCENTAGE and forbidden otherwise');
  }
  const value = mode === 'NONE' ? 0 : Number(record.value);
  if (!Number.isFinite(value) || value < 0 || (mode === 'PERCENTAGE' && value > 100)) throw new ValidationError('Field "value" is invalid');
  const collectionModel = (record.collectionModel ?? 'AGENCY_COLLECTS') as CollectionModel;
  if (!MODELS.includes(collectionModel)) throw new ValidationError('Field "collectionModel" is invalid');
  const entitlementEvent = (record.entitlementEvent ?? (collectionModel === 'AGENCY_COLLECTS' ? 'ON_FULL_SETTLEMENT' : 'ON_SALE_CONFIRMATION')) as EntitlementEvent;
  if (!EVENTS.includes(entitlementEvent)) throw new ValidationError('Field "entitlementEvent" is invalid');
  if (collectionModel === 'SUPPLIER_COLLECTS' && entitlementEvent !== 'ON_SALE_CONFIRMATION') {
    throw new ValidationError('SUPPLIER_COLLECTS only supports ON_SALE_CONFIRMATION (the agency does not collect from the customer)');
  }
  if (baseSelector === 'MARGIN' && collectionModel !== 'AGENCY_COLLECTS') {
    throw new ValidationError('The MARGIN base requires AGENCY_COLLECTS');
  }
  const effectiveFrom = record.effectiveFrom === undefined ? todayCivil() : record.effectiveFrom;
  if (typeof effectiveFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw new ValidationError('Field "effectiveFrom" must be YYYY-MM-DD');
  if (effectiveFrom < todayCivil()) throw new ValidationError('Retroactive rules are not allowed');
  const reason = typeof record.reason === 'string' ? record.reason.trim() : '';
  if (reason.length < 1 || reason.length > 300) throw new ValidationError('Field "reason" is required (1 to 300 characters)');
  const balanceDeadlineDays = record.balanceDeadlineDays === undefined ? 0 : Number(record.balanceDeadlineDays);
  if (!Number.isInteger(balanceDeadlineDays) || balanceDeadlineDays < 0 || balanceDeadlineDays > 365) throw new ValidationError('Field "balanceDeadlineDays" must be an integer from 0 to 365');
  if (entitlementEvent !== 'ON_BALANCE_DEADLINE' && balanceDeadlineDays !== 0) throw new ValidationError('balanceDeadlineDays only applies to ON_BALANCE_DEADLINE');
  return {
    supplierId: optionalId(record.supplierId, 'supplierId'),
    productId: optionalId(record.productId, 'productId'),
    categoryId: optionalId(record.categoryId, 'categoryId'),
    mode,
    baseSelector,
    value,
    entitlementEvent,
    collectionModel,
    effectiveFrom,
    reason,
    balanceDeadlineDays,
  };
}

/** Civil date in the agency's reference zone (same convention as sale_date). */
function todayCivil(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export async function createRuleVersion(database: DatabaseRuntime, input: RuleInput) {
  requireRole(UserRole.ADMIN);
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    // Scopes/versions are append-only (no UPDATE grant), so serialise with an advisory lock instead of FOR UPDATE.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `agency-revenue-scope:${agencyId}:${input.supplierId ?? ''}:${input.productId ?? ''}:${input.categoryId ?? ''}`,
    ]);
    await client.query('SAVEPOINT revenue_scope');
    let scopeId: string;
    let revised = true;
    try {
      const scope = await client.query<{ id: string }>(
        `SELECT id FROM agency_revenue_scopes
          WHERE agency_id = $1 AND COALESCE(supplier_id, '') = $2 AND COALESCE(product_id, '') = $3 AND COALESCE(category_id, '') = $4`,
        [agencyId, input.supplierId ?? '', input.productId ?? '', input.categoryId ?? ''],
      );
      if (scope.rows[0]) {
        scopeId = scope.rows[0].id;
      } else {
        revised = false;
        const created = await client.query<{ id: string }>(
          `INSERT INTO agency_revenue_scopes (agency_id, supplier_id, product_id, category_id, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [agencyId, input.supplierId, input.productId, input.categoryId, getUserId()],
        );
        scopeId = created.rows[0]!.id;
      }
      await client.query('RELEASE SAVEPOINT revenue_scope');
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT revenue_scope');
      if ((error as { code?: string }).code === '23503') throw new NotFoundError('Supplier, product or category not found');
      throw error;
    }
    const next = await client.query<{ n: number }>(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS n FROM agency_revenue_rule_versions WHERE agency_id = $1 AND scope_id = $2`,
      [agencyId, scopeId],
    );
    const inserted = await client.query<{ id: string; version_number: number }>(
      `INSERT INTO agency_revenue_rule_versions
         (agency_id, scope_id, version_number, effective_from, mode, base_selector, value,
          entitlement_event, collection_model, reason, created_by_user_id, balance_deadline_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, version_number`,
      [agencyId, scopeId, next.rows[0]!.n, input.effectiveFrom, input.mode, input.baseSelector, input.value,
        input.entitlementEvent, input.collectionModel, input.reason, getUserId(), input.balanceDeadlineDays],
    );
    await recordAuditEvent(client, {
      eventType: revised ? AuditEventType.AGENCY_REVENUE_RULE_REVISED : AuditEventType.AGENCY_REVENUE_RULE_CREATED,
      entityType: 'agency_revenue_rule',
      entityId: inserted.rows[0]!.id,
      required: true,
      metadata: { fieldsChanged: [`${input.mode}:${input.value}`], reasonCode: input.reason.slice(0, 120) },
    });
    return { id: inserted.rows[0]!.id, scopeId, versionNumber: inserted.rows[0]!.version_number };
  });
}

export interface RuleVersionView {
  id: string;
  scope_id: string;
  supplier_id: string | null;
  product_id: string | null;
  category_id: string | null;
  version_number: number;
  effective_from: string;
  mode: RevenueMode;
  base_selector: BaseSelector | null;
  value: number;
  entitlement_event: EntitlementEvent;
  collection_model: CollectionModel;
  reason: string;
  created_at: Date;
  balance_deadline_days: number;
}

export async function listRuleVersions(database: DatabaseRuntime) {
  requireRole(UserRole.MANAGER);
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<RuleVersionView>(
      `SELECT v.id, v.scope_id, s.supplier_id, s.product_id, s.category_id, v.version_number,
              to_char(v.effective_from, 'YYYY-MM-DD') AS effective_from, v.mode, v.base_selector,
              v.value::float8 AS value, v.entitlement_event, v.collection_model, v.reason, v.created_at,
              v.balance_deadline_days
         FROM agency_revenue_rule_versions v JOIN agency_revenue_scopes s ON s.agency_id = v.agency_id AND s.id = v.scope_id
        WHERE v.agency_id = $1 ORDER BY s.id, v.version_number`,
      [getAgencyId()],
    );
    return result.rows;
  });
}

export async function listRevenueEntries(database: DatabaseRuntime, filters: {
  saleId?: string; status?: EntryStatus; supplierId?: string; categoryId?: string;
} = {}) {
  requireRole(UserRole.MANAGER);
  return database.withTenantTransaction(async (client) => {
    const result = await client.query(
      `SELECT e.id,e.sale_id,e.sale_item_id,e.supplier_id,si.product_id,s.category_id,e.status,
              e.entitlement_event,e.amount::float8 AS amount,e.base_amount::float8 AS base_amount,
              e.received_amount::float8 AS received_amount,e.memory,e.created_at
         FROM agency_revenue_entries e
         JOIN sales s ON s.agency_id=e.agency_id AND s.id=e.sale_id
         JOIN sale_items si ON si.agency_id=e.agency_id AND si.id=e.sale_item_id
        WHERE e.agency_id=$1 AND ($2::text IS NULL OR e.sale_id=$2)
          AND ($3::text IS NULL OR e.status=$3)
          AND ($4::text IS NULL OR e.supplier_id=$4)
          AND ($5::text IS NULL OR s.category_id=$5)
        ORDER BY e.created_at DESC,e.id LIMIT 500`,
      [getAgencyId(),filters.saleId ?? null,filters.status ?? null,filters.supplierId ?? null,filters.categoryId ?? null],
    );
    return result.rows;
  });
}

interface SaleRow {
  id: string;
  status: string;
  category_id: string | null;
  passenger_count: number | null;
  sale_date: string;
  settled_at: Date | null;
  travel_start_date?: string | null;
}

async function lockSale(client: TenantTransactionClient, saleId: string): Promise<SaleRow> {
  const sale = await client.query<SaleRow>(
    `SELECT id, status::text AS status, category_id, passenger_count, to_char(sale_date, 'YYYY-MM-DD') AS sale_date,
            settled_at, to_char(travel_start_date, 'YYYY-MM-DD') AS travel_start_date
       FROM sales WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
    [getAgencyId(), saleId],
  );
  if (!sale.rows[0]) throw new NotFoundError('Sale not found');
  return sale.rows[0];
}

interface EntryRow {
  id: string;
  sale_item_id: string;
  status: EntryStatus;
  entitlement_event: EntitlementEvent | null;
  amount: string;
}

export async function calculateRevenueForSale(database: DatabaseRuntime, saleId: string) {
  requireRole(UserRole.MANAGER);
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const sale = await lockSale(client, saleId);
    if (sale.status === 'CANCELLED') throw new ConflictError('Cannot calculate revenue for a cancelled sale');
    const items = await client.query<{
      id: string; product_id: string | null; supplier_id: string | null; qty: string; unit_price: string;
      discount: string; taxes: string; fees: string; line_margin: string; travelers: unknown; status: string;
    }>(
      `SELECT id, product_id, supplier_id, qty, unit_price, discount, taxes, fees, line_margin, travelers, status
         FROM sale_items WHERE agency_id = $1 AND sale_id = $2 ORDER BY created_at, id`,
      [agencyId, saleId],
    );
    const versions = await client.query<{
      id: string; version_number: number; effective_from: string; mode: RevenueMode; base_selector: BaseSelector | null;
      value: string; entitlement_event: EntitlementEvent; collection_model: CollectionModel;
      supplier_id: string | null; product_id: string | null; category_id: string | null;
      balance_deadline_days: number;
    }>(
      `SELECT v.id, v.version_number, to_char(v.effective_from, 'YYYY-MM-DD') AS effective_from, v.mode, v.base_selector,
              v.value, v.entitlement_event, v.collection_model, s.supplier_id, s.product_id, s.category_id,
              v.balance_deadline_days
         FROM agency_revenue_rule_versions v JOIN agency_revenue_scopes s ON s.agency_id = v.agency_id AND s.id = v.scope_id
        WHERE v.agency_id = $1`,
      [agencyId],
    );
    const candidates: RuleCandidate[] = versions.rows.map((row) => ({
      ruleVersionId: row.id,
      productId: row.product_id,
      supplierId: row.supplier_id,
      categoryId: row.category_id,
      versionNumber: row.version_number,
      effectiveFrom: row.effective_from,
      rule: { ruleVersionId: row.id, mode: row.mode, baseSelector: row.base_selector, value: Number(row.value), collectionModel: row.collection_model },
    }));
    const eventByVersion = new Map(versions.rows.map((row) => [row.id, row.entitlement_event]));
    const deadlineDaysByVersion = new Map(versions.rows.map((row) => [row.id, row.balance_deadline_days]));

    const active = items.rows.filter((item) => item.status === 'ACTIVE');
    const drafts = calculateSaleRevenue(
      active.map((item) => {
        const travelers = Array.isArray(item.travelers) ? item.travelers.length : 0;
        return {
          itemId: item.id,
          supplierId: item.supplier_id,
          qty: Number(item.qty),
          unitPrice: Number(item.unit_price),
          discount: Number(item.discount),
          taxes: Number(item.taxes),
          fees: Number(item.fees),
          lineMargin: Math.max(0, Number(item.line_margin)),
          passengerCount: travelers > 0 ? travelers : (sale.passenger_count ?? 1),
          rule: resolveRuleVersion(candidates, {
            productId: item.product_id,
            supplierId: item.supplier_id,
            categoryId: sale.category_id,
            onDate: sale.sale_date,
          })?.rule ?? null,
        };
      }),
    );

    const existing = await client.query<EntryRow>(
      `SELECT id, sale_item_id, status, entitlement_event, amount FROM agency_revenue_entries
        WHERE agency_id = $1 AND sale_id = $2 ORDER BY (status = 'CANCELLED') DESC, created_at, id FOR UPDATE`,
      [agencyId, saleId],
    );
    const byItem = new Map(existing.rows.map((row) => [row.sale_item_id, row]));
    const locked: string[] = [];
    for (const draft of drafts) {
      const current = byItem.get(draft.itemId);
      const event = draft.ruleVersionId ? (eventByVersion.get(draft.ruleVersionId) ?? null) : null;
      const travelStart = sale.travel_start_date ?? null;
      const deadlineDays = draft.ruleVersionId ? (deadlineDaysByVersion.get(draft.ruleVersionId) ?? 0) : 0;
      const expectedPaymentDate = event === 'ON_BALANCE_DEADLINE' && travelStart !== null
        ? resolveBalanceDeadlineDate(travelStart, deadlineDays)
        : null;
      if (current && !['FORECAST', 'PENDING_RULE'].includes(current.status)) {
        locked.push(draft.itemId);
        continue;
      }
      if (current) {
        await client.query(
          `UPDATE agency_revenue_entries
              SET supplier_id = $3, rule_version_id = $4, status = $5, entitlement_event = $6, amount = $7,
                  base_amount = $8, memory = $9::jsonb, expected_payment_date = $10::date, updated_at = now()
            WHERE agency_id = $1 AND id = $2`,
          [agencyId, current.id, draft.supplierId, draft.ruleVersionId, draft.status, event, draft.amount, draft.base, JSON.stringify({ ...draft.memory, balanceDeadlineDays: deadlineDays }), expectedPaymentDate],
        );
      } else {
        await client.query(
          `INSERT INTO agency_revenue_entries
             (agency_id, sale_id, sale_item_id, supplier_id, rule_version_id, status, entitlement_event, amount, base_amount, memory, created_by_user_id, expected_payment_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12::date)`,
          [agencyId, saleId, draft.itemId, draft.supplierId, draft.ruleVersionId, draft.status, event, draft.amount, draft.base, JSON.stringify({ ...draft.memory, balanceDeadlineDays: deadlineDays }), getUserId(), expectedPaymentDate],
        );
      }
    }
    // Items that were cancelled after being calculated no longer carry revenue (unless already received).
    const activeIds = new Set(active.map((item) => item.id));
    for (const row of existing.rows) {
      if (!activeIds.has(row.sale_item_id) && !['RECEIVED', 'CANCELLED'].includes(row.status)) {
        await setStatus(client, row.id, 'CANCELLED', AuditEventType.AGENCY_REVENUE_CANCELLED);
      }
    }
    await syncRevenueEntitlement(client, saleId);
    const total = drafts.reduce((sum, draft) => sum + Math.round(draft.amount * 100), 0) / 100;
    await recordAuditEvent(client, {
      eventType: AuditEventType.AGENCY_REVENUE_CALCULATED,
      entityType: 'sale',
      entityId: saleId,
      required: true,
      metadata: { amount: total, result: `${drafts.length} entries, ${locked.length} locked` },
    });
    return { locked, entries: await loadEntries(client, saleId) };
  });
}

async function setStatus(
  client: TenantTransactionClient,
  entryId: string,
  to: EntryStatus,
  event: AuditEventType,
  extra: { receivedAmount?: number; reference?: string | null } = {},
): Promise<void> {
  const sets =
    to === 'ENTITLED'
      ? ', entitled_at = now()'
      : to === 'FORECAST'
        ? ', entitled_at = NULL'
        : to === 'CANCELLED'
          ? ', cancelled_at = now()'
          : to === 'RECEIVED'
            ? ', received_at = now(), received_amount = $4, received_reference = $5'
            : '';
  const params: unknown[] = [getAgencyId(), entryId, to];
  if (to === 'RECEIVED') params.push(extra.receivedAmount ?? 0, extra.reference ?? null);
  await client.query(
    `UPDATE agency_revenue_entries SET status = $3, updated_at = now()${sets} WHERE agency_id = $1 AND id = $2`,
    params,
  );
  await recordAuditEvent(client, {
    eventType: event,
    entityType: 'agency_revenue_entry',
    entityId: entryId,
    required: true,
    metadata: { toStatus: to },
  });
}

/**
 * Moves FORECAST <-> ENTITLED from the sale state. Idempotent; called after
 * calculation, confirmation and every customer payment. Never produces
 * AVAILABLE or RECEIVED. ON_BALANCE_DEADLINE needs the settlement too (a late
 * balance does not entitle by itself -- decision Q6).
 */
/** Entries cannot exist before migration 106, so the sale hooks are a no-op on a schema without it. */
async function revenueSchemaPresent(client: TenantTransactionClient): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(`SELECT to_regclass('public.agency_revenue_entries') IS NOT NULL AS present`);
  return result.rows[0]?.present === true;
}

export async function syncRevenueEntitlement(client: TenantTransactionClient, saleId: string): Promise<void> {
  if (!(await revenueSchemaPresent(client))) return;
  const agencyId = getAgencyId();
  const sale = await client.query<{ status: string; settled_at: Date | null; travel_start_date: string | null }>(
    `SELECT status::text AS status, settled_at, to_char(travel_start_date,'YYYY-MM-DD') AS travel_start_date
       FROM sales WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
    [agencyId, saleId],
  );
  const row = sale.rows[0];
  if (!row || row.status === 'CANCELLED') return;
  const confirmed = row.status === 'CONFIRMED' || row.status === 'PAID';
  const settled = row.settled_at !== null || row.status === 'PAID';
  const entries = await client.query<EntryRow & { expected_payment_date: string | null; balance_deadline_days: number }>(
    `SELECT e.id, e.sale_item_id, e.status, e.entitlement_event, e.amount,
            e.expected_payment_date::text AS expected_payment_date, COALESCE(v.balance_deadline_days,0) AS balance_deadline_days
       FROM agency_revenue_entries e
       LEFT JOIN agency_revenue_rule_versions v ON v.agency_id=e.agency_id AND v.id=e.rule_version_id
      WHERE e.agency_id = $1 AND e.sale_id = $2 AND e.status IN ('FORECAST', 'ENTITLED', 'AVAILABLE', 'RECEIVED')
        AND e.sale_item_id IN (SELECT id FROM sale_items WHERE agency_id = $1 AND sale_id = $2 AND status = 'ACTIVE') FOR UPDATE OF e`,
    [agencyId, saleId],
  );
  for (const entry of entries.rows) {
    const deadline = sale.rows[0]!.travel_start_date
      ? resolveBalanceDeadlineDate(sale.rows[0]!.travel_start_date, entry.balance_deadline_days)
      : null;
    if (entry.entitlement_event === 'ON_BALANCE_DEADLINE' && deadline !== entry.expected_payment_date) {
      await client.query(`UPDATE agency_revenue_entries SET expected_payment_date=$3::date WHERE agency_id=$1 AND id=$2`, [agencyId,entry.id,deadline]);
    }
    const due = entry.entitlement_event === 'ON_SALE_CONFIRMATION'
      ? confirmed
      : entry.entitlement_event === 'ON_BALANCE_DEADLINE'
        ? confirmed && settled && deadline !== null && todayCivil() >= deadline
        : confirmed && settled;
    if (!due && ['AVAILABLE','RECEIVED'].includes(entry.status)) {
      throw new ConflictError('Revenue already batched or received; entitlement cannot be reversed');
    }
    if (due && entry.status === 'FORECAST') {
      await setStatus(client, entry.id, 'ENTITLED', AuditEventType.AGENCY_REVENUE_ENTITLED);
    } else if (!due && entry.status === 'ENTITLED') {
      await setStatus(client, entry.id, 'FORECAST', AuditEventType.AGENCY_REVENUE_ENTITLED);
    }
  }
}

/** D6: cancelling a sale whose revenue the supplier already paid is blocked (409); the rest is cancelled. */
export async function cancelRevenueForSale(client: TenantTransactionClient, saleId: string): Promise<void> {
  if (!(await revenueSchemaPresent(client))) return;
  const agencyId = getAgencyId();
  await lockSale(client, saleId);
  const entries = await client.query<EntryRow>(
    `SELECT id, sale_item_id, status, entitlement_event, amount FROM agency_revenue_entries
      WHERE agency_id = $1 AND sale_id = $2 AND status <> 'CANCELLED' FOR UPDATE`,
    [agencyId, saleId],
  );
  if (entries.rows.some((entry) => ['AVAILABLE','RECEIVED'].includes(entry.status))) {
    throw new ConflictError('Cannot cancel a sale whose agency revenue was already received from the supplier');
  }
  for (const entry of entries.rows.filter((row) => row.status !== 'CANCELLED')) {
    await setStatus(client, entry.id, 'CANCELLED', AuditEventType.AGENCY_REVENUE_CANCELLED);
  }
}


async function lockEntrySale(client: TenantTransactionClient, agencyId: string, entryId: string): Promise<string> {
  const result = await client.query<{ sale_id: string }>(
    `SELECT sale_id FROM agency_revenue_entries WHERE agency_id = $1 AND id = $2`, [agencyId, entryId]);
  const saleId = result.rows[0]?.sale_id;
  if (!saleId) throw new NotFoundError('Revenue entry not found');
  await lockSale(client, saleId);
  return saleId;
}

/** Item cancellation and the revenue transition belong to the caller's transaction. */
export async function cancelRevenueForItem(client: TenantTransactionClient, saleId: string, itemId: string): Promise<void> {
  if (!(await revenueSchemaPresent(client))) return;
  const agencyId = getAgencyId();
  await lockSale(client, saleId);
  const result = await client.query<EntryRow>(
    `SELECT id, sale_item_id, status, entitlement_event, amount FROM agency_revenue_entries
      WHERE agency_id = $1 AND sale_id = $2 AND sale_item_id = $3 AND status <> 'CANCELLED' FOR UPDATE`,
    [agencyId, saleId, itemId]);
  if (result.rows.some((entry) => ['AVAILABLE','RECEIVED'].includes(entry.status))) {
    throw new ConflictError('Cannot cancel an item whose agency revenue was already received');
  }
  for (const entry of result.rows) {
    await setStatus(client, entry.id, 'CANCELLED', AuditEventType.AGENCY_REVENUE_CANCELLED);
  }
}

export async function reactivateRevenueEntry(database: DatabaseRuntime, entryId: string, reason: string) {
  requireRole(UserRole.ADMIN);
  const agencyId = getAgencyId();
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 128) throw new ValidationError('A reason of 1 to 128 characters is required');
  return database.withTenantTransaction(async (client) => {
    const saleId = await lockEntrySale(client, agencyId, entryId);
    const eligible = await client.query<EntryRow>(
      `SELECT e.id, e.sale_item_id, e.status, e.entitlement_event, e.amount FROM agency_revenue_entries e
       JOIN sale_items i ON i.agency_id=e.agency_id AND i.id=e.sale_item_id AND i.sale_id=e.sale_id
       JOIN sales s ON s.agency_id=e.agency_id AND s.id=e.sale_id
       WHERE e.agency_id=$1 AND e.id=$2 AND i.status='ACTIVE' AND s.status <> 'CANCELLED' FOR UPDATE OF e`,
      [agencyId, entryId]);
    const row = eligible.rows[0];
    if (!row || row.status !== 'CANCELLED') throw new ConflictError('Only cancelled revenue of an active item and sale can be reactivated');
    const live = await client.query(`SELECT 1 FROM agency_revenue_entries
      WHERE agency_id=$1 AND sale_item_id=$2 AND status <> 'CANCELLED'`, [agencyId, row.sale_item_id]);
    if (live.rowCount) throw new ConflictError('The item already has live revenue');
    await client.query(`UPDATE agency_revenue_entries SET
      status=CASE WHEN rule_version_id IS NULL OR memory ? 'reason' THEN 'PENDING_RULE' ELSE 'FORECAST' END,
      cancelled_at=NULL, entitled_at=NULL, updated_at=now() WHERE agency_id=$1 AND id=$2`, [agencyId, entryId]);
    await recordAuditEvent(client, {
      eventType: AuditEventType.AGENCY_REVENUE_REACTIVATED, entityType: 'agency_revenue_entry', entityId: entryId,
      required: true,
      metadata: { reasonCode: reason.trim() },
    });
    await syncRevenueEntitlement(client, saleId);
    return { id: entryId };
  });
}

export async function receiveRevenueEntry(
  database: DatabaseRuntime,
  entryId: string,
  input: { amount: number; reference: string | null },
) {
  requireRole(UserRole.ADMIN);
  if (!Number.isFinite(input.amount) || input.amount < 0) throw new ValidationError('Field "amount" is invalid');
  return database.withTenantTransaction(async (client) => {
    const agencyId = getAgencyId();
    await lockEntrySale(client, agencyId, entryId);
    const entry = await client.query<EntryRow>(
      `SELECT id, sale_item_id, status, entitlement_event, amount FROM agency_revenue_entries
        WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
      [getAgencyId(), entryId],
    );
    const row = entry.rows[0];
    if (!row) throw new NotFoundError('Revenue entry not found');
    if (row.status !== 'ENTITLED' && row.status !== 'AVAILABLE') {
      throw new ConflictError(`Cannot receive a ${row.status} entry (the right must exist first)`);
    }
    const batchPolicy = await client.query<{settlement_mode:string}>(
      'SELECT settlement_mode FROM agency_revenue_settlement_settings WHERE agency_id=$1',[agencyId]);
    if (row.status === 'AVAILABLE' || batchPolicy.rows[0]?.settlement_mode === 'BATCH_WINDOW') {
      throw new ConflictError('Register the receipt through its revenue batch');
    }
    await setStatus(client, row.id, 'RECEIVED', AuditEventType.AGENCY_REVENUE_RECEIVED, {
      receivedAmount: input.amount,
      reference: input.reference,
    });
    return { id: row.id, expected: Number(row.amount), received: input.amount, difference: Math.round((Number(row.amount) - input.amount) * 100) / 100 };
  });
}

export async function cancelRevenueEntry(database: DatabaseRuntime, entryId: string) {
  requireRole(UserRole.ADMIN);
  return database.withTenantTransaction(async (client) => {
    const agencyId = getAgencyId();
    await lockEntrySale(client, agencyId, entryId);
    const entry = await client.query<EntryRow>(
      `SELECT id, sale_item_id, status, entitlement_event, amount FROM agency_revenue_entries
        WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
      [getAgencyId(), entryId],
    );
    const row = entry.rows[0];
    if (!row) throw new NotFoundError('Revenue entry not found');
    if (['AVAILABLE','RECEIVED'].includes(row.status)) throw new ConflictError('Batched or received revenue cannot be cancelled');
    if (row.status === 'CANCELLED') return { id: row.id, status: 'CANCELLED' as const };
    await setStatus(client, row.id, 'CANCELLED', AuditEventType.AGENCY_REVENUE_CANCELLED);
    return { id: row.id, status: 'CANCELLED' as const };
  });
}

interface EntryView {
  id: string;
  sale_item_id: string;
  supplier_id: string | null;
  rule_version_id: string | null;
  status: EntryStatus;
  entitlement_event: EntitlementEvent | null;
  amount: number;
  base_amount: number;
  calc_version: number;
  memory: Record<string, unknown>;
  entitled_at: Date | null;
  received_at: Date | null;
  received_amount: number | null;
}

async function loadEntries(client: TenantTransactionClient, saleId: string) {
  const result = await client.query<EntryView>(
    `SELECT id, sale_item_id, supplier_id, rule_version_id, status, entitlement_event, amount::float8 AS amount,
            base_amount::float8 AS base_amount, calc_version, memory, entitled_at, received_at, received_amount::float8 AS received_amount
       FROM agency_revenue_entries WHERE agency_id = $1 AND sale_id = $2 ORDER BY created_at, id`,
    [getAgencyId(), saleId],
  );
  return result.rows;
}

/** Read model: revenue entries plus an analysis-only comparison with the employee commission (no netting). */
export async function getSaleRevenue(database: DatabaseRuntime, saleId: string) {
  requireRole(UserRole.MANAGER);
  return database.withTenantTransaction(async (client) => {
    const sale = await client.query(`SELECT 1 FROM sales WHERE agency_id = $1 AND id = $2`, [getAgencyId(), saleId]);
    if (sale.rowCount === 0) throw new NotFoundError('Sale not found');
    const entries = await loadEntries(client, saleId);
    let canViewCommission = true;
    try {
      await assertNotRestricted(client, getTenantContext().userRole, 'employees', 'view');
    } catch (error) {
      if (!(error instanceof ForbiddenError)) throw error;
      canViewCommission = false;
    }
    let employeeCommission: number | undefined;
    if (canViewCommission) {
      const commission = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM commission_entries
          WHERE agency_id = $1 AND sale_id = $2 AND status <> 'CANCELLED'`,
        [getAgencyId(), saleId],
      );
      employeeCommission = Math.round(Number(commission.rows[0]?.total ?? 0) * 100) / 100;
    }
    const sum = (statuses: string[], field: 'amount' | 'received_amount' = 'amount') =>
      Math.round(entries.filter((entry) => statuses.includes(entry.status as string)).reduce((total, entry) => total + Math.round(Number(entry[field] ?? 0) * 100), 0)) / 100;
    const projected = sum(['FORECAST', 'ENTITLED', 'AVAILABLE', 'RECEIVED']);
    const expectedReceived = sum(['RECEIVED']);
    const actualReceived = sum(['RECEIVED'], 'received_amount');
    return {
      entries,
      totals: {
        forecast: sum(['FORECAST']),
        entitled: sum(['ENTITLED', 'AVAILABLE']),
        expected: expectedReceived,
        received: actualReceived,
        difference: Math.round((expectedReceived - actualReceived) * 100) / 100,
        pendingRule: entries.filter((entry) => entry.status === 'PENDING_RULE').length,
      },
      // Analysis only (D3): two independent obligations, never netted or linked by payment.
      analysis: {
        agencyRevenue: projected,
        // Omitir tambem a diferenca: ela permitiria deduzir a comissao restrita.
        ...(employeeCommission === undefined ? {} : {
          employeeCommission,
          difference: Math.round((projected - employeeCommission) * 100) / 100,
        }),
      },
    };
  });
}
