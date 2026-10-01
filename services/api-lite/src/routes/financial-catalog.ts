import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requirePermission, type Permission } from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import type { LiteDatabase } from '../database';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { enqueueOutboxEvent, type OutboxEventType } from '../outbox';
import { getTenantContext } from '../tenant-context';
import { optionalInteger, parseObjectBody, requiredAmount, requiredString } from '../validation';

interface CatalogOptions {
  path: string;
  table: string;
  entityType: string;
  select: string;
  auditCreate: string;
  auditUpdate: string;
  outboxCreate: OutboxEventType;
  outboxUpdate: OutboxEventType;
  /** Any of these may list; empty = every authenticated user (sale forms need it). */
  readPermissions: Permission[];
}

/**
 * CRUD shared by financial_accounts, financial_categories and
 * payment_methods (all: name + active [+ direction for categories]).
 * Deactivation is a PATCH { active: false }; there is no hard delete so
 * that financial history always keeps its references.
 */
function registerCatalogRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
  options: CatalogOptions,
) {
  const { path, table, entityType, select, auditCreate, auditUpdate, outboxCreate, outboxUpdate } =
    options;

  app.get(path, { preHandler: protectedHooks }, async () => {
    const context = getTenantContext();
    if (options.readPermissions.length > 0) requirePermission(context, ...options.readPermissions);
    const result = await database.withTenantTransaction((client) =>
      client.query<Record<string, unknown>>(
        `SELECT ${select} FROM ${table} WHERE tenant_id = $1
          ORDER BY CASE WHEN active THEN 0 ELSE 1 END, name`,
        [context.tenantId],
      ),
    );
    return { items: result.rows.map((row) => serializeCatalogRow(table, row)) };
  });

  app.post(path, { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'settings.manage');
    const body = parseObjectBody(request.body);

    const columns = ['tenant_id', 'name'];
    const params: unknown[] = [context.tenantId, requiredString(body, 'name', { max: 120 })];

    if (table === 'financial_accounts') {
      const rawType = body.type === undefined ? 'CASH' : body.type;
      if (rawType !== 'BANK' && rawType !== 'CASH' && rawType !== 'WALLET') {
        throw new ValidationError('Field type must be one of: BANK, CASH, WALLET');
      }
      const initialBalance = 'initial_balance' in body ? requiredAmount(body, 'initial_balance') : 0;
      columns.push('type', 'initial_balance');
      params.push(rawType, initialBalance);
    } else if (table === 'financial_categories') {
      const direction = body.direction;
      if (direction !== 'IN' && direction !== 'OUT') {
        throw new ValidationError('Field direction must be one of: IN, OUT');
      }
      columns.push('direction');
      params.push(direction);
    } else {
      const sortOrder = optionalInteger(body, 'sort_order', { min: 0, max: 1_000_000 }) ?? 0;
      columns.push('sort_order');
      params.push(sortOrder);
    }

    const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
    const row = await database.withTenantTransaction(async (client) => {
      const duplicate = await client.query(`SELECT 1 FROM ${table} WHERE tenant_id = $1 AND name = $2`, [
        context.tenantId,
        params[1],
      ]);
      if ((duplicate.rowCount ?? 0) > 0) {
        throw new ConflictError('A record with this name already exists');
      }
      const result = await client.query<{ id: string }>(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
         RETURNING ${select}`,
        params,
      );
      const created = result.rows[0]!;
      await recordAuditEvent(client, {
        eventType: auditCreate,
        entityType,
        entityId: created.id,
      });
      await enqueueOutboxEvent(client, {
        eventType: outboxCreate,
        entityType,
        entityId: created.id,
        payload: { name: params[1] },
      });
      return created;
    });

    reply.code(201);
    return { [entityType]: serializeCatalogRow(table, row) };
  });

  app.patch(`${path}/:id`, { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'settings.manage');
    const { id } = request.params as { id: string };
    const body = parseObjectBody(request.body);

    const updates: string[] = [];
    const params: unknown[] = [context.tenantId, id];

    function set(column: string, value: unknown): void {
      params.push(value);
      updates.push(`${column} = $${params.length}`);
    }

    if ('name' in body) set('name', requiredString(body, 'name', { max: 120 }));
    if ('active' in body) {
      if (typeof body.active !== 'boolean') {
        throw new ValidationError('Field active must be a boolean');
      }
      set('active', body.active);
    }
    if (table === 'payment_methods' && 'sort_order' in body) {
      const sortOrder = optionalInteger(body, 'sort_order', { min: 0, max: 1_000_000 });
      if (sortOrder === null) throw new ValidationError('Field sort_order is required');
      set('sort_order', sortOrder);
    }

    if (updates.length === 0) throw new ValidationError('At least one field is required');

    const row = await database.withTenantTransaction(async (client) => {
      updates.push('updated_at = now()');
      const result = await client.query<{ id: string }>(
        `UPDATE ${table} SET ${updates.join(', ')} WHERE tenant_id = $1 AND id = $2
         RETURNING ${select}`,
        params,
      );
      const updated = result.rows[0];
      if (!updated) throw new NotFoundError('Record not found');
      await recordAuditEvent(client, {
        eventType: auditUpdate,
        entityType,
        entityId: updated.id,
      });
      await enqueueOutboxEvent(client, {
        eventType: outboxUpdate,
        entityType,
        entityId: updated.id,
        payload: {},
      });
      return updated;
    });

    return { [entityType]: serializeCatalogRow(table, row) };
  });
}

function serializeCatalogRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  if (table !== 'financial_accounts') return row;
  return { ...row, initial_balance: Number(row.initial_balance), balance: Number(row.balance) };
}

export function registerFinancialCatalogRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  registerCatalogRoutes(app, database, protectedHooks, {
    path: '/financial-accounts',
    readPermissions: ['finance.read', 'settings.manage'],
    table: 'financial_accounts',
    entityType: 'account',
    // Current balance = opening balance + immutable ledger (IN - OUT).
    select: `id, name, type, initial_balance, active,
      initial_balance + coalesce((SELECT sum(CASE WHEN t.type = 'IN' THEN t.amount ELSE -t.amount END)
                                    FROM financial_transactions t
                                   WHERE t.tenant_id = financial_accounts.tenant_id
                                     AND t.account_id = financial_accounts.id), 0) AS balance`,
    auditCreate: AUDIT_EVENTS.ACCOUNT_CREATED,
    auditUpdate: AUDIT_EVENTS.ACCOUNT_UPDATED,
    outboxCreate: 'ACCOUNT_CREATED',
    outboxUpdate: 'ACCOUNT_UPDATED',
  });

  registerCatalogRoutes(app, database, protectedHooks, {
    path: '/financial-categories',
    readPermissions: ['finance.read', 'settings.manage'],
    table: 'financial_categories',
    entityType: 'category',
    select: 'id, name, direction, active',
    auditCreate: AUDIT_EVENTS.FINANCIAL_CATEGORY_CREATED,
    auditUpdate: AUDIT_EVENTS.FINANCIAL_CATEGORY_UPDATED,
    outboxCreate: 'FINANCIAL_CATEGORY_CREATED',
    outboxUpdate: 'FINANCIAL_CATEGORY_UPDATED',
  });

  registerCatalogRoutes(app, database, protectedHooks, {
    path: '/payment-methods',
    readPermissions: [],
    table: 'payment_methods',
    entityType: 'paymentMethod',
    select: 'id, name, active, sort_order',
    auditCreate: AUDIT_EVENTS.PAYMENT_METHOD_CREATED,
    auditUpdate: AUDIT_EVENTS.PAYMENT_METHOD_UPDATED,
    outboxCreate: 'PAYMENT_METHOD_CREATED',
    outboxUpdate: 'PAYMENT_METHOD_UPDATED',
  });
}
