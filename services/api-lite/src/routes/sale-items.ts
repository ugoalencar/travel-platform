import { cancelRevenueForItem } from '../agency-revenue';
/**
 * Sale items (spec §5, Lite subset of the Full SaleItem): price components of a
 * DRAFT sale. While a sale has active items its gross_amount is DERIVED on the
 * server as the sum of their line totals; the client never sends the total.
 */
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { inScope } from '../access';
import { AUDIT_EVENTS, recordAuditEvent } from '../audit-log';
import type { LiteDatabase, TenantClient } from '../database';
import { ConflictError, FormFieldError, NotFoundError, ValidationError } from '../errors';
import { enqueueOutboxEvent } from '../outbox';
import { SALE_ITEM_LIMITS, computeLineTotal, saleItemAmountsError } from '../sale-items';
import { getTenantContext } from '../tenant-context';
import { parseObjectBody, requiredAmount, requiredString } from '../validation';
import { computeMargin, loadSaleForUpdate, readScope, updateScope } from './sales';

interface ItemRow {
  id: string;
  sale_id: string;
  product_id: string | null;
  supplier_id: string | null;
  description: string;
  qty: string;
  unit_price: string;
  taxes: string;
  fees: string;
  discount: string;
  line_total: string;
  status: 'ACTIVE' | 'CANCELLED';
  created_at: string;
}

const ITEM_COLUMNS =
  'id, sale_id, product_id, supplier_id, description, qty, unit_price, taxes, fees, discount, line_total, status, created_at';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_KEYS = ['description', 'product_id', 'supplier_id', 'qty', 'unit_price', 'taxes', 'fees', 'discount'];

function serializeItem(row: ItemRow) {
  return {
    ...row,
    qty: Number(row.qty),
    unit_price: Number(row.unit_price),
    taxes: Number(row.taxes),
    fees: Number(row.fees),
    discount: Number(row.discount),
    line_total: Number(row.line_total),
  };
}

/** Money amount within the NUMERIC(12,2) column limit shared with the Full. */
function itemAmount(body: Record<string, unknown>, field: string): number {
  const value = requiredAmount(body, field);
  if (value > SALE_ITEM_LIMITS.maxMoney) {
    throw new ValidationError(`Field ${field} must not exceed ${SALE_ITEM_LIMITS.maxMoney}`);
  }
  return value;
}

function optionalId(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new ValidationError(`Field ${field} must be a valid UUID`);
  }
  return value;
}

function parseQty(body: Record<string, unknown>): number {
  if (body.qty === undefined) return 1;
  const qty = typeof body.qty === 'number' ? body.qty : NaN;
  if (
    !Number.isFinite(qty) ||
    qty <= 0 ||
    Math.abs(qty * 100 - Math.round(qty * 100)) > 1e-6 ||
    qty > SALE_ITEM_LIMITS.maxQty
  ) {
    throw new ValidationError('Field qty must be greater than zero with at most 2 decimal places');
  }
  return qty;
}

/** Re-derives gross and margin from the active items (no-op when there are none). */
async function syncGrossFromItems(client: TenantClient, tenantId: string, saleId: string) {
  const sum = await client.query<{ n: number; total: string | null; ever: number }>(
    `SELECT count(*) FILTER (WHERE status = 'ACTIVE')::int AS n,
            sum(line_total) FILTER (WHERE status = 'ACTIVE')::text AS total,
            count(*)::int AS ever
       FROM sale_items WHERE tenant_id = $1 AND sale_id = $2`,
    [tenantId, saleId],
  );
  const { n, total, ever } = sum.rows[0]!;
  const current = await client.query<{ gross_amount: string; cost_amount: string; margin_amount: string }>(
    `SELECT gross_amount, cost_amount, margin_amount FROM sales WHERE tenant_id = $1 AND id = $2`,
    [tenantId, saleId],
  );
  const row = current.rows[0]!;
  if (ever === 0) {
    return { gross_amount: Number(row.gross_amount), margin_amount: Number(row.margin_amount) };
  }
  // With no active item left the gross is 0 (a cancelled item is never billed); it can be typed again.
  const gross = n === 0 ? 0 : Number(total);
  const margin = computeMargin(gross, Number(row.cost_amount));
  await client.query(
    `UPDATE sales SET gross_amount = $3, margin_amount = $4, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
    [tenantId, saleId, gross, margin],
  );
  return { gross_amount: gross, margin_amount: margin };
}

export function registerSaleItemRoutes(
  app: FastifyInstance,
  database: LiteDatabase,
  protectedHooks: preHandlerHookHandler[],
) {
  app.get('/sales/:id/items', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const { id } = request.params as { id: string };
    return database.withTenantTransaction(async (client) => {
      const sale = await client.query<{ seller_id: string }>(
        `SELECT seller_id FROM sales WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, id],
      );
      const row = sale.rows[0];
      if (!row || !inScope(readScope(), row.seller_id)) throw new NotFoundError('Sale not found');
      const items = await client.query<ItemRow>(
        `SELECT ${ITEM_COLUMNS} FROM sale_items WHERE tenant_id = $1 AND sale_id = $2 ORDER BY created_at, id`,
        [context.tenantId, id],
      );
      return { items: items.rows.map(serializeItem) };
    });
  });

  app.post('/sales/:id/items', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    const { id } = request.params as { id: string };
    const scope = updateScope();
    const body = parseObjectBody(request.body);
    for (const key of Object.keys(body)) {
      if (!ALLOWED_KEYS.includes(key)) throw new ValidationError(`Campo desconhecido no corpo da requisição: ${key}`);
    }

    const description = requiredString(body, 'description', { max: 300 });
    const qty = parseQty(body);
    const unitPrice = itemAmount(body, 'unit_price');
    const taxes = 'taxes' in body ? itemAmount(body, 'taxes') : 0;
    const fees = 'fees' in body ? itemAmount(body, 'fees') : 0;
    const discount = 'discount' in body ? itemAmount(body, 'discount') : 0;
    const productId = optionalId(body, 'product_id');
    let supplierId = optionalId(body, 'supplier_id');
    const lineTotal = computeLineTotal(qty, unitPrice, discount, taxes, fees);
    const amountsError = saleItemAmountsError({ qty, unitPrice, taxes, fees, discount });
    if (amountsError) throw new ValidationError(amountsError);
    if (lineTotal < 0) throw new ValidationError('O desconto não pode exceder o valor do item');
    if (lineTotal > SALE_ITEM_LIMITS.maxMoney) throw new ValidationError('O total do item excede o limite permitido');

    const result = await database.withTenantTransaction(async (client) => {
      const sale = await loadSaleForUpdate(client, context.tenantId, id, scope);
      if (sale.status !== 'DRAFT') throw new ConflictError('Only DRAFT sales can be edited');

      if (productId) {
        const product = await client.query<{ active: boolean; default_supplier_id: string | null }>(
          `SELECT active, default_supplier_id FROM catalog_products WHERE tenant_id = $1 AND id = $2`,
          [context.tenantId, productId],
        );
        if (!product.rows[0]) throw new NotFoundError('Resource not found');
        if (!product.rows[0].active) {
          throw new FormFieldError('FIELD_INVALID', 'product_id', 'O produto está inativo');
        }
        supplierId ??= product.rows[0].default_supplier_id;
      }
      if (supplierId) {
        const supplier = await client.query<{ type: string }>(
          `SELECT type FROM financial_parties WHERE tenant_id = $1 AND id = $2`,
          [context.tenantId, supplierId],
        );
        if (!supplier.rows[0]) throw new NotFoundError('Financial party not found');
        if (supplier.rows[0].type !== 'SUPPLIER') {
          throw new FormFieldError('FIELD_INVALID', 'supplier_id', 'O favorecido informado não é um fornecedor');
        }
      }

      const inserted = await client.query<ItemRow>(
        `INSERT INTO sale_items (tenant_id, sale_id, product_id, supplier_id, description, qty, unit_price,
                                 taxes, fees, discount, line_total, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING ${ITEM_COLUMNS}`,
        [context.tenantId, id, productId, supplierId, description, qty, unitPrice, taxes, fees, discount, lineTotal,
          context.userId || null],
      );
      const item = inserted.rows[0]!;
      const totals = await syncGrossFromItems(client, context.tenantId, id);
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.SALE_ITEM_CREATED,
        entityType: 'sale_item',
        entityId: item.id,
        metadata: { sale_number: sale.sale_number, line_total: lineTotal },
      });
      await enqueueOutboxEvent(client, {
        eventType: 'SALE_UPDATED',
        entityType: 'sale',
        entityId: id,
        payload: { sale_number: sale.sale_number },
      });
      return { item: serializeItem(item), sale: { id, ...totals } };
    });

    reply.code(201);
    return result;
  });

  app.post('/sale-items/:id/cancel', { preHandler: protectedHooks }, async (request) => {
    const context = getTenantContext();
    const { id } = request.params as { id: string };
    const scope = updateScope();

    return database.withTenantTransaction(async (client) => {
      const found = await client.query<ItemRow>(
        `SELECT ${ITEM_COLUMNS} FROM sale_items WHERE tenant_id = $1 AND id = $2`,
        [context.tenantId, id],
      );
      const existing = found.rows[0];
      if (!existing) throw new NotFoundError('Resource not found');
      const sale = await loadSaleForUpdate(client, context.tenantId, existing.sale_id, scope);
      await cancelRevenueForItem(client, context.tenantId, existing.sale_id, id);
      if (sale.status !== 'DRAFT') throw new ConflictError('Only DRAFT sales can be edited');

      // The sale lock serializes cancellations; the status is judged only after it is held.
      const cancelled = await client.query<ItemRow>(
        `UPDATE sale_items SET status = 'CANCELLED', updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE' RETURNING ${ITEM_COLUMNS}`,
        [context.tenantId, id],
      );
      if (!cancelled.rows[0]) throw new ConflictError('The item is already cancelled');
      const totals = await syncGrossFromItems(client, context.tenantId, existing.sale_id);
      await recordAuditEvent(client, {
        eventType: AUDIT_EVENTS.SALE_ITEM_CANCELLED,
        entityType: 'sale_item',
        entityId: id,
        metadata: { sale_number: sale.sale_number },
      });
      await enqueueOutboxEvent(client, {
        eventType: 'SALE_UPDATED',
        entityType: 'sale',
        entityId: existing.sale_id,
        payload: { sale_number: sale.sale_number },
      });
      return { item: serializeItem(cancelled.rows[0]), sale: { id: existing.sale_id, ...totals } };
    });
  });
}
