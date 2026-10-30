/**
 * Commission engine (spec: docs/travel-lite/COMMISSION-ENGINE-SPEC.md).
 *
 * Rule selection is deterministic: per scope there is at most one ACTIVE rule
 * (ux_commission_rules_active_scope) and the applicable version is the one
 * with the greatest effective_from <= the sale date (latest revision wins on
 * the same day). Precedence between scopes:
 *   1. seller + category   2. seller   3. agency default + category   4. agency default
 * A version with mode NONE means "explicitly no rule" (-> PENDING_RULE).
 *
 * Progressive versions (Phase 3): the seller's accumulated base in the civil
 * month of the sale (confirmed sales only) is sliced across contiguous tiers
 * and every slice uses its own tier rate (marginal; a sale crossing a goal is
 * split between the old and the new rate). Earlier commissions never change.
 */
import { AUDIT_EVENTS, recordAuditEvent } from './audit-log';
import type { TenantClient } from './database';
import { roundMoney } from './money';

export const ENGINE_CALC_VERSION = 1;

export interface RuleTier {
  tier_number: number;
  from_amount: number;
  to_amount: number | null;
  rate: number;
}

export interface RuleVersion {
  rule_id: string;
  rule_category_id: string | null;
  version_id: string;
  version_number: number;
  effective_from: string;
  mode: 'PERCENTAGE' | 'FIXED' | 'NONE';
  calculation_base: 'GROSS' | 'MARGIN' | null;
  value: number | null;
  apply_on: 'TOTAL' | 'EXCESS';
  excess_threshold: number | null;
  progressive: boolean;
  tiers: RuleTier[];
}

export interface CommissionSaleInput {
  seller_id: string;
  category_id: string;
  sale_date: string | Date;
  gross_amount: number;
  margin_amount: number;
}

export type CommissionCalculation =
  | { pending_rule: true; snapshot: Record<string, unknown> }
  | {
      pending_rule: false;
      calculation_type: 'PERCENTAGE_ON_GROSS' | 'PERCENTAGE_ON_MARGIN' | 'FIXED';
      calculation_base: number | null;
      percentage: number | null;
      fixed_amount: number | null;
      amount: number;
      snapshot: Record<string, unknown>;
    };

interface VersionRow {
  rule_id: string;
  rule_category_id: string | null;
  version_id: string;
  version_number: number;
  effective_from: string;
  mode: RuleVersion['mode'];
  calculation_base: RuleVersion['calculation_base'];
  value: string | null;
  apply_on: RuleVersion['apply_on'];
  excess_threshold: string | null;
  progressive: boolean;
}

/** Latest version of the highest-precedence ACTIVE rule that already applies on `saleDate`. */
export async function findApplicableVersion(
  client: TenantClient,
  tenantId: string,
  sale: Pick<CommissionSaleInput, 'seller_id' | 'category_id' | 'sale_date'>,
): Promise<RuleVersion | null> {
  const result = await client.query<VersionRow>(
    `SELECT v.rule_id, r.category_id AS rule_category_id, v.id AS version_id, v.version_number,
            v.effective_from::text AS effective_from, v.mode, v.calculation_base,
            v.value::text AS value, v.apply_on, v.excess_threshold::text AS excess_threshold,
            v.progressive
       FROM commission_rules r
       JOIN LATERAL (
         SELECT * FROM commission_rule_versions cv
          WHERE cv.tenant_id = r.tenant_id AND cv.rule_id = r.id AND cv.effective_from <= $4::date
          ORDER BY cv.effective_from DESC, cv.version_number DESC LIMIT 1
       ) v ON true
      WHERE r.tenant_id = $1 AND r.status = 'ACTIVE'
        AND (r.seller_id = $2 OR r.seller_id IS NULL)
        AND (r.category_id = $3 OR r.category_id IS NULL)
      ORDER BY (r.seller_id IS NOT NULL) DESC, (r.category_id IS NOT NULL) DESC
      LIMIT 1`,
    [tenantId, sale.seller_id, sale.category_id, sale.sale_date],
  );
  const row = result.rows[0];
  if (!row) return null;
  let tiers: RuleTier[] = [];
  if (row.progressive) {
    const tierRows = await client.query<{ tier_number: number; from_amount: string; to_amount: string | null; rate: string }>(
      `SELECT tier_number, from_amount::text, to_amount::text, rate::text FROM commission_rule_tiers
        WHERE tenant_id = $1 AND version_id = $2 ORDER BY tier_number`,
      [tenantId, row.version_id],
    );
    tiers = tierRows.rows.map((t) => ({
      tier_number: t.tier_number,
      from_amount: Number(t.from_amount),
      to_amount: t.to_amount !== null ? Number(t.to_amount) : null,
      rate: Number(t.rate),
    }));
  }
  return {
    rule_id: row.rule_id,
    rule_category_id: row.rule_category_id,
    version_id: row.version_id,
    version_number: row.version_number,
    effective_from: row.effective_from,
    mode: row.mode,
    calculation_base: row.calculation_base,
    value: row.value !== null ? Number(row.value) : null,
    apply_on: row.apply_on,
    excess_threshold: row.excess_threshold !== null ? Number(row.excess_threshold) : null,
    progressive: row.progressive,
    tiers,
  };
}

/** Slices [accumulated, accumulated + base] across the tiers; rates are percentage points. */
function sliceAcrossTiers(tiers: RuleTier[], accumulated: number, base: number) {
  const end = accumulated + base;
  return tiers
    .map((tier) => {
      const upper = tier.to_amount ?? Number.POSITIVE_INFINITY;
      const amountOn = Math.max(Math.min(end, upper) - Math.max(accumulated, tier.from_amount), 0);
      return {
        tier: tier.tier_number,
        from_amount: tier.from_amount,
        to_amount: tier.to_amount,
        rate: tier.rate,
        amount_on: roundMoney(amountOn),
        // Rounded per slice: the total is the sum of the recorded slices (calculation memory reconciles).
        commission: roundMoney((amountOn * tier.rate) / 100),
      };
    })
    .filter((slice) => slice.amount_on > 0);
}

/**
 * Pure calculation. Percent values are percentage points (3 -> 4 is +1 point).
 * `accumulatedBefore` is the seller's base already confirmed in the sale's
 * month; only used by progressive versions.
 */
export function calculateCommission(
  version: RuleVersion | null,
  sale: Pick<CommissionSaleInput, 'gross_amount' | 'margin_amount'>,
  accumulatedBefore = 0,
): CommissionCalculation {
  if (!version || version.mode === 'NONE') {
    return {
      pending_rule: true,
      snapshot: {
        rule_type: 'UNDEFINED',
        calc_version: ENGINE_CALC_VERSION,
        ...(version ? { rule_id: version.rule_id, rule_version_id: version.version_id } : {}),
      },
    };
  }

  const lineage = {
    calc_version: ENGINE_CALC_VERSION,
    rule_id: version.rule_id,
    rule_version_id: version.version_id,
    rule_version_number: version.version_number,
    effective_from: version.effective_from,
  };

  if (version.mode === 'FIXED') {
    const fixed = version.value ?? 0;
    return {
      pending_rule: false,
      calculation_type: 'FIXED',
      calculation_base: null,
      percentage: null,
      fixed_amount: fixed,
      amount: roundMoney(fixed),
      snapshot: { rule_type: 'FIXED', fixed_amount: fixed, ...lineage },
    };
  }

  const base = version.calculation_base === 'MARGIN' ? sale.margin_amount : sale.gross_amount;
  const calculationType = version.calculation_base === 'MARGIN' ? 'PERCENTAGE_ON_MARGIN' : 'PERCENTAGE_ON_GROSS';

  if (version.progressive) {
    const slices = sliceAcrossTiers(version.tiers, accumulatedBefore, base);
    const amount = roundMoney(slices.reduce((sum, slice) => sum + slice.commission, 0));
    return {
      pending_rule: false,
      calculation_type: calculationType,
      calculation_base: base,
      percentage: null,
      fixed_amount: null,
      amount,
      snapshot: {
        rule_type: calculationType,
        progressive: true,
        accumulated_before: accumulatedBefore,
        slices,
        ...lineage,
      },
    };
  }

  const rate = version.value ?? 0;
  const threshold = version.apply_on === 'EXCESS' ? (version.excess_threshold ?? 0) : 0;
  const computeOn = Math.max(base - threshold, 0);
  return {
    pending_rule: false,
    calculation_type: calculationType,
    calculation_base: base,
    percentage: rate,
    fixed_amount: null,
    amount: roundMoney((computeOn * rate) / 100),
    snapshot: {
      rule_type: calculationType,
      rate,
      apply_on: version.apply_on,
      ...(version.apply_on === 'EXCESS' ? { excess_threshold: threshold, computed_on: computeOn } : {}),
      ...lineage,
    },
  };
}

/**
 * Base the seller already confirmed in the civil month of `saleDate`
 * (sales not DRAFT/CANCELLED, other than `excludeSaleId`), restricted to the
 * rule's category when the rule has one. Calculated at confirmation time, so
 * it reflects exactly the sales confirmed before this one.
 */
async function monthlyAccumulatedBase(
  client: TenantClient,
  tenantId: string,
  version: RuleVersion,
  sale: CommissionSaleInput & { id: string },
): Promise<number> {
  const column = version.calculation_base === 'MARGIN' ? 'margin_amount' : 'gross_amount';
  const result = await client.query<{ total: string }>(
    `SELECT COALESCE(sum(${column}), 0)::text AS total
       FROM sales
      WHERE tenant_id = $1 AND seller_id = $2 AND id <> $3
        AND status IN ('CONFIRMED', 'PARTIALLY_PAID', 'PAID')
        AND date_trunc('month', sale_date) = date_trunc('month', $4::date)
        AND ($5::uuid IS NULL OR category_id = $5::uuid)`,
    [tenantId, sale.seller_id, sale.id, sale.sale_date, version.rule_category_id],
  );
  return Number(result.rows[0]?.total ?? 0);
}

/**
 * Selects the rule and calculates the commission of a sale. For progressive
 * rules it first takes a transaction-scoped advisory lock per seller+month so
 * two concurrent confirmations cannot read the same accumulated value.
 */
export async function computeCommissionForSale(
  client: TenantClient,
  tenantId: string,
  sale: CommissionSaleInput & { id: string },
): Promise<CommissionCalculation> {
  const version = await findApplicableVersion(client, tenantId, sale);
  let accumulated = 0;
  if (version?.progressive) {
    const month = await client.query<{ key: string }>(
      `SELECT $1::text || ':' || $2::text || ':' || to_char($3::date, 'YYYY-MM') AS key`,
      [tenantId, sale.seller_id, sale.sale_date],
    );
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [month.rows[0]!.key]);
    accumulated = await monthlyAccumulatedBase(client, tenantId, version, sale);
  }
  return calculateCommission(version, sale, accumulated);
}

export interface TierInput {
  from_amount: number;
  to_amount: number | null;
  rate: number;
}

export interface VersionInput {
  effective_from: string;
  mode: RuleVersion['mode'];
  calculation_base: RuleVersion['calculation_base'];
  value: number | null;
  apply_on: RuleVersion['apply_on'];
  excess_threshold: number | null;
  progressive?: boolean;
  tiers?: TierInput[];
  reason: string | null;
}

/** Appends a revision; the rule row is locked so version numbers never collide. */
export async function appendRuleVersion(
  client: TenantClient,
  tenantId: string,
  userId: string | null,
  ruleId: string,
  input: VersionInput,
): Promise<{ versionId: string; versionNumber: number }> {
  await client.query(`SELECT 1 FROM commission_rules WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [
    tenantId,
    ruleId,
  ]);
  const next = await client.query<{ n: number }>(
    `SELECT COALESCE(max(version_number), 0) + 1 AS n FROM commission_rule_versions
      WHERE tenant_id = $1 AND rule_id = $2`,
    [tenantId, ruleId],
  );
  const versionNumber = next.rows[0]!.n;
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO commission_rule_versions
       (tenant_id, rule_id, version_number, effective_from, revised_by, reason, mode,
        calculation_base, value, apply_on, excess_threshold, progressive)
     VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      tenantId,
      ruleId,
      versionNumber,
      input.effective_from,
      userId,
      input.reason,
      input.mode,
      input.calculation_base,
      input.value,
      input.apply_on,
      input.excess_threshold,
      input.progressive ?? false,
    ],
  );
  const versionId = inserted.rows[0]!.id;
  for (const [index, tier] of (input.tiers ?? []).entries()) {
    await client.query(
      `INSERT INTO commission_rule_tiers (tenant_id, version_id, tier_number, from_amount, to_amount, rate)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, versionId, index + 1, tier.from_amount, tier.to_amount, tier.rate],
    );
  }
  return { versionId, versionNumber };
}

/**
 * Legacy seller commission fields (PATCH /sellers) keep working: they are
 * mirrored into the seller-scope rule as a new revision. The first revision
 * applies from 1970-01-01 (same as the previous date-blind behavior);
 * later ones apply from today.
 */
export async function mirrorSellerRule(
  client: TenantClient,
  tenantId: string,
  userId: string | null,
  sellerId: string,
  rule: { ruleType: string; rate: number | null; fixedAmount: number | null },
): Promise<void> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM commission_rules
      WHERE tenant_id = $1 AND seller_id = $2 AND category_id IS NULL AND status = 'ACTIVE'`,
    [tenantId, sellerId],
  );
  let ruleId = existing.rows[0]?.id;
  if (!ruleId && rule.ruleType === 'UNDEFINED') return;
  if (!ruleId) {
    const created = await client.query<{ id: string }>(
      `INSERT INTO commission_rules (tenant_id, seller_id, name, created_by)
       VALUES ($1, $2, 'Regra do vendedor', $3) RETURNING id`,
      [tenantId, sellerId, userId],
    );
    ruleId = created.rows[0]!.id;
    await recordAuditEvent(client, {
      eventType: AUDIT_EVENTS.COMMISSION_RULE_CREATED,
      entityType: 'commission_rule',
      entityId: ruleId,
      metadata: { source: 'seller_legacy_fields', seller_id: sellerId },
    });
  }
  const hasVersions = await client.query(
    `SELECT 1 FROM commission_rule_versions WHERE tenant_id = $1 AND rule_id = $2 LIMIT 1`,
    [tenantId, ruleId],
  );
  const today = await client.query<{ d: string }>(`SELECT CURRENT_DATE::text AS d`);
  const isFixed = rule.ruleType === 'FIXED';
  const isNone = rule.ruleType === 'UNDEFINED';
  const appended = await appendRuleVersion(client, tenantId, userId, ruleId, {
    effective_from: (hasVersions.rowCount ?? 0) === 0 ? '1970-01-01' : today.rows[0]!.d,
    mode: isNone ? 'NONE' : isFixed ? 'FIXED' : 'PERCENTAGE',
    calculation_base: isNone || isFixed ? null : rule.ruleType === 'PERCENTAGE_ON_MARGIN' ? 'MARGIN' : 'GROSS',
    value: isNone ? null : isFixed ? rule.fixedAmount : rule.rate,
    apply_on: 'TOTAL',
    excess_threshold: null,
    reason: 'Alteração da regra no cadastro do vendedor',
  });
  await recordAuditEvent(client, {
    eventType: AUDIT_EVENTS.COMMISSION_RULE_REVISED,
    entityType: 'commission_rule',
    entityId: ruleId,
    metadata: { source: 'seller_legacy_fields', version: appended.versionNumber, mode: isNone ? 'NONE' : isFixed ? 'FIXED' : 'PERCENTAGE' },
  });
}
