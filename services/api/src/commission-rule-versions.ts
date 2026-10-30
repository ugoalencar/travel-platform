/**
 * Versioned / progressive employee commission rules and the canonical accrual (Onda E1).
 * Tenant comes from the session context only. Versions are append-only (migration 107);
 * the in-force version is projected by effective_from / version_number, never stored as valid_until.
 */

import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { AuditEventType, recordAuditEvent } from './audit-log';
import { CommissionExceedsAgencyRevenueError, ConflictError, NotFoundError, ValidationError } from './errors';
import { getSaleMargin } from './financial';
import { captureSaleReleasePolicySnapshot } from './commission-release-service';
import {
  calculateCommission,
  selectEffectiveVersion,
  type CommissionRuleVersion,
  type CommissionTier,
} from './commission-calculation';

const AGENCY_TZ_TODAY = `(now() AT TIME ZONE 'America/Sao_Paulo')::date::text`;

export interface RuleVersionInput {
  effectiveFrom: string;
  mode: 'PERCENTAGE' | 'FIXED' | 'NONE';
  calculationMetric: 'GROSS' | 'MARGIN' | 'SUPPLIER_SOLD_TOTAL';
  value?: number | null;
  applyOn?: 'TOTAL' | 'EXCESS';
  excessThreshold?: number | null;
  progressive?: boolean;
  tierMode?: 'MARGINAL' | 'TOTAL';
  tiers?: Array<{ fromAmount: number; toAmount: number | null; rate: number }>;
  reason?: string;
  releaseAfterSupplierPayment?: boolean;
}

interface VersionRow {
  id: string;
  scope_id: string;
  version_number: number;
  effective_from: string;
  mode: 'PERCENTAGE' | 'FIXED' | 'NONE';
  calculation_metric: 'GROSS' | 'MARGIN' | 'SUPPLIER_SOLD_TOTAL';
  value: string | null;
  apply_on: 'TOTAL' | 'EXCESS';
  excess_threshold: string | null;
  progressive: boolean;
  tier_mode?: 'MARGINAL' | 'TOTAL';
  reason: string | null;
  release_after_supplier_payment?: boolean;
}

const VERSION_COLUMNS = `id, scope_id, version_number, effective_from::text AS effective_from, mode, calculation_metric,
  value::text AS value, apply_on, excess_threshold::text AS excess_threshold, progressive, tier_mode, reason, release_after_supplier_payment`;

function toRuleVersion(row: VersionRow, tiers: CommissionTier[]): CommissionRuleVersion {
  return {
    scope_id: row.scope_id,
    version_id: row.id,
    version_number: row.version_number,
    effective_from: row.effective_from,
    mode: row.mode,
    calculation_base: row.calculation_metric,
    value: row.value === null ? null : Number(row.value),
    apply_on: row.apply_on,
    excess_threshold: row.excess_threshold === null ? null : Number(row.excess_threshold),
    progressive: row.progressive,
    tier_mode: row.tier_mode ?? 'MARGINAL',
    tiers,
    release_after_supplier_payment: row.release_after_supplier_payment === true,
  };
}

async function loadTiers(client: TenantTransactionClient, agencyId: string, versionId: string): Promise<CommissionTier[]> {
  const result = await client.query<{ tier_number: number; from_amount: string; to_amount: string | null; rate: string }>(
    `SELECT tier_number, from_amount::text, to_amount::text, rate::text FROM employee_commission_rule_tiers
      WHERE agency_id = $1 AND version_id = $2 ORDER BY tier_number`,
    [agencyId, versionId],
  );
  return result.rows.map((t) => ({
    tier_number: t.tier_number,
    from_amount: Number(t.from_amount),
    to_amount: t.to_amount === null ? null : Number(t.to_amount),
    rate: Number(t.rate),
  }));
}

function assertDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`Field "${field}" must be a valid date (YYYY-MM-DD)`);
  }
}

async function insertVersion(
  client: TenantTransactionClient,
  agencyId: string,
  scopeId: string,
  input: RuleVersionInput,
): Promise<string> {
  assertDate(input.effectiveFrom, 'effectiveFrom');
  if (input.calculationMetric === 'SUPPLIER_SOLD_TOTAL' && input.mode !== 'PERCENTAGE') {
    throw new ValidationError('SUPPLIER_SOLD_TOTAL is only valid for percentage commissions');
  }
  const today = (await client.query<{ d: string }>(`SELECT ${AGENCY_TZ_TODAY} AS d`)).rows[0]!.d;
  if (input.effectiveFrom < today) throw new ValidationError('A rule revision cannot take effect in the past');
  const progressive = input.progressive === true;
  const tiers = input.tiers ?? [];
  if (progressive) {
    // fail closed on a malformed ladder before touching the database
    try {
    calculateCommission(
      {
        scope_id: scopeId, version_id: 'check', version_number: 1, effective_from: input.effectiveFrom, mode: 'PERCENTAGE',
        calculation_base: input.calculationMetric, value: null, apply_on: 'TOTAL', excess_threshold: null, progressive: true,
        tiers: tiers.map((t, i) => ({ tier_number: i + 1, from_amount: t.fromAmount, to_amount: t.toAmount, rate: t.rate })),
      },
      { gross_amount: 0, margin_amount: 0 },
      0,
    );
    } catch (error) {
      if (error instanceof RangeError) throw new ValidationError(error.message);
      throw error;
    }
  } else if (tiers.length > 0) {
    throw new ValidationError('Tiers are only allowed on a progressive version');
  }
  const next = await client.query<{ n: number }>(
    `SELECT COALESCE(max(version_number), 0) + 1 AS n FROM employee_commission_rule_versions WHERE agency_id = $1 AND scope_id = $2`,
    [agencyId, scopeId],
  );
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO employee_commission_rule_versions
       (agency_id, scope_id, version_number, effective_from, revised_by, reason, mode, calculation_metric, value,
        apply_on, excess_threshold, progressive, tier_mode, release_after_supplier_payment)
     VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [agencyId, scopeId, next.rows[0]!.n, input.effectiveFrom, getUserId(), input.reason ?? null, input.mode,
      input.calculationMetric, input.value ?? null, input.applyOn ?? 'TOTAL', input.excessThreshold ?? null, progressive, input.tierMode ?? 'MARGINAL', input.releaseAfterSupplierPayment === true],
  );
  const versionId = inserted.rows[0]!.id;
  for (const [index, tier] of tiers.entries()) {
    await client.query(
      `INSERT INTO employee_commission_rule_tiers (agency_id, version_id, tier_number, from_amount, to_amount, rate) VALUES ($1, $2, $3, $4, $5, $6)`,
      [agencyId, versionId, index + 1, tier.fromAmount, tier.toAmount, tier.rate],
    );
  }
  return versionId;
}

export async function createRuleScope(
  database: DatabaseRuntime,
  input: { employeeId?: string | null; supplierId?: string | null; categoryId?: string | null; version: RuleVersionInput },
): Promise<{ scopeId: string; versionId: string }> {
  const agencyId = getAgencyId();
  if ((input.version.calculationMetric === 'SUPPLIER_SOLD_TOTAL' || input.version.releaseAfterSupplierPayment === true) && !input.supplierId) {
    throw new ValidationError('This commission basis and supplier-payment gate require a supplier scope');
  }
  if (input.supplierId && input.categoryId) throw new ValidationError('Choose a supplier scope or a category scope, not both');
  return database.withTenantTransaction(async (client) => {
    for (const [table, id, label] of [['employees', input.employeeId, 'Employee'], ['suppliers', input.supplierId, 'Supplier'], ['commission_categories', input.categoryId, 'Category']] as const) {
      if (id) {
        const found = await client.query(`SELECT 1 FROM ${table} WHERE agency_id = $1 AND id = $2`, [agencyId, id]);
        if (found.rows.length === 0) throw new NotFoundError(`${label} not found`);
      }
    }
    let scopeId: string;
    try {
      const scope = await client.query<{ id: string }>(
        `INSERT INTO employee_commission_rule_scopes (agency_id, employee_id, supplier_id, category_id, created_by_user_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [agencyId, input.employeeId ?? null, input.supplierId ?? null, input.categoryId ?? null, getUserId()],
      );
      scopeId = scope.rows[0]!.id;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictError('An active rule scope already exists for this employee/category');
      throw error;
    }
    const versionId = await insertVersion(client, agencyId, scopeId, input.version);
    await recordAuditEvent(client, { eventType: AuditEventType.COMMISSION_RULE_VERSION_CREATED, entityType: 'employee_commission_rule_scope', entityId: scopeId, required: true, metadata: { status: 'v1' } });
    return { scopeId, versionId };
  });
}

/** Appends the next revision (never edits an earlier one). Concurrent revisions serialize on the scope row. */
export async function reviseRuleScope(database: DatabaseRuntime, scopeId: string, input: RuleVersionInput): Promise<{ versionId: string }> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const scope = await client.query<{ status: string; supplier_id: string | null }>(
      `SELECT status,supplier_id FROM employee_commission_rule_scopes WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
      [agencyId, scopeId],
    );
    if (!scope.rows[0]) throw new NotFoundError('Rule scope not found');
    if (scope.rows[0].status !== 'ACTIVE') throw new ConflictError('The rule scope is archived');
    if ((input.calculationMetric === 'SUPPLIER_SOLD_TOTAL' || input.releaseAfterSupplierPayment === true) && !scope.rows[0].supplier_id) {
      throw new ValidationError('This commission basis and supplier-payment gate require a supplier scope');
    }
    const versionId = await insertVersion(client, agencyId, scopeId, input);
    await recordAuditEvent(client, { eventType: AuditEventType.COMMISSION_RULE_VERSION_CREATED, entityType: 'employee_commission_rule_scope', entityId: scopeId, required: true, metadata: { status: 'revision' } });
    return { versionId };
  });
}

export interface ScopeView {
  id: string;
  employeeId: string | null;
  supplierId: string | null;
  categoryId: string | null;
  status: string;
  versions: Array<{
    id: string; versionNumber: number; effectiveFrom: string; mode: string; calculationMetric: string;
    value: number | null; applyOn: string; excessThreshold: number | null; progressive: boolean; reason: string | null;
    releaseAfterSupplierPayment: boolean;
    tiers: CommissionTier[]; tierMode: 'MARGINAL' | 'TOTAL'; state: 'EFFECTIVE' | 'SCHEDULED' | 'SUPERSEDED'; isEffective: boolean; supersededByVersionId: string | null; effectiveUntil: string | null;
  }>;
}

export async function listRuleScopes(database: DatabaseRuntime): Promise<ScopeView[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const scopes = await client.query<{ id: string; employee_id: string | null; supplier_id: string | null; category_id: string | null; status: string }>(
      `SELECT id, employee_id, supplier_id, category_id, status FROM employee_commission_rule_scopes WHERE agency_id = $1 ORDER BY created_at, id`,
      [agencyId],
    );
    const views: ScopeView[] = [];
    for (const scope of scopes.rows) {
      const rows = await client.query<VersionRow>(
        `SELECT ${VERSION_COLUMNS} FROM employee_commission_rule_versions WHERE agency_id = $1 AND scope_id = $2 ORDER BY version_number`,
        [agencyId, scope.id],
      );
      const today = (await client.query<{ d: string }>(`SELECT ${AGENCY_TZ_TODAY} AS d`)).rows[0]!.d;
      // Projection: highest same-day revision wins; future revisions are scheduled.
      const winners = new Map<string, VersionRow>();
      for (const row of rows.rows) {
        const current = winners.get(row.effective_from);
        if (!current || row.version_number > current.version_number) winners.set(row.effective_from, row);
      }
      const dates = [...winners.keys()].sort();
      const versions: ScopeView['versions'] = [];
      for (const row of rows.rows) {
        const winner = winners.get(row.effective_from)!;
        const isEffective = winner.id === row.id && row.effective_from <= today;
        const state: 'EFFECTIVE' | 'SCHEDULED' | 'SUPERSEDED' = winner.id !== row.id ? 'SUPERSEDED' : row.effective_from > today ? 'SCHEDULED' : 'EFFECTIVE';
        const nextDate = dates.find((d) => d > row.effective_from);
        const until = isEffective && nextDate ? new Date(new Date(`${nextDate}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10) : null;
        versions.push({
          id: row.id, versionNumber: row.version_number, effectiveFrom: row.effective_from, mode: row.mode,
          calculationMetric: row.calculation_metric, value: row.value === null ? null : Number(row.value), applyOn: row.apply_on,
          excessThreshold: row.excess_threshold === null ? null : Number(row.excess_threshold), progressive: row.progressive,
          reason: row.reason, releaseAfterSupplierPayment: row.release_after_supplier_payment === true,
          tiers: row.progressive ? await loadTiers(client, agencyId, row.id) : [],
          tierMode: row.tier_mode ?? 'MARGINAL', state, isEffective, supersededByVersionId: winner.id === row.id ? null : winner.id, effectiveUntil: until,
        });
      }
      views.push({ id: scope.id, employeeId: scope.employee_id, supplierId: scope.supplier_id, categoryId: scope.category_id, status: scope.status, versions });
    }
    return views;
  });
}

export async function getCommissionEngineSettings(database: DatabaseRuntime): Promise<{ cutoverDate: string | null }> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{ cutover_date: string | null }>(
      'SELECT cutover_date::text FROM agency_commission_engine_settings WHERE agency_id=$1', [agencyId]);
    return { cutoverDate: result.rows[0]?.cutover_date ?? null };
  });
}

export async function setCommissionEngineCutoverDate(database: DatabaseRuntime, cutoverDate: string | null): Promise<void> {
  if (cutoverDate !== null) assertDate(cutoverDate, 'cutoverDate');
  const agencyId = getAgencyId();
  await database.withTenantTransaction(async (client) => {
    await client.query(`INSERT INTO agency_commission_engine_settings (agency_id,cutover_date,updated_by)
      VALUES ($1,$2,$3) ON CONFLICT (agency_id) DO UPDATE SET cutover_date=EXCLUDED.cutover_date,
      updated_by=EXCLUDED.updated_by,updated_at=now()`, [agencyId,cutoverDate,getUserId()]);
    await recordAuditEvent(client,{eventType:AuditEventType.COMMISSION_ENGINE_CUTOFF_CHANGED,
      entityType:'agency_commission_engine_setting',entityId:agencyId,required:true,
      metadata:{status:cutoverDate?'CONFIGURED':'CLEARED'}});
  });
}

/** Hierarchy: employee+category > employee > agency+category > agency default. First scope with a version in force wins. */
async function resolveRuleVersion(
  client: TenantTransactionClient,
  agencyId: string,
  employeeId: string,
  supplierId: string | null,
  categoryId: string | null,
  date: string,
): Promise<{ version: CommissionRuleVersion; scopeCategoryId: string | null; scopeSupplierId: string | null } | null> {
  const candidates: Array<[string | null, string | null, string | null]> = [];
  if (supplierId) candidates.push([employeeId, supplierId, null]);
  if (categoryId) candidates.push([employeeId, null, categoryId]);
  candidates.push([employeeId, null, null]);
  if (supplierId) candidates.push([null, supplierId, null]);
  if (categoryId) candidates.push([null, null, categoryId]);
  candidates.push([null, null, null]);
  for (const [emp, supplier, cat] of candidates) {
    const scope = await client.query<{ id: string }>(
      `SELECT id FROM employee_commission_rule_scopes
        WHERE agency_id = $1 AND status = 'ACTIVE' AND employee_id IS NOT DISTINCT FROM $2
          AND supplier_id IS NOT DISTINCT FROM $3 AND category_id IS NOT DISTINCT FROM $4`,
      [agencyId, emp, supplier, cat],
    );
    if (!scope.rows[0]) continue;
    const rows = await client.query<VersionRow>(
      `SELECT ${VERSION_COLUMNS} FROM employee_commission_rule_versions WHERE agency_id = $1 AND scope_id = $2`,
      [agencyId, scope.rows[0].id],
    );
    const parsed = await Promise.all(rows.rows.map(async (r) => toRuleVersion(r, r.progressive ? await loadTiers(client, agencyId, r.id) : [])));
    const chosen = selectEffectiveVersion(parsed, date);
    if (chosen) return { version: chosen, scopeCategoryId: cat, scopeSupplierId: supplier };
  }
  return null;
}

export async function attributeSale(
  database: DatabaseRuntime,
  input: { saleId: string; employeeId: string; supplierId?: string | null; categoryId?: string | null; recognitionDate?: string },
): Promise<{ id: string; seq: number }> {
  const agencyId = getAgencyId();
  if (input.recognitionDate) assertDate(input.recognitionDate, 'recognitionDate');
  const margin = await getSaleMargin(database, input.saleId);
  const marginAmount = Math.max(0, Math.round((margin.revenue - margin.supplierCosts - margin.operationalCosts) * 100) / 100);
  return database.withTenantTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`commission-motor:${agencyId}:${input.saleId}:${input.employeeId}`]);
    const sale = await client.query<{ total: string; category_id: string | null; sale_date: string }>(
      `SELECT total::text, category_id, sale_date::text AS sale_date FROM sales WHERE agency_id = $1 AND id = $2`,
      [agencyId, input.saleId],
    );
    if (!sale.rows[0]) throw new NotFoundError('Sale not found');
    const employee = await client.query(`SELECT 1 FROM employees WHERE agency_id = $1 AND id = $2`, [agencyId, input.employeeId]);
    if (employee.rows.length === 0) throw new NotFoundError('Employee not found');
    const supplierId = input.supplierId ?? null;
    const existingCommission = await client.query(
      `SELECT 1 FROM commission_entries WHERE agency_id=$1 AND sale_id=$2 AND employee_id=$3
        AND supplier_id IS NOT DISTINCT FROM $4 AND status<>'CANCELLED' LIMIT 1`,
      [agencyId,input.saleId,input.employeeId,supplierId]);
    if (existingCommission.rows.length > 0) throw new ConflictError('A commission already exists for this sale and employee');
    const categoryId = input.categoryId ?? sale.rows[0].category_id;
    if (categoryId) {
      const category = await client.query(`SELECT 1 FROM commission_categories WHERE agency_id = $1 AND id = $2`, [agencyId, categoryId]);
      if (category.rows.length === 0) throw new NotFoundError('Category not found');
    }
    let grossAmount = Number(sale.rows[0].total);
    let attributedMargin = marginAmount;
    if (supplierId) {
      const supplierSale = await client.query<{ gross: string; margin: string; count: number }>(
        `SELECT COALESCE(SUM(line_total),0)::text AS gross, COALESCE(SUM(line_margin),0)::text AS margin,
                COUNT(*)::int AS count
           FROM sale_items WHERE agency_id=$1 AND sale_id=$2 AND supplier_id=$3 AND status='ACTIVE'`,
        [agencyId,input.saleId,supplierId],
      );
      if (supplierSale.rows[0]!.count === 0) throw new NotFoundError('Supplier has no active items in this sale');
      grossAmount = Number(supplierSale.rows[0]!.gross);
      attributedMargin = Number(supplierSale.rows[0]!.margin);
    }
    try {
      const inserted = await client.query<{ id: string; seq: string }>(
        `INSERT INTO sale_commission_attributions
           (agency_id, sale_id, employee_id, supplier_id, category_id, recognition_date, gross_amount, margin_amount, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, $7::date), $8, $9, $10) RETURNING id, seq::text`,
        [agencyId, input.saleId, input.employeeId, supplierId, categoryId, input.recognitionDate ?? null, sale.rows[0].sale_date,
          grossAmount, attributedMargin, getUserId()],
      );
      const row = inserted.rows[0]!;
      await recordAuditEvent(client, { eventType: AuditEventType.SALE_COMMISSION_ATTRIBUTED, entityType: 'sale', entityId: input.saleId, required: true });
      return { id: row.id, seq: Number(row.seq) };
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictError('This sale is already attributed to the employee');
      throw error;
    }
  });
}

export async function cancelAttribution(database: DatabaseRuntime, id: string): Promise<void> {
  const agencyId = getAgencyId();
  await database.withTenantTransaction(async (client) => {
    const live = await client.query(
      `SELECT 1 FROM commission_entries ce JOIN sale_commission_attributions a
         ON a.agency_id = ce.agency_id AND a.sale_id = ce.sale_id AND a.employee_id = ce.employee_id
            AND ce.supplier_id IS NOT DISTINCT FROM a.supplier_id
       WHERE a.agency_id = $1 AND a.id = $2 AND ce.status NOT IN ('CANCELLED', 'PENDING', 'PENDING_RULE')`,
      [agencyId, id],
    );
    if (live.rows.length > 0) throw new ConflictError('The commission of this attribution is already approved or paid');
    const result = await client.query(
      `UPDATE sale_commission_attributions SET state = 'CANCELLED' WHERE agency_id = $1 AND id = $2 AND state = 'ACTIVE' RETURNING id`,
      [agencyId, id],
    );
    if (result.rows.length === 0) throw new NotFoundError('Active attribution not found');
    await recordAuditEvent(client, { eventType: AuditEventType.SALE_COMMISSION_ATTRIBUTION_CANCELLED, entityType: 'sale_commission_attribution', entityId: id, required: true });
  });
}

/**
 * Canonical accrual: sum of the ELIGIBLE attributions (ACTIVE, sale CONFIRMED/PAID) of the employee in the
 * recognition month with a smaller seq, in the rule's category when it has one, in the rule's metric.
 * Never sums commission_entries. Serialized per employee+month by an advisory lock.
 */
async function accumulatedBefore(
  client: TenantTransactionClient,
  agencyId: string,
  employeeId: string,
  scopeSupplierId: string | null,
  scopeCategoryId: string | null,
  metric: 'GROSS' | 'MARGIN' | 'SUPPLIER_SOLD_TOTAL',
  recognitionDate: string,
  seq: number,
): Promise<number> {
  const month = recognitionDate.slice(0, 7);
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`commission-accrual:${agencyId}:${employeeId}:${month}`]);
  const column = metric === 'MARGIN' ? 'a.margin_amount' : 'a.gross_amount';
  const profile = await client.query<{ effect: 'META_E_LIBERACAO' | 'SOMENTE_LIBERACAO' }>(
    `SELECT effect FROM commission_financial_profiles WHERE agency_id=$1 AND effective_from<=$2::date
      ORDER BY effective_from DESC,created_at DESC,id DESC LIMIT 1`, [agencyId,recognitionDate]);
  const effect = profile.rows[0]?.effect ?? 'SOMENTE_LIBERACAO';
  if (metric === 'MARGIN') {
    const missing = await client.query(
      `SELECT 1 FROM sale_commission_attributions a JOIN sales s ON s.agency_id = a.agency_id AND s.id = a.sale_id
        WHERE a.agency_id = $1 AND a.employee_id = $2 AND a.state = 'ACTIVE' AND s.status IN ('CONFIRMED', 'PAID')
          AND to_char(a.recognition_date, 'YYYY-MM') = $3 AND a.seq < $4 AND a.margin_amount IS NULL
          AND ($5::text IS NULL OR a.category_id = $5)
          AND ($6::text IS NULL OR a.supplier_id = $6)`,
      [agencyId, employeeId, month, seq, scopeCategoryId, scopeSupplierId],
    );
    if (missing.rows.length > 0) throw new ValidationError('An earlier attributed sale has no margin; a margin-based rule cannot accumulate');
  }
  const result = effect === 'META_E_LIBERACAO'
    ? await client.query<{ total: string }>(
      `WITH received_by_sale AS (
         SELECT r.sale_id,SUM(pa.amount) AS received FROM receivables r
         JOIN payment_allocations pa ON pa.agency_id=r.agency_id AND pa.receivable_id=r.id
         JOIN payments p ON p.agency_id=pa.agency_id AND p.id=pa.payment_id
         WHERE r.agency_id=$1 AND r.status<>'CANCELLED' AND p.direction='IN'
           AND NOT EXISTS (SELECT 1 FROM sale_payment_reversals spr WHERE spr.agency_id=p.agency_id AND spr.original_payment_id=p.id)
           AND to_char(p.occurred_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM')=$3
         GROUP BY r.sale_id
       )
       SELECT COALESCE(SUM(${column} * LEAST(COALESCE(received_by_sale.received,0) / NULLIF(s.total,0),1)),0)::text AS total
       FROM sale_commission_attributions a JOIN sales s ON s.agency_id=a.agency_id AND s.id=a.sale_id
       LEFT JOIN received_by_sale ON received_by_sale.sale_id=a.sale_id
       WHERE a.agency_id=$1 AND a.employee_id=$2 AND a.state='ACTIVE' AND s.status IN ('CONFIRMED','PAID')
         AND to_char(a.recognition_date,'YYYY-MM')=$3 AND a.seq<$4 AND ($5::text IS NULL OR a.category_id=$5)
         AND ($6::text IS NULL OR a.supplier_id=$6)`,
      [agencyId, employeeId, month, seq, scopeCategoryId, scopeSupplierId],
    )
    : await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(${column}), 0)::text AS total FROM sale_commission_attributions a
         JOIN sales s ON s.agency_id = a.agency_id AND s.id = a.sale_id
        WHERE a.agency_id = $1 AND a.employee_id = $2 AND a.state = 'ACTIVE' AND s.status IN ('CONFIRMED', 'PAID')
          AND to_char(a.recognition_date, 'YYYY-MM') = $3 AND a.seq < $4 AND ($5::text IS NULL OR a.category_id = $5)
          AND ($6::text IS NULL OR a.supplier_id = $6)`,
      [agencyId, employeeId, month, seq, scopeCategoryId, scopeSupplierId],
    );
  return Number(result.rows[0]!.total);
}

export async function generateVersionedCommission(
  database: DatabaseRuntime,
  input: { saleId: string; employeeId: string; supplierId?: string | null },
): Promise<{ entryId: string; status: string; amount: number }> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`commission-motor:${agencyId}:${input.saleId}:${input.employeeId}`]);
    const attribution = await client.query<{
      seq: string; category_id: string | null; supplier_id: string | null; recognition_date: string; gross_amount: string; margin_amount: string | null; sale_status: string;
    }>(
      `SELECT a.seq::text, a.category_id, a.supplier_id, a.recognition_date::text AS recognition_date, a.gross_amount::text, a.margin_amount::text, s.status AS sale_status
         FROM sale_commission_attributions a JOIN sales s ON s.agency_id = a.agency_id AND s.id = a.sale_id
        WHERE a.agency_id = $1 AND a.sale_id = $2 AND a.employee_id = $3 AND a.state = 'ACTIVE'
          AND a.supplier_id IS NOT DISTINCT FROM $4`,
      [agencyId, input.saleId, input.employeeId, input.supplierId ?? null],
    );
    const att = attribution.rows[0];
    if (!att) throw new NotFoundError('The sale is not attributed to this employee');
    const settings = await client.query<{ cutover_date: string | null }>(
      'SELECT cutover_date::text FROM agency_commission_engine_settings WHERE agency_id=$1',[agencyId]);
    if (settings.rows[0]?.cutover_date && att.recognition_date < settings.rows[0].cutover_date) {
      throw new ConflictError('This sale predates the versioned commission cutover date');
    }
    if (att.sale_status !== 'CONFIRMED' && att.sale_status !== 'PAID') {
      throw new ConflictError('Commission can only be generated for a confirmed or paid sale');
    }
    const resolved = await resolveRuleVersion(client, agencyId, input.employeeId, att.supplier_id, att.category_id, att.recognition_date);
    const releasePolicySnapshot = await captureSaleReleasePolicySnapshot(client, agencyId, input.saleId);
    // A PENDING_RULE entry is resolved in place once a rule exists (no need to cancel the sale or the attribution).
    const waiting = await client.query<{ id: string }>(
      `SELECT id FROM commission_entries
        WHERE agency_id = $1 AND sale_id = $2 AND employee_id = $3 AND supplier_id IS NOT DISTINCT FROM $4 AND status = 'PENDING_RULE' FOR UPDATE`,
      [agencyId, input.saleId, input.employeeId, att.supplier_id],
    );
    const waitingId = waiting.rows[0]?.id ?? null;
    try {
      if (!resolved || resolved.version.mode === 'NONE') {
        if (waitingId) return { entryId: waitingId, status: 'PENDING_RULE', amount: 0 };
        const pending = await client.query<{ id: string }>(
          `INSERT INTO commission_entries (agency_id, employee_id, sale_id, supplier_id, calculation_base, amount, status, calculation_snapshot, release_policy_snapshot)
           VALUES ($1, $2, $3, $4, $5, 0, 'PENDING_RULE', $6::jsonb, $7::jsonb) RETURNING id`,
          [agencyId, input.employeeId, input.saleId, att.supplier_id, Number(att.gross_amount), JSON.stringify({ rule_type: 'UNDEFINED', reason: 'no rule in force' }), JSON.stringify(releasePolicySnapshot)],
        );
        await recordAuditEvent(client, { eventType: AuditEventType.COMMISSION_VERSIONED_GENERATED, entityType: 'commission_entry', entityId: pending.rows[0]!.id, required: true, metadata: { status: 'PENDING_RULE' } });
        return { entryId: pending.rows[0]!.id, status: 'PENDING_RULE', amount: 0 };
      }
      const { version, scopeCategoryId, scopeSupplierId } = resolved;
      if (version.calculation_base === 'MARGIN' && att.margin_amount === null) {
        throw new ValidationError('The attribution has no margin; a margin-based rule cannot be applied');
      }
      const accumulated = version.progressive
        ? await accumulatedBefore(client, agencyId, input.employeeId, scopeSupplierId, scopeCategoryId, version.calculation_base, att.recognition_date, Number(att.seq))
        : 0;
      const calc = calculateCommission(
        version,
        { gross_amount: Number(att.gross_amount), margin_amount: att.margin_amount === null ? 0 : Number(att.margin_amount), supplier_sold_total: Number(att.gross_amount) },
        accumulated,
      );
      if (calc.pending_rule) throw new ConflictError('No usable rule');
      let costWarning = false;
      if (att.supplier_id) {
        const revenue = await client.query<{ expected: string }>(
          `SELECT COALESCE(SUM(amount),0)::text AS expected FROM agency_revenue_entries
            WHERE agency_id=$1 AND sale_id=$2 AND supplier_id=$3 AND status NOT IN ('PENDING_RULE','CANCELLED')`,
          [agencyId,input.saleId,att.supplier_id],
        );
        const policy = await client.query<{ mode: 'WARN' | 'BLOCK' }>(
          `SELECT mode FROM agency_commission_cost_policies WHERE agency_id=$1`, [agencyId],
        );
        const expected = Math.round(Number(revenue.rows[0]?.expected ?? 0) * 100);
        const commission = Math.round(calc.amount * 100);
        costWarning = commission > expected;
        if (costWarning && policy.rows[0]?.mode === 'BLOCK') throw new CommissionExceedsAgencyRevenueError();
      }
      const calculationSnapshot = {
        ...calc.snapshot,
        supplierId: att.supplier_id,
        supplierSoldTotal: att.supplier_id ? Number(att.gross_amount) : undefined,
        ...(costWarning ? { agencyRevenueWarning: 'COMMISSION_EXCEEDS_AGENCY_REVENUE' } : {}),
      };
      if (waitingId) {
        await client.query(
          `UPDATE commission_entries
              SET calculation_base = $3, rate = $4, amount = $5, status = 'PENDING', rule_version_id = $6,
                  accumulated_before = $7, calculation_snapshot = $8::jsonb,
                  release_after_supplier_payment=$9
            WHERE agency_id = $1 AND id = $2 AND status = 'PENDING_RULE'`,
          [agencyId, waitingId, calc.calculation_base ?? 0, calc.percentage, calc.amount, version.version_id,
            version.progressive ? accumulated : null, JSON.stringify(calculationSnapshot), version.release_after_supplier_payment === true],
        );
        await recordAuditEvent(client, { eventType: AuditEventType.COMMISSION_VERSIONED_GENERATED, entityType: 'commission_entry', entityId: waitingId, required: true, metadata: { status: 'PENDING', amount: calc.amount, result: 'pending_rule_resolved' } });
        return { entryId: waitingId, status: 'PENDING', amount: calc.amount };
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO commission_entries
           (agency_id, employee_id, sale_id, supplier_id, release_after_supplier_payment, calculation_base, rate, amount, status, rule_version_id, accumulated_before, calculation_snapshot, release_policy_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9, $10, $11::jsonb, $12::jsonb) RETURNING id`,
        [agencyId, input.employeeId, input.saleId, att.supplier_id, version.release_after_supplier_payment === true,
          calc.calculation_base ?? 0, calc.percentage, calc.amount, version.version_id,
          version.progressive ? accumulated : null, JSON.stringify(calculationSnapshot), JSON.stringify(releasePolicySnapshot)],
      );
      await recordAuditEvent(client, { eventType: AuditEventType.COMMISSION_VERSIONED_GENERATED, entityType: 'commission_entry', entityId: inserted.rows[0]!.id, required: true, metadata: { status: 'PENDING', amount: calc.amount } });
      return { entryId: inserted.rows[0]!.id, status: 'PENDING', amount: calc.amount };
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictError('A commission already exists for this sale and employee');
      throw error;
    }
  });
}
