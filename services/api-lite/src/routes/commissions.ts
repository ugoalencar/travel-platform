import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { effectiveSellerFilter, requirePermission, scopeCondition, scopeFor } from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import type { LiteDatabase, TenantClient } from '../database';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { enqueueOutboxEvent } from '../outbox';
import { getTenantContext } from '../tenant-context';
import { optionalDate, optionalEnum, optionalString, optionalUuid, parseObjectBody, requiredPositiveAmount } from '../validation';

const MAX_PAGE_SIZE = 100;
const COMMISSION_STATUSES = ['PENDING_RULE', 'PENDING', 'APPROVED', 'PAID', 'CANCELLED'] as const;

interface CommissionListItem {
  id: string;
  sale_id: string;
  seller_id: string;
  calculation_type: string | null;
  calculation_base: string | null;
  percentage: string | null;
  fixed_amount: string | null;
  commission_amount: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
  seller_name: string;
  sale_number: string;
  payable_id: string | null;
  payable_status: string | null;
  release_mode: string;
  released_amount: string | null;
}

function serializeCommission(row: CommissionListItem) {
  return {
    ...row,
    calculation_base: row.calculation_base ? Number(row.calculation_base) : null,
    percentage: row.percentage ? Number(row.percentage) : null,
    fixed_amount: row.fixed_amount ? Number(row.fixed_amount) : null,
    commission_amount: row.commission_amount !== null ? Number(row.commission_amount) : null,
    released_amount: row.released_amount !== null ? Number(row.released_amount) : null,
  };
}

async function loadCommissionForUpdate(
  client: TenantClient,
  tenantId: string,
  id: string,
): Promise<{
  id: string;
  sale_id: string;
  seller_id: string;
  status: string;
  commission_amount: string | null;
}> {
  const result = await client.query<{
    id: string;
    sale_id: string;
    seller_id: string;
    status: string;
    commission_amount: string | null;
  }>(
    `SELECT id, sale_id, seller_id, status, commission_amount
       FROM seller_commissions WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [tenantId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Commission not found');
  return row;
}

export function registerCommissionRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/commissions', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const query = (request.query ?? {}) as Record<string, string | undefined>;

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || 20));

    const conditions: string[] = ['sc.tenant_id = $1'];
    const params: unknown[] = [context.tenantId];

    function addCondition(column: string, operator: string, value: unknown): void {
      params.push(value);
      conditions.push(`${column} ${operator} $${params.length}`);
    }

    if (query.status) {
      addCondition('sc.status', '=', optionalEnum({ status: query.status }, 'status', COMMISSION_STATUSES));
    }
    const scope = scopeFor(context, 'commissions.read_all', 'commissions.read_own');
    const sellerFilter = effectiveSellerFilter(
      scope,
      optionalUuid({ seller_id: query.seller_id ?? null }, 'seller_id'),
    );
    const scoped = scopeCondition(scope, 'sc.seller_id', params);
    if (scoped) conditions.push(scoped);
    else if (sellerFilter) addCondition('sc.seller_id', '=', sellerFilter);
    const where = conditions.join(' AND ');

    const result = await database.withTenantTransaction(async (client) => {
      const countResult = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM seller_commissions sc WHERE ${where}`,
        params,
      );
      const pageResult = await client.query<CommissionListItem>(
        `SELECT sc.id, sc.sale_id, sc.seller_id, sc.calculation_type, sc.calculation_base,
                sc.percentage, sc.fixed_amount, sc.commission_amount, sc.status, sc.paid_at,
                sc.created_at,
                se.name AS seller_name, s.sale_number,
                p.id AS payable_id, p.status AS payable_status, sc.release_mode,
                CASE WHEN sc.commission_amount IS NULL THEN NULL
                     WHEN sc.release_mode = 'BLOCKED' THEN 0
                     WHEN sc.release_mode = 'ON_SALE' THEN sc.commission_amount
                     ELSE round(sc.commission_amount * LEAST(COALESCE(rc.received / NULLIF(rc.total, 0), 0), 1), 2)
                END AS released_amount
           FROM seller_commissions sc
           LEFT JOIN LATERAL (
             SELECT sum(r.paid_amount) AS received, sum(r.amount) AS total FROM receivables r
              WHERE r.tenant_id = sc.tenant_id AND r.sale_id = sc.sale_id AND r.status <> 'CANCELLED'
           ) rc ON true
           JOIN sellers se ON se.tenant_id = sc.tenant_id AND se.id = sc.seller_id
           JOIN sales s ON s.tenant_id = sc.tenant_id AND s.id = sc.sale_id
           LEFT JOIN payables p ON p.tenant_id = sc.tenant_id AND p.commission_id = sc.id
          WHERE ${where}
          ORDER BY sc.created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize],
      );
      return { items: pageResult.rows, total: countResult.rows[0]?.total ?? 0 };
    });

    return {
      items: result.items.map(serializeCommission),
      page,
      pageSize,
      total: result.total,
    };
  });

  /**
   * PENDING -> APPROVED and materializes the payment obligation as a
   * payable (payments must allocate to exactly one receivable/payable).
   * The commission is finalized to PAID when that payable is paid.
   */
  app.post('/commissions/:id/approve', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'commissions.approve');
    const { id } = request.params as { id: string };
    const body = parseObjectBody(request.body ?? {});
    let dueAt = new Date().toISOString().slice(0, 10);
    if ('due_at' in body) {
      dueAt = optionalDate(body, 'due_at') ?? '';
      if (dueAt === '') throw new ValidationError('Field due_at is required');
    }

    await database.withTenantTransaction(async (client) => {
      const commission = await loadCommissionForUpdate(client, context.tenantId, id);
      if (commission.status === 'PENDING_RULE') {
        throw new ConflictError('A commission without a rule must be resolved before approval');
      }
      if (commission.status !== 'PENDING') {
        throw new ConflictError(`Only PENDING commissions can be approved (current: ${commission.status})`);
      }

      const details = await client.query<{
        seller_name: string;
        sale_number: string;
        commission_amount: string;
      }>(
        `SELECT se.name AS seller_name, s.sale_number, sc.commission_amount
           FROM seller_commissions sc
           JOIN sellers se ON se.tenant_id = sc.tenant_id AND se.id = sc.seller_id
           JOIN sales s ON s.tenant_id = sc.tenant_id AND s.id = sc.sale_id
          WHERE sc.tenant_id = $1 AND sc.id = $2`,
        [context.tenantId, id],
      );
      const info = details.rows[0]!;

      await client.query(
        `UPDATE seller_commissions SET status = 'APPROVED', updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, id],
      );
      await client.query(
        `INSERT INTO payables (tenant_id, seller_id, commission_id, description, amount, due_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          context.tenantId,
          commission.seller_id,
          id,
          `Comissão ${info.seller_name} - ${info.sale_number}`,
          Number(info.commission_amount),
          dueAt,
        ],
      );
      const payable = await client.query<{ id: string }>(
        `SELECT id FROM payables WHERE tenant_id = $1 AND commission_id = $2`,
        [context.tenantId, id],
      );
      await enqueueOutboxEvent(client, {
        eventType: 'PAYABLE_CREATED',
        entityType: 'payable',
        entityId: payable.rows[0]!.id,
        payload: { commission_id: id, amount: Number(info.commission_amount) },
      });
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.COMMISSION_APPROVED,
        entityType: 'seller_commission',
        entityId: id,
      });
    });

    return { ok: true };
  });

  /**
   * Manual override: sets/adjusts the value with calculation_type MANUAL.
   * Also the resolution path for PENDING_RULE commissions.
   */
  app.patch('/commissions/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'commissions.approve');
    const { id } = request.params as { id: string };
    const body = parseObjectBody(request.body);

    const amount = requiredPositiveAmount(body, 'commission_amount');
    const notes = optionalString(body, 'notes', { max: 2000 });

    await database.withTenantTransaction(async (client) => {
      const commission = await loadCommissionForUpdate(client, context.tenantId, id);
      // Once approved the amount is bound to a payment obligation; changing only the commission would let
      // the payable (and the money paid) diverge from it. Adjusting an approved commission needs a
      // traceable adjustment entry (spec section 6), which does not exist yet, so it is refused.
      if (commission.status !== 'PENDING_RULE' && commission.status !== 'PENDING') {
        throw new ConflictError(
          `A ${commission.status} commission cannot be overridden; only PENDING or PENDING_RULE commissions can`,
        );
      }

      await client.query(
        `UPDATE seller_commissions
            SET calculation_type = 'MANUAL',
                commission_amount = $3,
                calculation_base = NULL,
                percentage = NULL,
                fixed_amount = NULL,
                rule_snapshot = COALESCE(rule_snapshot, '{}'::jsonb) || $4::jsonb,
                status = CASE WHEN status = 'PENDING_RULE' THEN 'PENDING' ELSE status END,
                notes = COALESCE($5, notes),
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [
          context.tenantId,
          id,
          amount,
          JSON.stringify({
            overridden: true,
            manual: true,
            previous_amount: commission.commission_amount !== null ? Number(commission.commission_amount) : null,
          }),
          notes,
        ],
      );
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.COMMISSION_OVERRIDE,
        entityType: 'seller_commission',
        entityId: id,
        metadata: {
          amount,
          previous_amount: commission.commission_amount !== null ? Number(commission.commission_amount) : null,
        },
      });
      await enqueueOutboxEvent(client, {
        eventType: 'COMMISSION_UPDATED',
        entityType: 'seller_commission',
        entityId: id,
        payload: { commission_amount: amount, manual: true },
      });
    });

    return { ok: true };
  });
}
