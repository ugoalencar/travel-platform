import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { can, requirePermission } from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import { appendRuleVersion, type TierInput, type VersionInput } from '../commission-engine';
import type { LiteDatabase, TenantClient } from '../database';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { getTenantContext } from '../tenant-context';
import {
  optionalString,
  optionalUuid,
  parseObjectBody,
  requiredDate,
  requiredEnum,
  requiredString,
  requiredUuid,
} from '../validation';

const MODES = ['PERCENTAGE', 'FIXED', 'NONE'] as const;
const BASES = ['GROSS', 'MARGIN'] as const;
const APPLY_ON = ['TOTAL', 'EXCESS'] as const;

interface RuleRow {
  id: string;
  seller_id: string | null;
  category_id: string | null;
  name: string;
  status: string;
  created_at: string;
}

interface VersionRow {
  id: string;
  version_number: number;
  effective_from: string;
  revised_at: string;
  revised_by: string | null;
  reason: string | null;
  mode: string;
  calculation_base: string | null;
  value: string | null;
  apply_on: string;
  excess_threshold: string | null;
  progressive: boolean;
  tiers: Array<{ tier_number: number; from_amount: number; to_amount: number | null; rate: number }> | null;
}

function nonNegativeNumber(source: Record<string, unknown>, field: string, maxDecimals: number): number {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ValidationError(`Field ${field} must be a non-negative number`);
  }
  const factor = 10 ** maxDecimals;
  if (Math.round(value * factor) / factor !== value) {
    throw new ValidationError(`Field ${field} accepts at most ${maxDecimals} decimal places`);
  }
  return value;
}

/**
 * Progressive tiers: 2..10 contiguous bands starting at 0, the last one open
 * ended. Rates are percentage points (4 -> 5 is +1 point).
 */
function parseTiers(body: Record<string, unknown>): TierInput[] {
  const raw = body.tiers;
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 10) {
    throw new ValidationError('Field tiers must list between 2 and 10 tiers');
  }
  const tiers = raw.map((item, index): TierInput => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new ValidationError(`Tier ${index + 1} must be an object`);
    }
    const tier = item as Record<string, unknown>;
    const rate = nonNegativeNumber(tier, 'rate', 4);
    if (rate > 100) throw new ValidationError(`Tier ${index + 1}: rate cannot exceed 100`);
    return {
      from_amount: nonNegativeNumber(tier, 'from_amount', 2),
      to_amount: tier.to_amount === null || tier.to_amount === undefined ? null : nonNegativeNumber(tier, 'to_amount', 2),
      rate,
    };
  });
  tiers.forEach((tier, index) => {
    const last = index === tiers.length - 1;
    if (index === 0 && tier.from_amount !== 0) throw new ValidationError('The first tier must start at 0');
    if (index > 0 && tier.from_amount !== tiers[index - 1]!.to_amount) {
      throw new ValidationError(`Tier ${index + 1} must start where tier ${index} ends`);
    }
    if (last && tier.to_amount !== null) throw new ValidationError('The last tier must be open ended (to_amount null)');
    if (!last && (tier.to_amount === null || tier.to_amount <= tier.from_amount)) {
      throw new ValidationError(`Tier ${index + 1}: to_amount must be greater than from_amount`);
    }
  });
  return tiers;
}

/** Coherent, allowlist-parsed rule version (mirrors the CHECKs in 009/010). */
function parseVersion(body: Record<string, unknown>, reasonRequired: boolean): VersionInput {
  const mode = requiredEnum(body, 'mode', MODES);
  const applyOn = optionalApply(body);
  if ('progressive' in body && typeof body.progressive !== 'boolean') {
    throw new ValidationError('Field progressive must be a boolean');
  }
  const progressive = body.progressive === true;
  if (!progressive && 'tiers' in body) throw new ValidationError('Field tiers requires progressive true');
  if (progressive && mode !== 'PERCENTAGE') throw new ValidationError('Progressive rules require mode PERCENTAGE');
  const reason = reasonRequired
    ? requiredString(body, 'reason', { max: 500 })
    : optionalString(body, 'reason', { max: 500 });
  if (reasonRequired && reason !== null && reason.length < 3) {
    throw new ValidationError('Field reason must be at least 3 characters');
  }
  const effectiveFrom = requiredDate(body, 'effective_from');

  if (mode === 'NONE') {
    if ('value' in body || 'calculation_base' in body || 'excess_threshold' in body || applyOn === 'EXCESS') {
      throw new ValidationError('Mode NONE does not accept value, base, or excess settings');
    }
    return { effective_from: effectiveFrom, mode, calculation_base: null, value: null, apply_on: 'TOTAL', excess_threshold: null, reason };
  }
  if (mode === 'FIXED') {
    if ('calculation_base' in body || 'excess_threshold' in body || applyOn === 'EXCESS') {
      throw new ValidationError('Mode FIXED accepts only a fixed value');
    }
    return { effective_from: effectiveFrom, mode, calculation_base: null, value: nonNegativeNumber(body, 'value', 2), apply_on: 'TOTAL', excess_threshold: null, reason };
  }
  if (progressive) {
    if (applyOn === 'EXCESS' || 'excess_threshold' in body || 'value' in body) {
      throw new ValidationError('Progressive rules accept only tiers (no value, apply_on EXCESS or excess_threshold)');
    }
    const tiers = parseTiers(body);
    return {
      effective_from: effectiveFrom,
      mode,
      calculation_base: requiredEnum(body, 'calculation_base', BASES),
      value: tiers[0]!.rate,
      apply_on: 'TOTAL',
      excess_threshold: null,
      progressive: true,
      tiers,
      reason,
    };
  }
  const value = nonNegativeNumber(body, 'value', 4);
  if (value > 100) throw new ValidationError('Field value is a percentage and cannot exceed 100');
  const threshold = applyOn === 'EXCESS' ? nonNegativeNumber(body, 'excess_threshold', 2) : null;
  if (applyOn === 'TOTAL' && 'excess_threshold' in body && body.excess_threshold !== null) {
    throw new ValidationError('Field excess_threshold requires apply_on EXCESS');
  }
  return {
    effective_from: effectiveFrom,
    mode,
    calculation_base: requiredEnum(body, 'calculation_base', BASES),
    value,
    apply_on: applyOn,
    excess_threshold: threshold,
    reason,
  };
}

function optionalApply(body: Record<string, unknown>): 'TOTAL' | 'EXCESS' {
  const value = optionalString(body, 'apply_on');
  if (value === null) return 'TOTAL';
  if (!(APPLY_ON as readonly string[]).includes(value)) {
    throw new ValidationError(`Field apply_on must be one of: ${APPLY_ON.join(', ')}`);
  }
  return value as 'TOTAL' | 'EXCESS';
}

function serializeVersion(row: VersionRow) {
  return {
    ...row,
    value: row.value !== null ? Number(row.value) : null,
    excess_threshold: row.excess_threshold !== null ? Number(row.excess_threshold) : null,
    tiers: row.tiers ?? [],
  };
}

async function today(client: TenantClient): Promise<string> {
  const result = await client.query<{ d: string }>(`SELECT CURRENT_DATE::text AS d`);
  return result.rows[0]!.d;
}

/** No retroactivity in this phase: a revision never starts before today. */
async function assertNotRetroactive(
  client: TenantClient,
  tenantId: string,
  ruleId: string | null,
  effectiveFrom: string,
): Promise<void> {
  if (effectiveFrom < (await today(client))) {
    throw new ValidationError('Retroactive effective_from is not supported; use a date from today on');
  }
  if (ruleId) {
    const latest = await client.query<{ d: string | null }>(
      `SELECT max(effective_from)::text AS d FROM commission_rule_versions WHERE tenant_id = $1 AND rule_id = $2`,
      [tenantId, ruleId],
    );
    const latestDate = latest.rows[0]?.d;
    if (latestDate && effectiveFrom < latestDate) {
      throw new ValidationError(`effective_from cannot be earlier than the latest revision (${latestDate})`);
    }
  }
}

export function registerCommissionRuleRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  /** Managers see everything; others only the rules that can apply to their own seller. */
  function visibility(): { all: boolean; sellerId: string | null } {
    const context = getTenantContext();
    if (can(context, 'commissions.rules_manage') || can(context, 'commissions.read_all')) {
      return { all: true, sellerId: null };
    }
    if (can(context, 'commissions.read_own')) return { all: false, sellerId: context.sellerId };
    throw new ForbiddenError('Requires permission commissions.rules_manage, commissions.read_all or commissions.read_own');
  }

  async function loadVersions(client: TenantClient, tenantId: string, ruleId: string): Promise<VersionRow[]> {
    const result = await client.query<VersionRow>(
      `SELECT id, version_number, effective_from::text AS effective_from, revised_at, revised_by, reason,
              mode, calculation_base, value::text AS value, apply_on, excess_threshold::text AS excess_threshold,
              progressive, (SELECT json_agg(json_build_object('tier_number', t.tier_number, 'from_amount', t.from_amount, 'to_amount', t.to_amount, 'rate', t.rate) ORDER BY t.tier_number) FROM commission_rule_tiers t WHERE t.tenant_id = cv.tenant_id AND t.version_id = cv.id) AS tiers
         FROM commission_rule_versions cv WHERE tenant_id = $1 AND rule_id = $2
        ORDER BY version_number DESC`,
      [tenantId, ruleId],
    );
    return result.rows;
  }

  async function loadVisibleRule(client: TenantClient, tenantId: string, id: string): Promise<RuleRow> {
    const scope = visibility();
    const result = await client.query<RuleRow>(
      `SELECT id, seller_id, category_id, name, status, created_at FROM commission_rules
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    const rule = result.rows[0];
    if (!rule || (!scope.all && rule.seller_id !== null && rule.seller_id !== scope.sellerId)) {
      throw new NotFoundError('Commission rule not found');
    }
    return rule;
  }

  app.get('/commission-rules', { preHandler: protectedHooks }, async () => {
    const context = getTenantContext();
    const scope = visibility();
    const params: unknown[] = [context.tenantId];
    let filter = '';
    if (!scope.all) {
      params.push(scope.sellerId);
      filter = ' AND (r.seller_id IS NULL OR r.seller_id = $2)';
    }
    const items = await database.withTenantTransaction(async (client) => {
      const rules = await client.query<RuleRow & Partial<VersionRow>>(
        `SELECT r.id, r.seller_id, r.category_id, r.name, r.status, r.created_at,
                v.id AS version_id, v.version_number, v.effective_from::text AS effective_from, v.mode,
                v.calculation_base, v.value::text AS value, v.apply_on, v.excess_threshold::text AS excess_threshold,
                v.progressive, (SELECT json_agg(json_build_object('tier_number', t.tier_number, 'from_amount', t.from_amount, 'to_amount', t.to_amount, 'rate', t.rate) ORDER BY t.tier_number) FROM commission_rule_tiers t WHERE t.tenant_id = v.tenant_id AND t.version_id = v.id) AS tiers
           FROM commission_rules r
           LEFT JOIN LATERAL (
             SELECT * FROM commission_rule_versions cv
              WHERE cv.tenant_id = r.tenant_id AND cv.rule_id = r.id
              ORDER BY cv.effective_from DESC, cv.version_number DESC LIMIT 1) v ON true
          WHERE r.tenant_id = $1${filter}
          ORDER BY r.status, r.created_at DESC`,
        params,
      );
      return rules.rows;
    });
    return {
      items: items.map((row) => ({
        ...row,
        value: row.value != null ? Number(row.value) : null,
        excess_threshold: row.excess_threshold != null ? Number(row.excess_threshold) : null,
        tiers: row.tiers ?? [],
      })),
    };
  });

  app.get('/commission-rules/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const id = requiredUuid({ id: (request.params as { id: string }).id }, 'id');
    return database.withTenantTransaction(async (client) => {
      const rule = await loadVisibleRule(client, context.tenantId, id);
      const versions = await loadVersions(client, context.tenantId, id);
      return { rule, versions: versions.map(serializeVersion) };
    });
  });

  app.post('/commission-rules', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'commissions.rules_manage');
    const body = parseObjectBody(request.body);
    const name = requiredString(body, 'name', { max: 200 });
    const sellerId = optionalUuid(body, 'seller_id');
    const categoryId = optionalUuid(body, 'category_id');
    const version = parseVersion(body, false);

    const created = await database.withTenantTransaction(async (client) => {
      await assertNotRetroactive(client, context.tenantId, null, version.effective_from);
      if (sellerId) {
        const seller = await client.query(`SELECT 1 FROM sellers WHERE tenant_id = $1 AND id = $2`, [context.tenantId, sellerId]);
        if ((seller.rowCount ?? 0) === 0) throw new ValidationError('Field seller_id must reference a seller of this tenant');
      }
      if (categoryId) {
        const category = await client.query(`SELECT 1 FROM sale_categories WHERE tenant_id = $1 AND id = $2`, [context.tenantId, categoryId]);
        if ((category.rowCount ?? 0) === 0) throw new ValidationError('Field category_id must reference a category of this tenant');
      }
      const existing = await client.query(
        `SELECT 1 FROM commission_rules
          WHERE tenant_id = $1 AND status = 'ACTIVE'
            AND seller_id IS NOT DISTINCT FROM $2::uuid AND category_id IS NOT DISTINCT FROM $3::uuid`,
        [context.tenantId, sellerId, categoryId],
      );
      if ((existing.rowCount ?? 0) > 0) {
        throw new ConflictError('An active rule already exists for this seller/category scope; add a revision instead');
      }
      const rule = await client.query<{ id: string }>(
        `INSERT INTO commission_rules (tenant_id, seller_id, category_id, name, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [context.tenantId, sellerId, categoryId, name, context.userId],
      );
      const ruleId = rule.rows[0]!.id;
      const appended = await appendRuleVersion(client, context.tenantId, context.userId, ruleId, version);
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.COMMISSION_RULE_CREATED,
        entityType: 'commission_rule',
        entityId: ruleId,
        metadata: { version: appended.versionNumber, effective_from: version.effective_from, mode: version.mode },
      });
      return { id: ruleId, version_id: appended.versionId };
    });

    reply.code(201);
    return created;
  });

  app.post('/commission-rules/:id/versions', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'commissions.rules_manage');
    const id = requiredUuid({ id: (request.params as { id: string }).id }, 'id');
    const version = parseVersion(parseObjectBody(request.body), true);

    const created = await database.withTenantTransaction(async (client) => {
      const locked = await client.query<{ status: string }>(
        `SELECT status FROM commission_rules WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [context.tenantId, id],
      );
      if (!locked.rows[0]) throw new NotFoundError('Commission rule not found');
      if (locked.rows[0].status !== 'ACTIVE') throw new ConflictError('An archived rule cannot be revised');
      await assertNotRetroactive(client, context.tenantId, id, version.effective_from);
      const appended = await appendRuleVersion(client, context.tenantId, context.userId, id, version);
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.COMMISSION_RULE_REVISED,
        entityType: 'commission_rule',
        entityId: id,
        metadata: { version: appended.versionNumber, effective_from: version.effective_from, mode: version.mode },
      });
      return { version_id: appended.versionId, version_number: appended.versionNumber };
    });

    reply.code(201);
    return created;
  });

  app.post('/commission-rules/:id/archive', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'commissions.rules_manage');
    const id = requiredUuid({ id: (request.params as { id: string }).id }, 'id');

    await database.withTenantTransaction(async (client) => {
      const result = await client.query(
        `UPDATE commission_rules SET status = 'ARCHIVED', updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE'`,
        [context.tenantId, id],
      );
      if ((result.rowCount ?? 0) === 0) throw new NotFoundError('Active commission rule not found');
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.COMMISSION_RULE_ARCHIVED,
        entityType: 'commission_rule',
        entityId: id,
      });
    });
    return { ok: true };
  });
}
