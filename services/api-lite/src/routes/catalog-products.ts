/**
 * Catalog products (ADR-008 / spec §5): a product belongs to a sale category and
 * has a default supplier. Lite subset of the Full TravelProduct (name, category,
 * supplier, active). Writes need settings.manage, like the other catalogs.
 */
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requirePermission } from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import type { LiteDatabase, TenantClient } from '../database';
import { ConflictError, FormFieldError, NotFoundError, ValidationError } from '../errors';
import { getTenantContext } from '../tenant-context';
import { parseObjectBody, requiredString } from '../validation';

interface ProductRow {
  id: string;
  name: string;
  category_id: string | null;
  default_supplier_id: string | null;
  active: boolean;
  legacy_ref: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = 'id, name, category_id, default_supplier_id, active, legacy_ref, created_at, updated_at';
const UNIQUE_VIOLATION = '23505';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** null clears the link, undefined leaves it alone. */
function optionalLink(body: Record<string, unknown>, field: string): string | null | undefined {
  if (!(field in body)) return undefined;
  const value = body[field];
  if (value === null) return null;
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new ValidationError(`Field ${field} must be a valid UUID`);
  }
  return value;
}

async function assertLinks(
  client: TenantClient,
  tenantId: string,
  categoryId: string | null | undefined,
  supplierId: string | null | undefined,
): Promise<void> {
  if (categoryId) {
    const category = await client.query(`SELECT 1 FROM sale_categories WHERE tenant_id = $1 AND id = $2`, [tenantId, categoryId]);
    if ((category.rowCount ?? 0) === 0) throw new NotFoundError('Category not found');
  }
  if (supplierId) {
    const supplier = await client.query<{ type: string }>(
      `SELECT type FROM financial_parties WHERE tenant_id = $1 AND id = $2`,
      [tenantId, supplierId],
    );
    const row = supplier.rows[0];
    if (!row) throw new NotFoundError('Financial party not found');
    if (row.type !== 'SUPPLIER') {
      throw new FormFieldError('FIELD_INVALID', 'default_supplier_id', 'O favorecido informado não é um fornecedor');
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === UNIQUE_VIOLATION;
}

export function registerCatalogProductRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/catalog-products', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const query = (request.query ?? {}) as Record<string, string | undefined>;
    const includeInactive = query.include_inactive === 'true';
    const result = await database.withTenantTransaction((client) =>
      client.query<ProductRow>(
        `SELECT ${COLUMNS} FROM catalog_products
          WHERE tenant_id = $1 AND ($2::boolean OR active)
          ORDER BY lower(name)`,
        [context.tenantId, includeInactive],
      ),
    );
    return { items: result.rows };
  });

  app.post('/catalog-products', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'settings.manage');
    const body = parseObjectBody(request.body);
    for (const key of Object.keys(body)) {
      if (!['name', 'category_id', 'default_supplier_id'].includes(key)) {
        throw new ValidationError(`Campo desconhecido no corpo da requisição: ${key}`);
      }
    }
    const name = requiredString(body, 'name', { max: 120 });
    const categoryId = optionalLink(body, 'category_id');
    const supplierId = optionalLink(body, 'default_supplier_id');

    const product = await database.withTenantTransaction(async (client) => {
      await assertLinks(client, context.tenantId, categoryId, supplierId);
      try {
        const result = await client.query<ProductRow>(
          `INSERT INTO catalog_products (tenant_id, name, category_id, default_supplier_id)
           VALUES ($1, $2, $3, $4) RETURNING ${COLUMNS}`,
          [context.tenantId, name, categoryId ?? null, supplierId ?? null],
        );
        const created = result.rows[0]!;
        await recordAuditEvent(client, {
          eventType: AUDIT_EVENTS.CATALOG_PRODUCT_CREATED,
          entityType: 'catalog_product',
          entityId: created.id,
        });
        return created;
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError('A record with this name already exists');
        throw error;
      }
    });

    reply.code(201);
    return { product };
  });

  app.patch('/catalog-products/:id', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    requirePermission(context, 'settings.manage');
    const { id } = request.params as { id: string };
    const body = parseObjectBody(request.body);
    for (const key of Object.keys(body)) {
      if (!['name', 'category_id', 'default_supplier_id', 'active'].includes(key)) {
        throw new ValidationError(`Campo desconhecido no corpo da requisição: ${key}`);
      }
    }

    const updates: string[] = [];
    const params: unknown[] = [context.tenantId, id];
    const set = (column: string, value: unknown) => {
      params.push(value);
      updates.push(`${column} = $${params.length}`);
    };

    if ('name' in body) set('name', requiredString(body, 'name', { max: 120 }));
    if ('active' in body) {
      if (typeof body.active !== 'boolean') throw new ValidationError('Field active must be a boolean');
      set('active', body.active);
    }
    const categoryId = optionalLink(body, 'category_id');
    const supplierId = optionalLink(body, 'default_supplier_id');
    if (categoryId !== undefined) set('category_id', categoryId);
    if (supplierId !== undefined) set('default_supplier_id', supplierId);
    if (updates.length === 0) throw new ValidationError('At least one field is required');

    const product = await database.withTenantTransaction(async (client) => {
      await assertLinks(client, context.tenantId, categoryId, supplierId);
      updates.push('updated_at = now()');
      try {
        const result = await client.query<ProductRow>(
          `UPDATE catalog_products SET ${updates.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
          params,
        );
        const updated = result.rows[0];
        if (!updated) throw new NotFoundError('Resource not found');
        await recordAuditEvent(client, {
          eventType: AUDIT_EVENTS.CATALOG_PRODUCT_UPDATED,
          entityType: 'catalog_product',
          entityId: updated.id,
        });
        return updated;
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError('A record with this name already exists');
        throw error;
      }
    });

    return { product };
  });
}
