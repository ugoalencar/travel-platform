/**
 * Agency revenue persistence and lifecycle (ADR-007) -- Lite side of the
 * contract validated in Full (services/api/src/agency-revenue.ts).
 *
 * Three distinct events: right (ENTITLED), availability (AVAILABLE, produced by
 * batches in a later wave) and settlement (RECEIVED). The seller commission is
 * a different obligation and is neither read nor changed here (D3). The MARGIN
 * base does not exist in Lite (sale_items keep no cost) and is refused.
 */
import {
  calculateSaleRevenue,
  resolveRuleVersion,
  type BaseSelector,
  type CollectionModel,
  type RevenueMode,
  type RuleCandidate,
} from './agency-revenue-calc';
import { AUDIT_EVENTS, recordAuditEvent } from './audit-log';
import type { LiteDatabase, TenantClient } from './database';
import { can, requireAdministrator } from './access';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { getTenantContext } from './tenant-context';

export type EntitlementEvent = 'ON_SALE_CONFIRMATION' | 'ON_FULL_SETTLEMENT' | 'ON_BALANCE_DEADLINE';
export type EntryStatus = 'PENDING_RULE' | 'FORECAST' | 'ENTITLED' | 'AVAILABLE' | 'RECEIVED' | 'CANCELLED';

const MODES: readonly RevenueMode[] = ['PERCENTAGE', 'FIXED_PER_PASSENGER', 'FIXED_PER_SALE', 'FIXED_PER_ITEM', 'NONE'];
const BASES: readonly BaseSelector[] = ['LINE_TOTAL', 'NET_FARE', 'TAXES', 'FEES', 'TAXES_AND_FEES'];
const EVENTS: readonly EntitlementEvent[] = ['ON_SALE_CONFIRMATION', 'ON_FULL_SETTLEMENT', 'ON_BALANCE_DEADLINE'];
const MODELS: readonly CollectionModel[] = ['AGENCY_COLLECTS', 'SUPPLIER_COLLECTS'];
const CONFIRMED = ['CONFIRMED', 'PARTIALLY_PAID', 'PAID'];

export interface RuleInput {
  supplier_id: string | null;
  product_id: string | null;
  category_id: string | null;
  mode: RevenueMode;
  base_selector: BaseSelector | null;
  value: number;
  entitlement_event: EntitlementEvent;
  collection_model: CollectionModel;
  effective_from: string;
  reason: string;
}

const optionalId = (value: unknown, name: string): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) throw new ValidationError(`Field "${name}" is invalid`);
  return value;
};

function todayCivil(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function parseRuleInput(body: unknown): RuleInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Request body must be an object');
  const record = body as Record<string, unknown>;
  const allowed = ['supplier_id', 'product_id', 'category_id', 'mode', 'base_selector', 'value', 'entitlement_event', 'collection_model', 'effective_from', 'reason'];
  for (const key of Object.keys(record)) if (!allowed.includes(key)) throw new ValidationError(`Unknown field "${key}"`);
  const mode = record.mode as RevenueMode;
  if (!MODES.includes(mode)) throw new ValidationError('Field "mode" is invalid');
  const baseSelector = (record.base_selector ?? null) as BaseSelector | null;
  if (baseSelector === ('MARGIN' as BaseSelector)) throw new ValidationError('The MARGIN base is not available in Travel Lite');
  if (mode === 'PERCENTAGE' ? !baseSelector || !BASES.includes(baseSelector) : baseSelector !== null) {
    throw new ValidationError('Field "base_selector" is required for PERCENTAGE and forbidden otherwise');
  }
  const value = mode === 'NONE' ? 0 : Number(record.value);
  if (!Number.isFinite(value) || value < 0 || (mode === 'PERCENTAGE' && value > 100)) throw new ValidationError('Field "value" is invalid');
  const collectionModel = (record.collection_model ?? 'AGENCY_COLLECTS') as CollectionModel;
  if (!MODELS.includes(collectionModel)) throw new ValidationError('Field "collection_model" is invalid');
  const entitlementEvent = (record.entitlement_event ?? (collectionModel === 'AGENCY_COLLECTS' ? 'ON_FULL_SETTLEMENT' : 'ON_SALE_CONFIRMATION')) as EntitlementEvent;
  if (!EVENTS.includes(entitlementEvent)) throw new ValidationError('Field "entitlement_event" is invalid');
  if (collectionModel === 'SUPPLIER_COLLECTS' && entitlementEvent !== 'ON_SALE_CONFIRMATION') {
    throw new ValidationError('SUPPLIER_COLLECTS only supports ON_SALE_CONFIRMATION (the agency does not collect from the customer)');
  }
  const effectiveFrom = record.effective_from === undefined ? todayCivil() : record.effective_from;
  if (typeof effectiveFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw new ValidationError('Field "effective_from" must be YYYY-MM-DD');
  if (effectiveFrom < todayCivil()) throw new ValidationError('Retroactive rules are not allowed');
  const reason = typeof record.reason === 'string' ? record.reason.trim() : '';
  if (reason.length < 1 || reason.length > 300) throw new ValidationError('Field "reason" is required (1 to 300 characters)');
  return {
    supplier_id: optionalId(record.supplier_id, 'supplier_id'),
    product_id: optionalId(record.product_id, 'product_id'),
    category_id: optionalId(record.category_id, 'category_id'),
    mode,
    base_selector: baseSelector,
    value,
    entitlement_event: entitlementEvent,
    collection_model: collectionModel,
    effective_from: effectiveFrom,
    reason,
  };
}

export async function createRuleVersion(database: LiteDatabase, input: RuleInput) {
  const { tenantId, userId } = getTenantContext();
  return database.withTenantTransaction(async (client) => {
    // Scopes/versions are append-only (no UPDATE grant): serialise with an advisory lock instead of FOR UPDATE.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `agency-revenue-scope:${tenantId}:${input.supplier_id ?? ''}:${input.product_id ?? ''}:${input.category_id ?? ''}`,
    ]);
    let scopeId: string;
    let revised = true;
    await client.query('SAVEPOINT revenue_scope');
    try {
      const scope = await client.query<{ id: string }>(
        `SELECT id FROM agency_revenue_scopes
          WHERE tenant_id = $1 AND COALESCE(supplier_id::text, '') = $2 AND COALESCE(product_id::text, '') = $3 AND COALESCE(category_id::text, '') = $4`,
        [tenantId, input.supplier_id ?? '', input.product_id ?? '', input.category_id ?? ''],
      );
      if (scope.rows[0]) {
        scopeId = scope.rows[0].id;
      } else {
        revised = false;
        const created = await client.query<{ id: string }>(
          `INSERT INTO agency_revenue_scopes (tenant_id, supplier_id, product_id, category_id, created_by)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [tenantId, input.supplier_id, input.product_id, input.category_id, userId || null],
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
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS n FROM agency_revenue_rule_versions WHERE tenant_id = $1 AND scope_id = $2`,
      [tenantId, scopeId],
    );
    const inserted = await client.query<{ id: string; version_number: number }>(
      `INSERT INTO agency_revenue_rule_versions
         (tenant_id, scope_id, version_number, effective_from, mode, base_selector, value,
          entitlement_event, collection_model, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, version_number`,
      [tenantId, scopeId, next.rows[0]!.n, input.effective_from, input.mode, input.base_selector, input.value,
        input.entitlement_event, input.collection_model, input.reason, userId || null],
    );
    await recordAuditEvent(client, {
      eventType: revised ? AUDIT_EVENTS.AGENCY_REVENUE_RULE_REVISED : AUDIT_EVENTS.AGENCY_REVENUE_RULE_CREATED,
      entityType: 'agency_revenue_rule',
      entityId: inserted.rows[0]!.id,
      metadata: { change: `${input.mode}:${input.value}`, reason: input.reason.slice(0, 120) },
    });
    return { id: inserted.rows[0]!.id, scope_id: scopeId, version_number: inserted.rows[0]!.version_number };
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
}

export async function listRuleVersions(database: LiteDatabase) {
  const { tenantId } = getTenantContext();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<RuleVersionView>(
      `SELECT v.id, v.scope_id, s.supplier_id, s.product_id, s.category_id, v.version_number,
              to_char(v.effective_from, 'YYYY-MM-DD') AS effective_from, v.mode, v.base_selector,
              v.value::float8 AS value, v.entitlement_event, v.collection_model, v.reason, v.created_at
         FROM agency_revenue_rule_versions v JOIN agency_revenue_scopes s ON s.tenant_id = v.tenant_id AND s.id = v.scope_id
        WHERE v.tenant_id = $1 ORDER BY s.id, v.version_number`,
      [tenantId],
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
}

async function lockSale(client: TenantClient, tenantId: string, saleId: string): Promise<SaleRow> {
  const sale = await client.query<SaleRow>(
    `SELECT id, status, category_id, passenger_count, to_char(sale_date, 'YYYY-MM-DD') AS sale_date, settled_at
       FROM sales WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [tenantId, saleId],
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

export async function calculateRevenueForSale(database: LiteDatabase, saleId: string) {
  const { tenantId, userId } = getTenantContext();
  return database.withTenantTransaction(async (client) => {
    const sale = await lockSale(client, tenantId, saleId);
    if (sale.status === 'CANCELLED') throw new ConflictError('Cannot calculate revenue for a cancelled sale');
    const items = await client.query<{
      id: string; product_id: string | null; supplier_id: string | null; qty: string; unit_price: string;
      discount: string; taxes: string; fees: string; status: string;
    }>(
      `SELECT id, product_id, supplier_id, qty, unit_price, discount, taxes, fees, status
         FROM sale_items WHERE tenant_id = $1 AND sale_id = $2 ORDER BY created_at, id`,
      [tenantId, saleId],
    );
    const versions = await client.query<{
      id: string; version_number: number; effective_from: string; mode: RevenueMode; base_selector: BaseSelector | null;
      value: string; entitlement_event: EntitlementEvent; collection_model: CollectionModel;
      supplier_id: string | null; product_id: string | null; category_id: string | null;
    }>(
      `SELECT v.id, v.version_number, to_char(v.effective_from, 'YYYY-MM-DD') AS effective_from, v.mode, v.base_selector,
              v.value, v.entitlement_event, v.collection_model, s.supplier_id, s.product_id, s.category_id
         FROM agency_revenue_rule_versions v JOIN agency_revenue_scopes s ON s.tenant_id = v.tenant_id AND s.id = v.scope_id
        WHERE v.tenant_id = $1`,
      [tenantId],
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

    const active = items.rows.filter((item) => item.status === 'ACTIVE');
    const drafts = calculateSaleRevenue(
      active.map((item) => ({
        itemId: item.id,
        supplierId: item.supplier_id,
        qty: Number(item.qty),
        unitPrice: Number(item.unit_price),
        discount: Number(item.discount),
        taxes: Number(item.taxes),
        fees: Number(item.fees),
        lineMargin: 0,
        passengerCount: sale.passenger_count ?? 1,
        rule: resolveRuleVersion(candidates, {
          productId: item.product_id,
          supplierId: item.supplier_id,
          categoryId: sale.category_id,
          onDate: sale.sale_date,
        })?.rule ?? null,
      })),
    );

    const existing = await client.query<EntryRow>(
      `SELECT id, sale_item_id, status, entitlement_event, amount FROM agency_revenue_entries
        WHERE tenant_id = $1 AND sale_id = $2 ORDER BY (status = 'CANCELLED') DESC, created_at, id FOR UPDATE`,
      [tenantId, saleId],
    );
    const byItem = new Map(existing.rows.map((row) => [row.sale_item_id, row]));
    const locked: string[] = [];
    for (const draft of drafts) {
      const current = byItem.get(draft.itemId);
      const event = draft.ruleVersionId ? (eventByVersion.get(draft.ruleVersionId) ?? null) : null;
      if (current && !['FORECAST', 'PENDING_RULE'].includes(current.status)) {
        locked.push(draft.itemId);
        continue;
      }
      if (current) {
        await client.query(
          `UPDATE agency_revenue_entries
              SET supplier_id = $3, rule_version_id = $4, status = $5, entitlement_event = $6, amount = $7,
                  base_amount = $8, memory = $9::jsonb, updated_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [tenantId, current.id, draft.supplierId, draft.ruleVersionId, draft.status, event, draft.amount, draft.base, JSON.stringify(draft.memory)],
        );
      } else {
        await client.query(
          `INSERT INTO agency_revenue_entries
             (tenant_id, sale_id, sale_item_id, supplier_id, rule_version_id, status, entitlement_event, amount, base_amount, memory, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
          [tenantId, saleId, draft.itemId, draft.supplierId, draft.ruleVersionId, draft.status, event, draft.amount, draft.base, JSON.stringify(draft.memory), userId || null],
        );
      }
    }
    const activeIds = new Set(active.map((item) => item.id));
    for (const row of existing.rows) {
      if (!activeIds.has(row.sale_item_id) && !['RECEIVED', 'CANCELLED'].includes(row.status)) {
        await setStatus(client, tenantId, row.id, 'CANCELLED', AUDIT_EVENTS.AGENCY_REVENUE_CANCELLED);
      }
    }
    await syncRevenueEntitlement(client, tenantId, saleId);
    const total = drafts.reduce((sum, draft) => sum + Math.round(draft.amount * 100), 0) / 100;
    await recordAuditEvent(client, {
      eventType: AUDIT_EVENTS.AGENCY_REVENUE_CALCULATED,
      entityType: 'sale',
      entityId: saleId,
      metadata: { amount: total, result: `${drafts.length} entries, ${locked.length} locked` },
    });
    return { locked, entries: await loadEntries(client, tenantId, saleId) };
  });
}

async function setStatus(
  client: TenantClient,
  tenantId: string,
  entryId: string,
  to: EntryStatus,
  event: string,
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
  const params: unknown[] = [tenantId, entryId, to];
  if (to === 'RECEIVED') params.push(extra.receivedAmount ?? 0, extra.reference ?? null);
  await client.query(
    `UPDATE agency_revenue_entries SET status = $3, updated_at = now()${sets} WHERE tenant_id = $1 AND id = $2`,
    params,
  );
  await recordAuditEvent(client, {
    eventType: event,
    entityType: 'agency_revenue_entry',
    entityId: entryId,
    metadata: { to_status: to },
  });
}

/**
 * Moves FORECAST <-> ENTITLED from the sale state. Idempotent; called after
 * calculation, confirmation and every customer payment. Never produces
 * AVAILABLE or RECEIVED. ON_BALANCE_DEADLINE also needs the settlement (Q6).
 */
/** Entries cannot exist before migration 015, so the sale hooks are a no-op on a schema without it. */
async function revenueSchemaPresent(client: TenantClient): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(`SELECT to_regclass('public.agency_revenue_entries') IS NOT NULL AS present`);
  return result.rows[0]?.present === true;
}

export async function syncRevenueEntitlement(client: TenantClient, tenantId: string, saleId: string): Promise<void> {
  if (!(await revenueSchemaPresent(client))) return;
  const sale = await client.query<{ status: string; settled_at: Date | null }>(
    `SELECT status, settled_at FROM sales WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [tenantId, saleId],
  );
  const row = sale.rows[0];
  if (!row || row.status === 'CANCELLED') return;
  const confirmed = CONFIRMED.includes(row.status);
  const settled = row.settled_at !== null || row.status === 'PAID';
  const entries = await client.query<EntryRow>(
    `SELECT id, sale_item_id, status, entitlement_event, amount FROM agency_revenue_entries
      WHERE tenant_id = $1 AND sale_id = $2 AND status IN ('FORECAST', 'ENTITLED')
        AND sale_item_id IN (SELECT id FROM sale_items WHERE tenant_id = $1 AND sale_id = $2 AND status = 'ACTIVE') FOR UPDATE`,
    [tenantId, saleId],
  );
  for (const entry of entries.rows) {
    const due = entry.entitlement_event === 'ON_SALE_CONFIRMATION' ? confirmed : confirmed && settled;
    if (due && entry.status === 'FORECAST') {
      await setStatus(client, tenantId, entry.id, 'ENTITLED', AUDIT_EVENTS.AGENCY_REVENUE_ENTITLED);
    } else if (!due && entry.status === 'ENTITLED') {
      await setStatus(client, tenantId, entry.id, 'FORECAST', AUDIT_EVENTS.AGENCY_REVENUE_ENTITLED);
    }
  }
}

/** D6: cancelling a sale whose revenue the supplier already paid is blocked (409); the rest is cancelled. */
export async function cancelRevenueForSale(client: TenantClient, tenantId: string, saleId: string): Promise<void> {
  if (!(await revenueSchemaPresent(client))) return;
  await lockSale(client, tenantId, saleId);
  const entries = await client.query<EntryRow>(
    `SELECT id, sale_item_id, status, entitlement_event, amount FROM agency_revenue_entries
      WHERE tenant_id = $1 AND sale_id = $2 AND status <> 'CANCELLED' FOR UPDATE`,
    [tenantId, saleId],
  );
  if (entries.rows.some((entry) => entry.status === 'RECEIVED')) {
    throw new ConflictError('Cannot cancel a sale whose agency revenue was already received from the supplier');
  }
  for (const entry of entries.rows.filter((row) => row.status !== 'CANCELLED')) {
    await setStatus(client, tenantId, entry.id, 'CANCELLED', AUDIT_EVENTS.AGENCY_REVENUE_CANCELLED);
  }
}


async function lockEntrySale(client: TenantClient, tenantId: string, entryId: string): Promise<string> {
  const result = await client.query<{ sale_id: string }>(
    `SELECT sale_id FROM agency_revenue_entries WHERE tenant_id = $1 AND id = $2`, [tenantId, entryId]);
  const saleId = result.rows[0]?.sale_id;
  if (!saleId) throw new NotFoundError('Revenue entry not found');
  await lockSale(client, tenantId, saleId);
  return saleId;
}

/** Item cancellation and the revenue transition belong to the caller's transaction. */
export async function cancelRevenueForItem(client: TenantClient, tenantId: string, saleId: string, itemId: string): Promise<void> {
  if (!(await revenueSchemaPresent(client))) return;

  await lockSale(client, tenantId, saleId);
  const result = await client.query<EntryRow>(
    `SELECT id, sale_item_id, status, entitlement_event, amount FROM agency_revenue_entries
      WHERE tenant_id = $1 AND sale_id = $2 AND sale_item_id = $3 AND status <> 'CANCELLED' FOR UPDATE`,
    [tenantId, saleId, itemId]);
  if (result.rows.some((entry) => entry.status === 'RECEIVED')) {
    throw new ConflictError('Cannot cancel an item whose agency revenue was already received');
  }
  for (const entry of result.rows) {
    await setStatus(client, tenantId, entry.id, 'CANCELLED', AUDIT_EVENTS.AGENCY_REVENUE_CANCELLED);
  }
}

export async function reactivateRevenueEntry(database: LiteDatabase, entryId: string, reason: string) {
  const context = getTenantContext();
  requireAdministrator(context);
  const { tenantId } = context;
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 128) throw new ValidationError('A reason of 1 to 128 characters is required');
  return database.withTenantTransaction(async (client) => {
    const saleId = await lockEntrySale(client, tenantId, entryId);
    const eligible = await client.query<EntryRow>(
      `SELECT e.id, e.sale_item_id, e.status, e.entitlement_event, e.amount FROM agency_revenue_entries e
       JOIN sale_items i ON i.tenant_id=e.tenant_id AND i.id=e.sale_item_id AND i.sale_id=e.sale_id
       JOIN sales s ON s.tenant_id=e.tenant_id AND s.id=e.sale_id
       WHERE e.tenant_id=$1 AND e.id=$2 AND i.status='ACTIVE' AND s.status <> 'CANCELLED' FOR UPDATE OF e`,
      [tenantId, entryId]);
    const row = eligible.rows[0];
    if (!row || row.status !== 'CANCELLED') throw new ConflictError('Only cancelled revenue of an active item and sale can be reactivated');
    const live = await client.query(`SELECT 1 FROM agency_revenue_entries
      WHERE tenant_id=$1 AND sale_item_id=$2 AND status <> 'CANCELLED'`, [tenantId, row.sale_item_id]);
    if (live.rowCount) throw new ConflictError('The item already has live revenue');
    await client.query(`UPDATE agency_revenue_entries SET
      status=CASE WHEN rule_version_id IS NULL OR memory ? 'reason' THEN 'PENDING_RULE' ELSE 'FORECAST' END,
      cancelled_at=NULL, entitled_at=NULL, updated_at=now() WHERE tenant_id=$1 AND id=$2`, [tenantId, entryId]);
    await recordAuditEvent(client, {
      eventType: AUDIT_EVENTS.AGENCY_REVENUE_REACTIVATED, entityType: 'agency_revenue_entry', entityId: entryId,

      metadata: { reason: reason.trim() },
    });
    await syncRevenueEntitlement(client, tenantId, saleId);
    return { id: entryId };
  });
}

export async function receiveRevenueEntry(
  database: LiteDatabase,
  entryId: string,
  input: { amount: number; reference: string | null },
) {
  const { tenantId } = getTenantContext();
  if (!Number.isFinite(input.amount) || input.amount < 0) throw new ValidationError('Field "amount" is invalid');
  return database.withTenantTransaction(async (client) => {

    await lockEntrySale(client, tenantId, entryId);
    const entry = await client.query<EntryRow>(
      `SELECT id, sale_item_id, status, entitlement_event, amount FROM agency_revenue_entries
        WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, entryId],
    );
    const row = entry.rows[0];
    if (!row) throw new NotFoundError('Revenue entry not found');
    if (row.status !== 'ENTITLED' && row.status !== 'AVAILABLE') {
      throw new ConflictError(`Cannot receive a ${row.status} entry (the right must exist first)`);
    }
    await setStatus(client, tenantId, row.id, 'RECEIVED', AUDIT_EVENTS.AGENCY_REVENUE_RECEIVED, {
      receivedAmount: input.amount,
      reference: input.reference,
    });
    return { id: row.id, expected: Number(row.amount), received: input.amount, difference: Math.round((Number(row.amount) - input.amount) * 100) / 100 };
  });
}

export async function cancelRevenueEntry(database: LiteDatabase, entryId: string) {
  const { tenantId } = getTenantContext();
  return database.withTenantTransaction(async (client) => {

    await lockEntrySale(client, tenantId, entryId);
    const entry = await client.query<EntryRow>(
      `SELECT id, sale_item_id, status, entitlement_event, amount FROM agency_revenue_entries
        WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, entryId],
    );
    const row = entry.rows[0];
    if (!row) throw new NotFoundError('Revenue entry not found');
    if (row.status === 'RECEIVED') throw new ConflictError('A received entry cannot be cancelled');
    if (row.status === 'CANCELLED') return { id: row.id, status: 'CANCELLED' as const };
    await setStatus(client, tenantId, row.id, 'CANCELLED', AUDIT_EVENTS.AGENCY_REVENUE_CANCELLED);
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

async function loadEntries(client: TenantClient, tenantId: string, saleId: string) {
  const result = await client.query<EntryView>(
    `SELECT id, sale_item_id, supplier_id, rule_version_id, status, entitlement_event, amount::float8 AS amount,
            base_amount::float8 AS base_amount, calc_version, memory, entitled_at, received_at, received_amount::float8 AS received_amount
       FROM agency_revenue_entries WHERE tenant_id = $1 AND sale_id = $2 ORDER BY created_at, id`,
    [tenantId, saleId],
  );
  return result.rows;
}

/** Read model: revenue entries plus an analysis-only comparison with the seller commission (no netting). */
export async function getSaleRevenue(database: LiteDatabase, saleId: string) {
  const context = getTenantContext();
  const { tenantId } = context;
  // The comparison with the seller commission is only shown to who may read commissions.
  const mayReadCommissions = can(context, 'commissions.read_all');
  return database.withTenantTransaction(async (client) => {
    const sale = await client.query(`SELECT 1 FROM sales WHERE tenant_id = $1 AND id = $2`, [tenantId, saleId]);
    if (sale.rowCount === 0) throw new NotFoundError('Sale not found');
    const entries = await loadEntries(client, tenantId, saleId);
    const commission = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(commission_amount), 0) AS total FROM seller_commissions
        WHERE tenant_id = $1 AND sale_id = $2 AND status <> 'CANCELLED'`,
      [tenantId, saleId],
    );
    const sum = (statuses: string[], field: 'amount' | 'received_amount' = 'amount') =>
      entries.filter((entry) => statuses.includes(entry.status as string)).reduce((total, entry) => total + Math.round(Number(entry[field] ?? 0) * 100), 0) / 100;
    const projected = sum(['FORECAST', 'ENTITLED', 'AVAILABLE', 'RECEIVED']);
    const expectedReceived = sum(['RECEIVED']);
    const actualReceived = sum(['RECEIVED'], 'received_amount');
    const sellerCommission = mayReadCommissions ? Math.round(Number(commission.rows[0]?.total ?? 0) * 100) / 100 : null;
    return {
      entries,
      totals: {
        forecast: sum(['FORECAST']),
        entitled: sum(['ENTITLED', 'AVAILABLE']),
        expected: expectedReceived,
        received: actualReceived,
        difference: Math.round((expectedReceived - actualReceived) * 100) / 100,
        pending_rule: entries.filter((entry) => entry.status === 'PENDING_RULE').length,
      },
      // Analysis only (D3): two independent obligations, never netted or linked by payment.
      analysis: {
        agency_revenue: projected,
        seller_commission: sellerCommission,
        difference: sellerCommission === null ? null : Math.round((projected - sellerCommission) * 100) / 100,
      },
    };
  });
}
