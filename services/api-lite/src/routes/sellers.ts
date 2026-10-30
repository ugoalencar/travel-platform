import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { computeCommissionForSale, mirrorSellerRule } from '../commission-engine';
import { can, requirePermission } from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import type { LiteDatabase, TenantClient } from '../database';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { enqueueOutboxEvent } from '../outbox';
import { getTenantContext } from '../tenant-context';
import {
  optionalEnum,
  optionalString,
  optionalUuid,
  parseObjectBody,
  requiredAmount,
  requiredString,
} from '../validation';
import { isValidCpf, normalizeCpf } from '../validation/cpf';

const MAX_PAGE_SIZE = 100;
const COMMISSION_RULE_TYPES = ['UNDEFINED', 'PERCENTAGE_ON_GROSS', 'PERCENTAGE_ON_MARGIN', 'FIXED'] as const;
type CommissionRuleType = (typeof COMMISSION_RULE_TYPES)[number];

interface SellerRow {
  id: string;
  user_id: string | null;
  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  commission_rule_type: string;
  commission_rate: string | null;
  commission_fixed_amount: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = `id, user_id, name, cpf, phone, email, status,
  commission_rule_type, commission_rate, commission_fixed_amount,
  created_at, updated_at`;

interface CommissionFields {
  ruleType: CommissionRuleType;
  rate: number | null;
  fixedAmount: number | null;
}

/**
 * Reads the commission rule coherently: UNDEFINED carries no values,
 * percentages carry a rate, FIXED carries a fixed amount. Mirrors the
 * CHECK constraints in 001_initial_schema.sql but fails with a legible
 * 400 instead of a database error.
 */
function parseCommissionFields(body: Record<string, unknown>): CommissionFields {
  const ruleType =
    optionalEnum(body, 'commission_rule_type', COMMISSION_RULE_TYPES) ?? 'UNDEFINED';

  if (ruleType === 'UNDEFINED') {
    if ('commission_rate' in body || 'commission_fixed_amount' in body) {
      throw new ValidationError('Commission rule UNDEFINED does not accept rate or fixed amount');
    }
    return { ruleType, rate: null, fixedAmount: null };
  }
  if (ruleType === 'FIXED') {
    if (!('commission_fixed_amount' in body)) {
      throw new ValidationError('Commission rule FIXED requires commission_fixed_amount');
    }
    return { ruleType, rate: null, fixedAmount: requiredAmount(body, 'commission_fixed_amount') };
  }
  if (!('commission_rate' in body)) {
    throw new ValidationError(`Commission rule ${ruleType} requires commission_rate`);
  }
  return { ruleType, rate: requiredAmount(body, 'commission_rate'), fixedAmount: null };
}

function parseOptionalCpf(body: Record<string, unknown>): string | null {
  const raw = optionalString(body, 'cpf', { max: 14 });
  if (raw === null) return null;
  if (!isValidCpf(raw)) {
    throw new ValidationError('Field cpf must be a valid CPF');
  }
  return normalizeCpf(raw);
}

async function assertSellerCpfAvailable(
  client: TenantClient,
  tenantId: string,
  cpf: string,
  excludeId?: string,
): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM sellers WHERE tenant_id = $1 AND cpf = $2 AND ($3::uuid IS NULL OR id <> $3)`,
    [tenantId, cpf, excludeId ?? null],
  );
  if ((result.rowCount ?? 0) > 0) {
    throw new ConflictError('A seller with this CPF already exists');
  }
}

/** A login may represent at most one seller (uq_sellers_tenant_user). */
async function assertUserLinkable(
  client: TenantClient,
  tenantId: string,
  userId: string,
  sellerId?: string,
): Promise<void> {
  const result = await client.query(`SELECT 1 FROM users WHERE tenant_id = $1 AND id = $2`, [
    tenantId,
    userId,
  ]);
  if ((result.rowCount ?? 0) === 0) {
    throw new ValidationError('Field user_id must reference a user of this tenant');
  }
  const linked = await client.query(
    `SELECT 1 FROM sellers WHERE tenant_id = $1 AND user_id = $2 AND ($3::uuid IS NULL OR id <> $3)`,
    [tenantId, userId, sellerId ?? null],
  );
  if ((linked.rowCount ?? 0) > 0) {
    throw new ConflictError('This user is already linked to another seller');
  }
}

/**
 * The legacy commission fields of a seller write commission rules (mirrorSellerRule), so they need the
 * same permission as the rules API; sellers.manage alone must not be a way around it.
 */
function requireRulesPermission(body: Record<string, unknown>): void {
  if ('commission_rule_type' in body || 'commission_rate' in body || 'commission_fixed_amount' in body) {
    requirePermission(getTenantContext(), 'commissions.rules_manage');
  }
}

/** Linking a login to a seller changes that login's data scope. */
function requireLinkPermission(body: Record<string, unknown>): void {
  if ('user_id' in body) requirePermission(getTenantContext(), 'users.manage');
}

/**
 * When the seller finally has a rule, every commission stuck in
 * PENDING_RULE is resolved to PENDING with a fresh calculation.
 * Already-valued commissions are never touched (snapshot semantics).
 */
async function recalculatePendingRuleCommissions(
  client: TenantClient,
  tenantId: string,
  sellerId: string,
): Promise<void> {
  const pending = await client.query<{
    id: string;
    sale_id: string;
    category_id: string;
    sale_date: string;
    gross_amount: string;
    margin_amount: string;
  }>(
    `SELECT sc.id, sc.sale_id, s.category_id, s.sale_date::text AS sale_date, s.gross_amount, s.margin_amount
       FROM seller_commissions sc
       JOIN sales s ON s.tenant_id = sc.tenant_id AND s.id = sc.sale_id
      WHERE sc.tenant_id = $1 AND sc.seller_id = $2 AND sc.status = 'PENDING_RULE'`,
    [tenantId, sellerId],
  );

  for (const row of pending.rows) {
    const calculation = await computeCommissionForSale(client, tenantId, {
      id: row.sale_id,
      seller_id: sellerId,
      category_id: row.category_id,
      sale_date: row.sale_date,
      gross_amount: Number(row.gross_amount),
      margin_amount: Number(row.margin_amount),
    });
    if (calculation.pending_rule) continue;
    const amount = calculation.amount;
    await client.query(
      `UPDATE seller_commissions
          SET calculation_type = $3, calculation_base = $4, percentage = $5,
              fixed_amount = $6, commission_amount = $7, status = 'PENDING',
              rule_snapshot = $8::jsonb, updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [
        tenantId,
        row.id,
        calculation.calculation_type,
        calculation.calculation_base,
        calculation.percentage,
        calculation.fixed_amount,
        amount,
        JSON.stringify({ ...calculation.snapshot, recalculated: true }),
      ],
    );
    await recordAuditEvent(client, {
      eventType: AUDIT_EVENTS.COMMISSION_RECALCULATED,
      entityType: 'seller_commission',
      entityId: row.id,
      metadata: { amount },
    });
    await enqueueOutboxEvent(client, {
      eventType: 'COMMISSION_UPDATED',
      entityType: 'seller_commission',
      entityId: row.id,
      payload: { commission_amount: amount, recalculated: true },
    });
  }
}

export function registerSellerRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/sellers', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const query = (request.query ?? {}) as Record<string, string | undefined>;

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || 20));
    const search = query.search?.trim() || null;
    const status = optionalEnum({ status: query.status ?? null }, 'status', ['ACTIVE', 'INACTIVE'] as const);

    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [context.tenantId];
    // Without sellers.read a user only sees the seller linked to their login.
    if (!can(context, 'sellers.read')) {
      params.push(context.sellerId);
      conditions.push(`id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const p = params.length;
      conditions.push(`(name ILIKE $${p} OR email ILIKE $${p})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    const where = conditions.join(' AND ');

    const result = await database.withTenantTransaction(async (client) => {
      const countResult = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM sellers WHERE ${where}`,
        params,
      );
      const pageResult = await client.query<SellerRow>(
        `SELECT ${SELECT_COLUMNS} FROM sellers WHERE ${where}
          ORDER BY name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize],
      );
      return { items: pageResult.rows, total: countResult.rows[0]?.total ?? 0 };
    });
    return {
      items: result.items,
      page,
      pageSize,
      total: result.total,
    };
  });

  app.get('/sellers/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const { id } = request.params as { id: string };
    const result = await database.withTenantTransaction((client) =>
      client.query<SellerRow>(
        `SELECT ${SELECT_COLUMNS} FROM sellers WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, id],
      ),
    );
    const seller = result.rows[0];
    if (!seller || (!can(context, 'sellers.read') && seller.id !== context.sellerId)) {
      throw new NotFoundError('Seller not found');
    }
    return { seller };
  });

  app.post('/sellers', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'sellers.manage');
    const body = parseObjectBody(request.body);
    requireLinkPermission(body);

    const name = requiredString(body, 'name', { max: 200 });
    const cpf = parseOptionalCpf(body);
    const commission = parseCommissionFields(body);
    requireRulesPermission(body);
    const userId = optionalUuid(body, 'user_id');

    const seller = await database.withTenantTransaction(async (client) => {
      if (cpf) await assertSellerCpfAvailable(client, context.tenantId, cpf);
      if (userId) await assertUserLinkable(client, context.tenantId, userId);
      const result = await client.query<SellerRow>(
        `INSERT INTO sellers (tenant_id, user_id, name, cpf, phone, email,
                              commission_rule_type, commission_rate, commission_fixed_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${SELECT_COLUMNS}`,
        [
          context.tenantId,
          userId,
          name,
          cpf,
          optionalString(body, 'phone', { max: 40 }),
          optionalString(body, 'email', { max: 254 }),
          commission.ruleType,
          commission.rate,
          commission.fixedAmount,
        ],
      );
      const created = result.rows[0]!;
      await mirrorSellerRule(client, context.tenantId, context.userId, created.id, commission);
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.SELLER_CREATED,
        entityType: 'seller',
        entityId: created.id,
      });
      await enqueueOutboxEvent(client, {
        eventType: 'SELLER_CREATED',
        entityType: 'seller',
        entityId: created.id,
        payload: { name: created.name },
      });
      return created;
    });

    reply.code(201);
    return { seller };
  });

  app.patch('/sellers/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'sellers.manage');
    const { id } = request.params as { id: string };
    const body = parseObjectBody(request.body);
    requireLinkPermission(body);

    const updates: string[] = [];
    const params: unknown[] = [context.tenantId, id];

    function set(column: string, value: unknown): void {
      params.push(value);
      updates.push(`${column} = $${params.length}`);
    }

    const cpfProvided = 'cpf' in body;
    const cpfValue = cpfProvided ? parseOptionalCpf(body) : null;
    const commissionProvided =
      'commission_rule_type' in body ||
      'commission_rate' in body ||
      'commission_fixed_amount' in body;
    if (commissionProvided && !('commission_rule_type' in body)) {
      throw new ValidationError(
        'Commission changes must include commission_rule_type (rule changes are not partial)',
      );
    }
    const commission = commissionProvided ? parseCommissionFields(body) : null;
    requireRulesPermission(body);

    if ('name' in body) set('name', requiredString(body, 'name', { max: 200 }));
    if (cpfProvided) set('cpf', cpfValue);
    if ('phone' in body) set('phone', optionalString(body, 'phone', { max: 40 }));
    if ('email' in body) set('email', optionalString(body, 'email', { max: 254 }));
    if ('status' in body) {
      const status = optionalEnum(body, 'status', ['ACTIVE', 'INACTIVE'] as const);
      if (status === null) throw new ValidationError('Field status is required');
      set('status', status);
    }
    if ('user_id' in body) set('user_id', optionalUuid(body, 'user_id'));
    if (commission) {
      set('commission_rule_type', commission.ruleType);
      set('commission_rate', commission.rate);
      set('commission_fixed_amount', commission.fixedAmount);
    }

    if (updates.length === 0) {
      throw new ValidationError('At least one field is required');
    }

    const seller = await database.withTenantTransaction(async (client) => {
      if (cpfProvided && cpfValue) await assertSellerCpfAvailable(client, context.tenantId, cpfValue, id);
      if ('user_id' in body) {
        const userId = optionalUuid(body, 'user_id');
        if (userId) await assertUserLinkable(client, context.tenantId, userId, id);
      }
      updates.push('updated_at = now()');
      const result = await client.query<SellerRow>(
        `UPDATE sellers SET ${updates.join(', ')} WHERE tenant_id = $1 AND id = $2
         RETURNING ${SELECT_COLUMNS}`,
        params,
      );
      const updated = result.rows[0];
      if (!updated) throw new NotFoundError('Seller not found');
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.SELLER_UPDATED,
        entityType: 'seller',
        entityId: updated.id,
      });
      await enqueueOutboxEvent(client, {
        eventType: 'SELLER_UPDATED',
        entityType: 'seller',
        entityId: updated.id,
        payload: { name: updated.name },
      });
      if (commission) {
        await mirrorSellerRule(client, context.tenantId, context.userId, id, commission);
        if (commission.ruleType !== 'UNDEFINED') {
          await recalculatePendingRuleCommissions(client, context.tenantId, id);
        }
      }
      return updated;
    });

    return { seller };
  });

  app.delete('/sellers/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'sellers.manage');
    const { id } = request.params as { id: string };

    await database.withTenantTransaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `UPDATE sellers SET status = 'INACTIVE', updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND status <> 'INACTIVE'
          RETURNING id`,
        [context.tenantId, id],
      );
      if (!result.rows[0]) throw new NotFoundError('Seller not found');
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.SELLER_UPDATED,
        entityType: 'seller',
        entityId: id,
        metadata: { status: 'INACTIVE' },
      });
      await enqueueOutboxEvent(client, {
        eventType: 'SELLER_UPDATED',
        entityType: 'seller',
        entityId: id,
        payload: { status: 'INACTIVE' },
      });
    });

    return { ok: true };
  });
}
