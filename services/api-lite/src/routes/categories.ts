import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import type { LiteDatabase } from '../database';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { enqueueOutboxEvent } from '../outbox';
import { requireRole } from '../roles';
import { getTenantContext } from '../tenant-context';
import { optionalInteger, parseObjectBody, requiredString } from '../validation';

interface CategoryRow {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function registerCategoryRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/categories', { preHandler: protectedHooks }, async () => {
    const context = getTenantContext();
    const result = await database.withTenantTransaction((client) =>
      client.query<CategoryRow>(
        `SELECT id, name, active, sort_order, created_at, updated_at
           FROM sale_categories WHERE tenant_id = $1
          ORDER BY sort_order, name`,
        [context.tenantId],
      ),
    );
    return { items: result.rows };
  });

  app.post('/categories', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requireRole(context, 'OPERATOR');
    const body = parseObjectBody(request.body);

    const name = requiredString(body, 'name', { max: 100 });
    const sortOrder = optionalInteger(body, 'sort_order', { min: 0, max: 1_000_000 }) ?? 0;

    const category = await database.withTenantTransaction(async (client) => {
      const duplicate = await client.query(`SELECT 1 FROM sale_categories WHERE tenant_id = $1 AND name = $2`, [
        context.tenantId,
        name,
      ]);
      if ((duplicate.rowCount ?? 0) > 0) {
        throw new ConflictError('A category with this name already exists');
      }
      const result = await client.query<CategoryRow>(
        `INSERT INTO sale_categories (tenant_id, name, sort_order)
         VALUES ($1, $2, $3)
         RETURNING id, name, active, sort_order, created_at, updated_at`,
        [context.tenantId, name, sortOrder],
      );
      const created = result.rows[0]!;
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.CATEGORY_CREATED,
        entityType: 'sale_category',
        entityId: created.id,
      });
      await enqueueOutboxEvent(client, {
        eventType: 'SALE_CATEGORY_CREATED',
        entityType: 'sale_category',
        entityId: created.id,
        payload: { name: created.name, sort_order: created.sort_order },
      });
      return created;
    });

    reply.code(201);
    return { category };
  });

  app.patch('/categories/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requireRole(context, 'OPERATOR');
    const { id } = request.params as { id: string };
    const body = parseObjectBody(request.body);

    const updates: string[] = [];
    const params: unknown[] = [context.tenantId, id];

    function set(column: string, value: unknown): void {
      params.push(value);
      updates.push(`${column} = $${params.length}`);
    }

    if ('name' in body) set('name', requiredString(body, 'name', { max: 100 }));
    if ('active' in body) {
      const active = body.active;
      if (typeof active !== 'boolean') {
        throw new ValidationError('Field active must be a boolean');
      }
      set('active', active);
    }
    if ('sort_order' in body) {
      const sortOrder = optionalInteger(body, 'sort_order', { min: 0, max: 1_000_000 });
      if (sortOrder === null) throw new ValidationError('Field sort_order is required');
      set('sort_order', sortOrder);
    }

    if (updates.length === 0) {
      throw new ValidationError('At least one field is required');
    }

    const category = await database.withTenantTransaction(async (client) => {
      updates.push('updated_at = now()');
      const result = await client.query<CategoryRow>(
        `UPDATE sale_categories SET ${updates.join(', ')} WHERE tenant_id = $1 AND id = $2
         RETURNING id, name, active, sort_order, created_at, updated_at`,
        params,
      );
      const updated = result.rows[0];
      if (!updated) throw new NotFoundError('Category not found');
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.CATEGORY_UPDATED,
        entityType: 'sale_category',
        entityId: updated.id,
      });
      await enqueueOutboxEvent(client, {
        eventType: 'SALE_CATEGORY_UPDATED',
        entityType: 'sale_category',
        entityId: updated.id,
        payload: { name: updated.name, active: updated.active, sort_order: updated.sort_order },
      });
      return updated;
    });

    return { category };
  });

  app.delete('/categories/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requireRole(context, 'OPERATOR');
    const { id } = request.params as { id: string };

    await database.withTenantTransaction(async (client) => {
      const usage = await client.query(
        `SELECT 1 FROM sales WHERE tenant_id = $1 AND category_id = $2 LIMIT 1`,
        [context.tenantId, id],
      );
      if ((usage.rowCount ?? 0) > 0) {
        throw new ConflictError(
          'Category is referenced by sales; deactivate it instead of deleting',
        );
      }
      const result = await client.query(`DELETE FROM sale_categories WHERE tenant_id = $1 AND id = $2`, [
        context.tenantId,
        id,
      ]);
      if ((result.rowCount ?? 0) === 0) throw new NotFoundError('Category not found');
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.CATEGORY_DELETED,
        entityType: 'sale_category',
        entityId: id,
      });
      await enqueueOutboxEvent(client, {
        eventType: 'SALE_CATEGORY_DELETED',
        entityType: 'sale_category',
        entityId: id,
        payload: {},
      });
    });

    return { ok: true };
  });
}
