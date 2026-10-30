import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { computeCommissionForSale } from '../commission-engine';
import { roundMoney } from '../money';
import { resolveSaleReleaseMode } from '../commission-release-policy';
import {
  can,
  effectiveSellerFilter,
  inScope,
  requirePermission,
  scopeCondition,
  scopeFor,
  type AccessContext,
  type Scope,
} from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import type { LiteDatabase, TenantClient } from '../database';
import { ConflictError, ForbiddenError, FormFieldError, NotFoundError, ValidationError } from '../errors';
import {
  SALE_RULE_KEYS,
  assertTravelDateOrder,
  buildFormSnapshot,
  getSaleFormField,
  validateSaleFormValues,
  type FormSnapshot,
  type SaleFormRule,
} from '../sale-form-fields';
import { loadCategoryWithRules } from './sale-forms';
import { enqueueOutboxEvent } from '../outbox';
import { getTenantContext } from '../tenant-context';
import { cancelRevenueForSale, syncRevenueEntitlement } from '../agency-revenue';
import {
  optionalDate,
  optionalEnum,
  optionalString,
  optionalUuid,
  parseObjectBody,
  requiredAmount,
  requiredDate,
  requiredString,
} from '../validation';

const MAX_PAGE_SIZE = 100;
const MAX_INSTALLMENTS = 999;
const SALE_STATUSES = ['DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;

// pg returns DATE columns as 'YYYY-MM-DD' strings — no to_char needed.
const SELECT_SALE = `id, sale_number, customer_id, seller_id, category_id, description,
  gross_amount, cost_amount, margin_amount, sale_date, due_date,
  installment_count, status, payment_method_id, notes, created_at, updated_at,
  travel_start_date, travel_end_date, origin_text, destination_text, passenger_count,
  modality_data, form_snapshot`;

interface SaleRow {
  id: string;
  sale_number: string;
  customer_id: string;
  seller_id: string;
  category_id: string;
  description: string | null;
  gross_amount: string;
  cost_amount: string;
  margin_amount: string;
  sale_date: string;
  due_date: string;
  installment_count: number;
  status: string;
  payment_method_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  travel_start_date: string | null;
  travel_end_date: string | null;
  origin_text: string | null;
  destination_text: string | null;
  passenger_count: number | null;
  modality_data: Record<string, string>;
  form_snapshot: FormSnapshot | null;
}

interface SaleListItem extends SaleRow {
  customer_name: string;
  seller_name: string;
  category_name: string;
  payment_method_name: string | null;
}

/** Same joins for the list and the detail, so both return customer/seller/category/payment_method objects. */
const SALE_LIST_JOINS = `FROM sales s
      JOIN customers c ON c.tenant_id = s.tenant_id AND c.id = s.customer_id
      JOIN sellers se ON se.tenant_id = s.tenant_id AND se.id = s.seller_id
      JOIN sale_categories sc ON sc.tenant_id = s.tenant_id AND sc.id = s.category_id
      LEFT JOIN payment_methods pm ON pm.tenant_id = s.tenant_id AND pm.id = s.payment_method_id`;

const SALE_LIST_COLUMNS = `s.id, s.sale_number, s.customer_id, s.seller_id, s.category_id, s.description,
                s.gross_amount, s.cost_amount, s.margin_amount, s.sale_date, s.due_date,
                s.installment_count, s.status, s.payment_method_id, s.notes,
                s.created_at, s.updated_at,
                s.travel_start_date, s.travel_end_date, s.origin_text, s.destination_text,
                s.passenger_count, s.modality_data, s.form_snapshot,
                c.name AS customer_name, se.name AS seller_name, sc.name AS category_name,
                pm.name AS payment_method_name`;

export function computeMargin(gross: number, cost: number): number {
  if (cost > gross) {
    throw new ValidationError('Field cost_amount must not exceed gross_amount');
  }
  return roundMoney(gross - cost);
}

/**
 * Required fields of the profile the sale was made with that are still empty (derived, no column).
 * A sale made through the form is complete; imported rows can be "to complete".
 */
function missingRequiredFields(row: SaleRow): string[] {
  const values = currentFormValues(row);
  return (row.form_snapshot?.fields ?? [])
    .filter((f) => f.enabled && f.required && (values[f.fieldKey] === undefined || values[f.fieldKey] === null || (typeof values[f.fieldKey] === 'string' && (values[f.fieldKey] as string).trim() === '')))
    .map((f) => f.fieldKey);
}

/** SQL twin of missingRequiredFields, for the list filter. */
const INCOMPLETE_SQL = `EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE(s.form_snapshot->'fields', '[]'::jsonb)) f
   WHERE (f->>'enabled')::boolean AND (f->>'required')::boolean
     AND CASE f->>'fieldKey'
           WHEN 'travel_start_date' THEN s.travel_start_date IS NULL
           WHEN 'travel_end_date' THEN s.travel_end_date IS NULL
           WHEN 'origin_text' THEN COALESCE(btrim(s.origin_text), '') = ''
           WHEN 'destination_text' THEN COALESCE(btrim(s.destination_text), '') = ''
           WHEN 'passenger_count' THEN s.passenger_count IS NULL
           ELSE COALESCE(btrim(s.modality_data->>(f->>'fieldKey')), '') = ''
         END)`;

function serializeSale(row: SaleRow) {
  return {
    ...row,
    missing_required_fields: missingRequiredFields(row),
    gross_amount: Number(row.gross_amount),
    cost_amount: Number(row.cost_amount),
    margin_amount: Number(row.margin_amount),
    installment_count: Number(row.installment_count),
  };
}

function serializeListItem(row: SaleListItem) {
  const { customer_name, seller_name, category_name, payment_method_name, ...fields } = row;
  const sale = serializeSale(fields);
  return {
    ...sale,
    customer: { id: sale.customer_id, name: customer_name },
    seller: { id: sale.seller_id, name: seller_name },
    category: { id: sale.category_id, name: category_name },
    payment_method: row.payment_method_id
      ? { id: row.payment_method_id, name: payment_method_name }
      : null,
  };
}

function parseInstallmentCount(body: Record<string, unknown>): number {
  const raw = body.installment_count === undefined ? 1 : Number(body.installment_count);
  if (!Number.isInteger(raw) || raw < 1 || raw > MAX_INSTALLMENTS) {
    throw new ValidationError(
      `Field installment_count must be an integer between 1 and ${MAX_INSTALLMENTS}`,
    );
  }
  return raw;
}

async function assertReferenceExists(
  client: TenantClient,
  tenantId: string,
  table: 'customers' | 'sellers' | 'sale_categories' | 'payment_methods',
  id: string,
  field: string,
): Promise<void> {
  const result = await client.query(`SELECT 1 FROM ${table} WHERE tenant_id = $1 AND id = $2`, [
    tenantId,
    id,
  ]);
  if ((result.rowCount ?? 0) === 0) {
    throw new ValidationError(`Field ${field} must reference an existing record of this tenant`);
  }
}

/** Per-tenant sale number: VENDA-000001. UPDATE ... RETURNING takes the row lock. */
async function nextSaleNumber(client: TenantClient, tenantId: string): Promise<string> {
  await client.query(
    `INSERT INTO tenant_sequences (tenant_id, key) VALUES ($1, 'sale_number') ON CONFLICT DO NOTHING`,
    [tenantId],
  );
  const result = await client.query<{ value: string }>(
    `UPDATE tenant_sequences SET next_value = next_value + 1
      WHERE tenant_id = $1 AND key = 'sale_number'
      RETURNING next_value - 1 AS value`,
    [tenantId],
  );
  return `VENDA-${String(result.rows[0]!.value).padStart(6, '0')}`;
}

interface SaleRelations {
  customer_id: string;
  seller_id: string;
  category_id: string;
  payment_method_id: string | null;
}

export interface CreateSaleDraftInput extends SaleRelations {
  /** Form values keyed by registry field_key (ADR-008), validated against the category profile. */
  form_values?: Record<string, unknown>;
  /**
   * false only for imported rows, which carry no form values: the profile is still snapshotted and
   * disabled/unknown fields are still refused, but required fields are not demanded.
   */
  enforce_required?: boolean;
  gross_amount: number;
  cost_amount?: number;
  sale_date?: string | null;
  due_date: string;
  installment_count?: number;
  description?: string | null;
  notes?: string | null;
}

/**
 * Own-scoped users (no sales.update_all) may only sell as their own seller
 * and only to customers they can see; a customer outside their portfolio
 * is reported exactly like a missing one.
 */
async function validateSaleRelations(
  client: TenantClient,
  tenantId: string,
  relations: SaleRelations,
  context: AccessContext,
): Promise<void> {
  if (!can(context, 'sales.update_all') && relations.seller_id !== context.sellerId) {
    throw new ForbiddenError('Sales can only be registered for your own seller');
  }
  const customerScope: Scope = can(context, 'customers.read_all')
    ? { all: true }
    : { all: false, sellerId: can(context, 'customers.read_own') ? context.sellerId : null };
  const customer = await client.query<{ responsible_seller_id: string | null }>(
    'SELECT responsible_seller_id FROM customers WHERE tenant_id = $1 AND id = $2',
    [tenantId, relations.customer_id],
  );
  const row = customer.rows[0];
  if (!row || !inScope(customerScope, row.responsible_seller_id)) {
    throw new ValidationError('Field customer_id must reference an existing record of this tenant');
  }
  await assertReferenceExists(client, tenantId, 'sellers', relations.seller_id, 'seller_id');
  await assertReferenceExists(client, tenantId, 'sale_categories', relations.category_id, 'category_id');
  if (relations.payment_method_id) {
    await assertReferenceExists(
      client,
      tenantId,
      'payment_methods',
      relations.payment_method_id,
      'payment_method_id',
    );
  }
}

function readScope(): Scope {
  return scopeFor(getTenantContext(), 'sales.read_all', 'sales.read_own');
}

function updateScope(): Scope {
  return scopeFor(getTenantContext(), 'sales.update_all', 'sales.update_own');
}

// Registry key -> body property. Lite bodies are snake_case, so the key is the property.
// sale_date keeps its pre-existing handling (optionalDate) and is not a configurable value here.
const FORM_BODY_KEYS = [
  'travel_start_date',
  'travel_end_date',
  'origin_text',
  'destination_text',
  'passenger_count',
] as const;

/** Collects the configurable form values of a sale body into a field_key map. */
export function parseSaleFormBody(body: Record<string, unknown>): Record<string, unknown> | undefined {
  for (const key of SALE_RULE_KEYS) {
    if (key in body) {
      throw new FormFieldError('FIELD_NOT_ALLOWED', key, `O campo ${key} não pode ser informado na venda`);
    }
  }
  const values: Record<string, unknown> = {};
  for (const key of FORM_BODY_KEYS) {
    if (body[key] !== undefined) values[key] = body[key];
  }
  if (body.modality_data !== undefined) {
    const modality = body.modality_data;
    if (typeof modality !== 'object' || modality === null || Array.isArray(modality)) {
      throw new ValidationError('Field modality_data must be an object');
    }
    for (const [key, value] of Object.entries(modality as Record<string, unknown>)) {
      if (getSaleFormField(key)?.storage !== 'modality') {
        throw new FormFieldError('FIELD_UNKNOWN', key, `Campo de modalidade desconhecido: ${key}`);
      }
      values[key] = value;
    }
  }
  return Object.keys(values).length > 0 ? values : undefined;
}

function splitFormValues(values: Record<string, string | number | null>) {
  const columns: Record<string, string | number | null> = {};
  const modality: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(values)) {
    if (getSaleFormField(key)?.storage === 'column') columns[key] = value;
    else if (value !== null) modality[key] = value;
  }
  return { columns, modality };
}

function rulesFromSnapshot(snapshot: FormSnapshot): SaleFormRule[] {
  return snapshot.fields.map((f) => ({ fieldKey: f.fieldKey, enabled: f.enabled, required: f.required }));
}

/** Form values currently stored on a sale, keyed by field_key (nulls omitted). */
function currentFormValues(row: SaleRow): Record<string, unknown> {
  const values: Record<string, unknown> = { ...row.modality_data };
  for (const key of FORM_BODY_KEYS) {
    const value = row[key];
    if (value !== null) values[key] = value;
  }
  return values;
}

export { readScope, updateScope };

/** Out-of-scope sales are indistinguishable from missing ones (404). */
export async function loadSaleForUpdate(
  client: TenantClient,
  tenantId: string,
  saleId: string,
  scope: Scope,
): Promise<SaleRow> {
  const result = await client.query<SaleRow>(
    `SELECT ${SELECT_SALE} FROM sales WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [tenantId, saleId],
  );
  const sale = result.rows[0];
  if (!sale || !inScope(scope, sale.seller_id)) throw new NotFoundError('Sale not found');
  return sale;
}

export async function createSaleDraft(
  client: TenantClient,
  tenantId: string,
  context: AccessContext,
  input: CreateSaleDraftInput,
): Promise<SaleRow> {
  const cost = input.cost_amount ?? 0;
  const margin = computeMargin(input.gross_amount, cost);
  await validateSaleRelations(client, tenantId, input, context);
  const loaded = await loadCategoryWithRules(client, tenantId, input.category_id, 'share');
  if (!loaded) throw new ValidationError('Field category_id must reference an existing record of this tenant');
  if (!loaded.category.active) {
    throw new FormFieldError('CATEGORY_INACTIVE', undefined, 'A categoria está inativa');
  }
  const snapshot = buildFormSnapshot(
    { id: loaded.category.id, name: loaded.category.name, formRevision: loaded.category.form_revision },
    loaded.rules,
  );
  const parsedForm = validateSaleFormValues(
    input.enforce_required === false ? loaded.rules.map((rule) => ({ ...rule, required: false })) : loaded.rules,
    input.form_values ?? {},
    'create',
  );
  const { columns: formColumns, modality } = splitFormValues(parsedForm);
  const saleNumber = await nextSaleNumber(client, tenantId);
  const result = await client.query<SaleRow>(
    `INSERT INTO sales (tenant_id, customer_id, seller_id, category_id, sale_number,
                        description, gross_amount, cost_amount, margin_amount,
                        sale_date, due_date, installment_count, payment_method_id, notes,
                        travel_start_date, travel_end_date, origin_text, destination_text,
                        passenger_count, modality_data, form_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             $15::date, $16::date, $17, $18, $19, $20::jsonb, $21::jsonb)
     RETURNING ${SELECT_SALE}`,
    [
      tenantId,
      input.customer_id,
      input.seller_id,
      input.category_id,
      saleNumber,
      input.description ?? null,
      input.gross_amount,
      cost,
      margin,
      input.sale_date ?? new Date().toISOString().slice(0, 10),
      input.due_date,
      input.installment_count ?? 1,
      input.payment_method_id,
      input.notes ?? null,
      formColumns.travel_start_date ?? null,
      formColumns.travel_end_date ?? null,
      formColumns.origin_text ?? null,
      formColumns.destination_text ?? null,
      formColumns.passenger_count ?? null,
      JSON.stringify(modality),
      JSON.stringify(snapshot),
    ],
  );
  const created = result.rows[0]!;
  await recordAuditEvent(client, {
    eventType: AUDIT_EVENTS.SALE_CREATED,
    entityType: 'sale',
    entityId: created.id,
    metadata: { sale_number: created.sale_number },
  });
  await enqueueOutboxEvent(client, {
    eventType: 'SALE_CREATED',
    entityType: 'sale',
    entityId: created.id,
    payload: { sale_number: created.sale_number },
  });
  return created;
}

export async function confirmSaleDraft(
  client: TenantClient,
  tenantId: string,
  saleId: string,
  scope: Scope,
): Promise<SaleRow> {
  const current = await loadSaleForUpdate(client, tenantId, saleId, scope);
  if (current.status !== 'DRAFT') {
    throw new ConflictError(`Only DRAFT sales can be confirmed (current: ${current.status})`);
  }

  await client.query(
    `UPDATE sales SET status = 'CONFIRMED', updated_at = now() WHERE tenant_id = $1 AND id = $2`,
    [tenantId, saleId],
  );
  // ADR-007: confirmation may entitle agency revenue (never marks it received).
  await syncRevenueEntitlement(client, tenantId, saleId);

  const gross = Number(current.gross_amount);
  const count = Number(current.installment_count);
  const base = Math.floor((gross / count) * 100) / 100;
  // A sale with an applied payment condition already owns its (real) receivables: no legacy ones.
  const scheduled = await client.query<{ applied: boolean }>(
    `SELECT payment_condition_snapshot IS NOT NULL AS applied FROM sales WHERE tenant_id = $1 AND id = $2`,
    [tenantId, saleId],
  );
  const legacyCount = scheduled.rows[0]?.applied ? 0 : count;
  for (let i = 1; i <= legacyCount; i += 1) {
    const amount = i === count ? roundMoney(gross - base * (count - 1)) : base;
    const receivable = await client.query<{ id: string }>(
      `INSERT INTO receivables (tenant_id, sale_id, installment_number, installment_count,
                                customer_id, description, amount, due_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, ($8::date + make_interval(months => $9::int))::date)
       RETURNING id`,
      [
        tenantId,
        saleId,
        i,
        count,
        current.customer_id,
        `${current.sale_number} - parcela ${i}/${count}`,
        amount,
        current.due_date,
        i - 1,
      ],
    );
    await enqueueOutboxEvent(client, {
      eventType: 'RECEIVABLE_CREATED',
      entityType: 'receivable',
      entityId: receivable.rows[0]!.id,
      payload: { sale_number: current.sale_number, installment_number: i },
    });
  }

  // COM-03: the method decides IF receipt is required, the tenant profile HOW; anything missing blocks
  // the release (BLOCKED) instead of defaulting to ON_SALE.
  const resolution = await resolveSaleReleaseMode(client, tenantId, current.payment_method_id);
  const releaseMode = resolution.mode;
  const blockedMissing = resolution.mode === 'BLOCKED' ? resolution.missing : null;

  const calculation = await computeCommissionForSale(client, tenantId, {
    id: saleId,
    seller_id: current.seller_id,
    category_id: current.category_id,
    sale_date: current.sale_date,
    gross_amount: Number(current.gross_amount),
    margin_amount: Number(current.margin_amount),
  });

  if (calculation.pending_rule) {
    const pending = await client.query<{ id: string }>(
      `INSERT INTO seller_commissions (tenant_id, sale_id, seller_id, status, rule_snapshot, release_mode)
       VALUES ($1, $2, $3, 'PENDING_RULE', $4::jsonb, $5)
       RETURNING id`,
      [tenantId, saleId, current.seller_id, JSON.stringify(calculation.snapshot), releaseMode],
    );
    await enqueueOutboxEvent(client, {
      eventType: 'COMMISSION_CREATED',
      entityType: 'seller_commission',
      entityId: pending.rows[0]!.id,
      payload: { sale_number: current.sale_number, pending_rule: true },
    });
  } else {
    const computed = await client.query<{ id: string }>(
      `INSERT INTO seller_commissions (tenant_id, sale_id, seller_id, calculation_type,
                                       calculation_base, percentage, fixed_amount,
                                       commission_amount, status, rule_snapshot, release_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9::jsonb, $10)
       RETURNING id`,
      [
        tenantId,
        saleId,
        current.seller_id,
        calculation.calculation_type,
        calculation.calculation_base,
        calculation.percentage,
        calculation.fixed_amount,
        calculation.amount,
        JSON.stringify(calculation.snapshot),
        releaseMode,
      ],
    );
    await enqueueOutboxEvent(client, {
      eventType: 'COMMISSION_CREATED',
      entityType: 'seller_commission',
      entityId: computed.rows[0]!.id,
      payload: { sale_number: current.sale_number, amount: calculation.amount },
    });
  }

  if (blockedMissing !== null) {
    await client.query(
      `UPDATE seller_commissions SET release_blocked_missing = $3 WHERE tenant_id = $1 AND sale_id = $2 AND release_mode = 'BLOCKED'`,
      [tenantId, saleId, blockedMissing],
    );
  }

  await recordAuditEvent(client, {
    eventType: AUDIT_EVENTS.SALE_CONFIRMED,
    entityType: 'sale',
    entityId: saleId,
    metadata: { sale_number: current.sale_number, installments: count },
  });
  await enqueueOutboxEvent(client, {
    eventType: 'SALE_CONFIRMED',
    entityType: 'sale',
    entityId: saleId,
    payload: { sale_number: current.sale_number },
  });

  return { ...current, status: 'CONFIRMED' };
}

export function registerSaleRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/sales', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const query = (request.query ?? {}) as Record<string, string | undefined>;

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || 20));

    const conditions: string[] = ['s.tenant_id = $1'];
    const params: unknown[] = [context.tenantId];

    function addCondition(column: string, operator: string, value: unknown): void {
      params.push(value);
      conditions.push(`${column} ${operator} $${params.length}`);
    }

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      params.push(term);
      const p = `$${params.length}`;
      conditions.push(
        `(s.sale_number ILIKE ${p} OR s.description ILIKE ${p}
          OR c.name ILIKE ${p} OR se.name ILIKE ${p})`,
      );
    }
    if (query.status) {
      addCondition('s.status', '=', optionalEnum({ status: query.status }, 'status', SALE_STATUSES));
    }
    const sellerFilter = effectiveSellerFilter(
      readScope(),
      optionalUuid({ seller_id: query.seller_id ?? null }, 'seller_id'),
    );
    const scoped = scopeCondition(readScope(), 's.seller_id', params);
    if (scoped) conditions.push(scoped);
    else if (sellerFilter) addCondition('s.seller_id', '=', sellerFilter);
    if (query.incomplete === 'true') conditions.push(INCOMPLETE_SQL);
    if (query.customer_id) {
      addCondition('s.customer_id', '=', optionalUuid({ customer_id: query.customer_id }, 'customer_id'));
    }
    if (query.from) {
      addCondition('s.sale_date', '>=', optionalDate({ from: query.from }, 'from'));
    }
    if (query.to) {
      addCondition('s.sale_date', '<=', optionalDate({ to: query.to }, 'to'));
    }
    const where = conditions.join(' AND ');

    const joins = SALE_LIST_JOINS;

    const result = await database.withTenantTransaction(async (client) => {
      const countResult = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total ${joins} WHERE ${where}`,
        params,
      );
      const pageResult = await client.query<SaleListItem>(
        `SELECT ${SALE_LIST_COLUMNS}
           ${joins}
          WHERE ${where}
          ORDER BY s.sale_date DESC, s.sale_number DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize],
      );
      return { items: pageResult.rows, total: countResult.rows[0]?.total ?? 0 };
    });

    return {
      items: result.items.map(serializeListItem),
      page,
      pageSize,
      total: result.total,
    };
  });

  app.get('/sales/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const { id } = request.params as { id: string };

    return database.withTenantTransaction(async (client) => {
      const saleResult = await client.query<SaleListItem>(
        `SELECT ${SALE_LIST_COLUMNS} ${SALE_LIST_JOINS} WHERE s.tenant_id = $1 AND s.id = $2`,
        [context.tenantId, id],
      );
      const sale = saleResult.rows[0];
      if (!sale || !inScope(readScope(), sale.seller_id)) throw new NotFoundError('Sale not found');

      const receivablesResult = await client.query<{
        id: string;
        installment_number: number;
        installment_count: number;
        description: string;
        amount: string;
        paid_amount: string;
        due_at: string;
        status: string;
      }>(
        `SELECT id, installment_number, installment_count, description, amount, paid_amount,
                due_at, status
           FROM receivables WHERE tenant_id = $1 AND sale_id = $2
          ORDER BY installment_number NULLS LAST, due_at`,
        [context.tenantId, id],
      );

      const commissionResult = await client.query<{
        id: string;
        status: string;
        calculation_type: string | null;
        calculation_base: string | null;
        percentage: string | null;
        fixed_amount: string | null;
        commission_amount: string | null;
        paid_at: string | null;
        notes: string | null;
      }>(
        `SELECT id, status, calculation_type, calculation_base, percentage, fixed_amount,
                commission_amount, paid_at, notes
           FROM seller_commissions
          WHERE tenant_id = $1 AND sale_id = $2
          ORDER BY (status = 'CANCELLED'), created_at
          LIMIT 1`,
        [context.tenantId, id],
      );

      const commission = commissionResult.rows[0];
      const costResult = await client.query<{
        id: string;
        sale_id: string;
        financial_party_id: string | null;
        financial_party_name: string | null;
        cost_type: string;
        description: string;
        amount: string;
        due_date: string | null;
        payable_id: string | null;
        created_at: string;
      }>(
        `SELECT c.id, c.sale_id, c.financial_party_id, fp.name AS financial_party_name,
                c.cost_type, c.description, c.amount, c.due_date, c.payable_id, c.created_at
           FROM sale_cost_items c
           LEFT JOIN financial_parties fp ON fp.tenant_id = c.tenant_id AND fp.id = c.financial_party_id
          WHERE c.tenant_id = $1 AND c.sale_id = $2
          ORDER BY c.created_at, c.id`,
        [context.tenantId, id],
      );
      return {
        sale: serializeListItem(sale),
        saleCosts: costResult.rows.map((row) => ({ ...row, amount: Number(row.amount) })),
        receivables: receivablesResult.rows.map((r) => ({
          ...r,
          amount: Number(r.amount),
          paid_amount: Number(r.paid_amount),
          installment_number: Number(r.installment_number),
          installment_count: Number(r.installment_count),
        })),
        commission: commission
          ? {
              ...commission,
              calculation_base: commission.calculation_base ? Number(commission.calculation_base) : null,
              percentage: commission.percentage ? Number(commission.percentage) : null,
              fixed_amount: commission.fixed_amount ? Number(commission.fixed_amount) : null,
              commission_amount: commission.commission_amount
                ? Number(commission.commission_amount)
                : null,
            }
          : null,
      };
    });
  });

  app.post('/sales', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'sales.create');
    const body = parseObjectBody(request.body);

    const relations: SaleRelations = {
      customer_id: requiredString(body, 'customer_id', { max: 36 }),
      seller_id: requiredString(body, 'seller_id', { max: 36 }),
      category_id: requiredString(body, 'category_id', { max: 36 }),
      payment_method_id: optionalUuid(body, 'payment_method_id'),
    };
    const gross = requiredAmount(body, 'gross_amount');
    const cost = 'cost_amount' in body ? requiredAmount(body, 'cost_amount') : 0;
    const saleDate = optionalDate(body, 'sale_date') ?? new Date().toISOString().slice(0, 10);
    const dueDate = requiredDate(body, 'due_date');
    const installmentCount = parseInstallmentCount(body);
    const formValues = parseSaleFormBody(body);

    const sale = await database.withTenantTransaction((client) =>
      createSaleDraft(client, context.tenantId, context, {
        ...relations,
        ...(formValues !== undefined ? { form_values: formValues } : {}),
        gross_amount: gross,
        cost_amount: cost,
        sale_date: saleDate,
        due_date: dueDate,
        installment_count: installmentCount,
        description: optionalString(body, 'description', { max: 2000 }),
        notes: optionalString(body, 'notes', { max: 2000 }),
      }),
    );

    reply.code(201);
    return { sale: serializeSale(sale) };
  });

  app.patch('/sales/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const scope = updateScope();
    const { id } = request.params as { id: string };
    const body = parseObjectBody(request.body);

    if ('status' in body) {
      throw new ValidationError('Status changes go through confirm/cancel');
    }

    const updates: string[] = [];
    const params: unknown[] = [context.tenantId, id];

    function set(column: string, value: unknown): void {
      params.push(value);
      updates.push(`${column} = $${params.length}`);
    }

    if ('customer_id' in body) set('customer_id', requiredString(body, 'customer_id', { max: 36 }));
    if ('seller_id' in body) set('seller_id', requiredString(body, 'seller_id', { max: 36 }));
    if ('category_id' in body) set('category_id', requiredString(body, 'category_id', { max: 36 }));
    if ('payment_method_id' in body) set('payment_method_id', optionalUuid(body, 'payment_method_id'));
    if ('description' in body) set('description', optionalString(body, 'description', { max: 2000 }));
    if ('notes' in body) set('notes', optionalString(body, 'notes', { max: 2000 }));
    if ('sale_date' in body) {
      const saleDate = optionalDate(body, 'sale_date');
      if (saleDate === null) throw new ValidationError('Field sale_date is required');
      set('sale_date', saleDate);
    }
    if ('due_date' in body) set('due_date', requiredDate(body, 'due_date'));
    if ('installment_count' in body) set('installment_count', parseInstallmentCount(body));

    const formValues = parseSaleFormBody(body);
    const needsAmounts = 'gross_amount' in body || 'cost_amount' in body;
    if (needsAmounts) {
      // Only what was sent changes; the margin is re-derived in the transaction from the stored rest.
      if ('gross_amount' in body) set('gross_amount', requiredAmount(body, 'gross_amount'));
      if ('cost_amount' in body) set('cost_amount', requiredAmount(body, 'cost_amount'));
    }

    if (updates.length === 0 && formValues === undefined) {
      throw new ValidationError('At least one field is required');
    }

    const sale = await database.withTenantTransaction(async (client) => {
      const current = await loadSaleForUpdate(client, context.tenantId, id, scope);
      if (current.status !== 'DRAFT') {
        throw new ConflictError('Only DRAFT sales can be edited');
      }

      if (needsAmounts && 'gross_amount' in body) {
        const items = await client.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM sale_items WHERE tenant_id = $1 AND sale_id = $2 AND status = 'ACTIVE'`,
          [context.tenantId, id],
        );
        if ((items.rows[0]?.n ?? 0) > 0 && requiredAmount(body, 'gross_amount') !== Number(current.gross_amount)) {
          throw new FormFieldError(
            'FIELD_NOT_ALLOWED',
            'gross_amount',
            'O valor bruto é a soma dos itens da venda; altere os itens',
          );
        }
      }

      const categoryChanged = 'category_id' in body && body.category_id !== current.category_id;
      if (categoryChanged || formValues !== undefined) {
        const touchesForm = formValues !== undefined;
        if (categoryChanged) {
          // New category: the whole sale is validated against the new profile and re-snapshotted.
          const loaded = await loadCategoryWithRules(client, context.tenantId, String(body.category_id), 'share');
          if (!loaded) throw new ValidationError('Field category_id must reference an existing record of this tenant');
          if (!loaded.category.active) {
            throw new FormFieldError('CATEGORY_INACTIVE', undefined, 'A categoria está inativa');
          }
          const merged: Record<string, unknown> = { ...currentFormValues(current), ...(formValues ?? {}) };
          for (const key of Object.keys(merged)) {
            if (merged[key] === null || merged[key] === '') delete merged[key];
          }
          const parsed = validateSaleFormValues(loaded.rules, merged, 'create');
          const { columns, modality } = splitFormValues(parsed);
          for (const key of FORM_BODY_KEYS) {
            updates.push(`${key} = $${params.push(columns[key] ?? null)}`);
          }
          updates.push(`modality_data = $${params.push(JSON.stringify(modality))}::jsonb`);
          updates.push(
            `form_snapshot = $${params.push(
              JSON.stringify(
                buildFormSnapshot(
                  { id: loaded.category.id, name: loaded.category.name, formRevision: loaded.category.form_revision },
                  loaded.rules,
                ),
              ),
            )}::jsonb`,
          );
        } else if (touchesForm) {
          // Same category: edit under the profile the sale was made with. A sale from before the
          // configurable form has no snapshot yet; it takes one from the live profile now.
          let rules: SaleFormRule[];
          if (current.form_snapshot) {
            rules = rulesFromSnapshot(current.form_snapshot);
          } else {
            const loaded = await loadCategoryWithRules(client, context.tenantId, current.category_id, 'share');
            if (!loaded) throw new NotFoundError('Category not found');
            rules = loaded.rules;
            updates.push(
              `form_snapshot = $${params.push(
                JSON.stringify(
                  buildFormSnapshot(
                    { id: loaded.category.id, name: loaded.category.name, formRevision: loaded.category.form_revision },
                    rules,
                  ),
                ),
              )}::jsonb`,
            );
          }
          const parsed = validateSaleFormValues(rules, formValues ?? {}, 'update');
          const { columns } = splitFormValues(parsed);
          assertTravelDateOrder(
            columns.travel_start_date !== undefined ? columns.travel_start_date : current.travel_start_date,
            columns.travel_end_date !== undefined ? columns.travel_end_date : current.travel_end_date,
          );
          for (const [key, value] of Object.entries(columns)) {
            updates.push(`${key} = $${params.push(value)}${key.endsWith('_date') ? '::date' : ''}`);
          }
          const modalityPatch = Object.fromEntries(
            Object.entries(parsed).filter(([key]) => getSaleFormField(key)?.storage === 'modality'),
          );
          if (Object.keys(modalityPatch).length > 0) {
            updates.push(
              `modality_data = jsonb_strip_nulls(modality_data || $${params.push(JSON.stringify(modalityPatch))}::jsonb)`,
            );
          }
        }
      }

      let gross = Number(current.gross_amount);
      let cost = Number(current.cost_amount);
      if (needsAmounts) {
        gross = 'gross_amount' in body ? requiredAmount(body, 'gross_amount') : gross;
        cost = 'cost_amount' in body ? requiredAmount(body, 'cost_amount') : cost;
        set('margin_amount', computeMargin(gross, cost));
      }

      await validateSaleRelations(client, context.tenantId, {
        customer_id: 'customer_id' in body ? requiredString(body, 'customer_id', { max: 36 }) : current.customer_id,
        seller_id: 'seller_id' in body ? requiredString(body, 'seller_id', { max: 36 }) : current.seller_id,
        category_id: 'category_id' in body ? requiredString(body, 'category_id', { max: 36 }) : current.category_id,
        payment_method_id:
          'payment_method_id' in body ? optionalUuid(body, 'payment_method_id') : current.payment_method_id,
      }, context);

      updates.push('updated_at = now()');
      const result = await client.query<SaleRow>(
        `UPDATE sales SET ${updates.join(', ')} WHERE tenant_id = $1 AND id = $2
         RETURNING ${SELECT_SALE}`,
        params,
      );
      const updated = result.rows[0]!;
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.SALE_UPDATED,
        entityType: 'sale',
        entityId: updated.id,
        metadata: { sale_number: updated.sale_number },
      });
      await enqueueOutboxEvent(client, {
        eventType: 'SALE_UPDATED',
        entityType: 'sale',
        entityId: updated.id,
        payload: { sale_number: updated.sale_number },
      });
      return updated;
    });

    return { sale: serializeSale(sale) };
  });

  app.post('/sales/:id/confirm', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const scope = updateScope();
    const { id } = request.params as { id: string };

    const sale = await database.withTenantTransaction((client) =>
      confirmSaleDraft(client, context.tenantId, id, scope),
    );

    return { sale: serializeSale(sale) };
  });

  app.post('/sales/:id/cancel', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'sales.update_all');
    const { id } = request.params as { id: string };

    await database.withTenantTransaction(async (client) => {
      const current = await loadSaleForUpdate(client, context.tenantId, id, { all: true });
      if (current.status === 'CANCELLED') {
        throw new ConflictError('Sale is already cancelled');
      }
      if (current.status === 'PAID') {
        throw new ConflictError('A paid sale cannot be cancelled');
      }

      const payments = await client.query<{ paid: string }>(
        `SELECT COALESCE(sum(paid_amount), 0)::text AS paid
           FROM receivables WHERE tenant_id = $1 AND sale_id = $2`,
        [context.tenantId, id],
      );
      if (Number(payments.rows[0]?.paid ?? 0) > 0) {
        throw new ConflictError('Sale has received payments and cannot be cancelled');
      }

      const paidCommission = await client.query(
        `SELECT 1 FROM seller_commissions WHERE tenant_id = $1 AND sale_id = $2 AND status = 'PAID'`,
        [context.tenantId, id],
      );
      if ((paidCommission.rowCount ?? 0) > 0) {
        throw new ConflictError('Commission for this sale was already paid');
      }

      // A commission obligation with money already paid out cannot simply
      // disappear; recovering it is a separate (adjustment) decision.
      const partlyPaidCommission = await client.query(
        `SELECT 1 FROM payables p
           JOIN seller_commissions sc ON sc.tenant_id = p.tenant_id AND sc.id = p.commission_id
          WHERE sc.tenant_id = $1 AND sc.sale_id = $2 AND p.paid_amount > 0 AND p.status <> 'CANCELLED'`,
        [context.tenantId, id],
      );
      if ((partlyPaidCommission.rowCount ?? 0) > 0) {
        throw new ConflictError('Commission for this sale was already partially paid');
      }

      // ADR-007 / D6: agency revenue already received from the supplier blocks the cancellation (409).
      await cancelRevenueForSale(client, context.tenantId, id);
      await client.query(
        `UPDATE sales SET status = 'CANCELLED', updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, id],
      );
      await client.query(
        `UPDATE receivables SET status = 'CANCELLED', updated_at = now()
          WHERE tenant_id = $1 AND sale_id = $2 AND status <> 'CANCELLED'`,
        [context.tenantId, id],
      );
      await client.query(
        `UPDATE seller_commissions SET status = 'CANCELLED', updated_at = now()
          WHERE tenant_id = $1 AND sale_id = $2 AND status NOT IN ('CANCELLED', 'PAID')`,
        [context.tenantId, id],
      );
      // The commission's payment obligation must not stay payable.
      await client.query(
        `UPDATE payables SET status = 'CANCELLED', updated_at = now()
          WHERE tenant_id = $1 AND status <> 'CANCELLED' AND paid_amount = 0
            AND commission_id IN (SELECT id FROM seller_commissions WHERE tenant_id = $1 AND sale_id = $2)`,
        [context.tenantId, id],
      );
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.SALE_CANCELLED,
        entityType: 'sale',
        entityId: id,
        metadata: { sale_number: current.sale_number },
      });
      await enqueueOutboxEvent(client, {
        eventType: 'SALE_CANCELLED',
        entityType: 'sale',
        entityId: id,
        payload: { sale_number: current.sale_number },
      });
    });

    return { ok: true };
  });
}
