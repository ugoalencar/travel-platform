import { cancelRevenueForItem } from './agency-revenue';
// ============================================================
// SALE ITEMS (Agent 08 -- Upsell)
// ============================================================
// FINANCIAL AUTHORITY NOTE (read before touching this file):
//
// A SaleItem's own line-level subtotal (qty*unitPrice - discount + taxes
// + fees) is a NEW computation that belongs to this NEW entity -- it is
// not a duplicate of any existing formula, because no line-item concept
// existed before this module. That subtotal is computed once, locally,
// in computeLineTotal()/computeLineMargin() below.
//
// What this module does NOT do: it never recomputes the Sale's
// authoritative `total` (amount - discount, computeTotal() in sales.ts)
// or the Sale's authoritative margin (getSaleMargin() in financial.ts,
// sourced from payables/operational_costs/commissions by sale_id) with
// its own arithmetic. Instead:
//   - createSaleItem() folds the new line's total into the Sale by
//     calling the EXISTING updateSale() (sales.ts), which recomputes
//     `total` via the EXISTING computeTotal() and syncs the receivable
//     via the EXISTING syncUnallocatedSaleReceivable() -- the real
//     authoritative path, unmodified.
//   - when the item carries a supplier + unitCost, createSaleItem()
//     records the supplier cost via the EXISTING createPayable()
//     (financial.ts). getSaleMargin() already sums `payables` by
//     sale_id, so the Sale's authoritative margin reflects the new
//     SaleItem automatically, with zero changes to getSaleMargin()
//     itself. Both writes use the same tenant transaction.
//
// createSaleItemInTransaction() is also called by POST /sales when the
// request contains multiple items. The outer route transaction then
// includes the Sale, every SaleItem, audit records, receivable, revenue
// projection and supplier payables; any item failure rolls them all back.
// ============================================================

import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import type { SaleItem, LineItemSource } from '../../../packages/domain/types';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { FormFieldError, NotFoundError, ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';
import { updateSale } from './sales';
import { createPayable } from './financial';

interface SaleItemRow {
  id: string;
  agency_id: string;
  sale_id: string;
  product_id: string | null;
  description: string;
  supplier_id: string | null;
  travelers: unknown;
  qty: string;
  unit_cost: string;
  unit_price: string;
  taxes: string;
  fees: string;
  discount: string;
  commission: string;
  line_total: string;
  line_margin: string;
  currency: string;
  status: 'ACTIVE' | 'CANCELLED';
  source: LineItemSource;
  payable_id: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

const SALE_ITEM_COLUMNS = `id, agency_id, sale_id, product_id, description, supplier_id, travelers,
  qty, unit_cost, unit_price, taxes, fees, discount, commission, line_total, line_margin,
  currency, status, source, payable_id, created_by_user_id, created_at, updated_at`;

export interface CreateSaleItemInput {
  saleId: string;
  productId?: string;
  description: string;
  supplierId?: string;
  travelers?: unknown[];
  qty?: number;
  unitCost?: number;
  unitPrice: number;
  taxes?: number;
  fees?: number;
  discount?: number;
  commission?: number;
  currency?: string;
  source?: LineItemSource;
}

/**
 * Column limits of a sale item. Same as the Full (migration 055): qty NUMERIC(10,2), money NUMERIC(12,2).
 * tests/sale-form-fields.test.ts compares both products.
 */
export const SALE_ITEM_LIMITS = {
  qtyDecimals: 2,
  moneyDecimals: 2,
  maxQty: 99_999_999.99,
  maxMoney: 9_999_999_999.99,
} as const;

/**
 * Validates the amounts of a sale item against the column limits shared by Full and Lite
 * (qty NUMERIC(10,2), money NUMERIC(12,2)). Returns a message, or null when valid.
 * The Lite has an identical function; tests/sale-form-fields.test.ts runs both over one table.
 */
export function saleItemAmountsError(v: {
  qty: number;
  unitPrice: number;
  unitCost?: number;
  taxes: number;
  fees: number;
  discount: number;
  commission?: number;
}): string | null {
  if (!Number.isFinite(v.qty) || v.qty <= 0) return 'qty must be greater than zero';
  if (v.qty > SALE_ITEM_LIMITS.maxQty) return 'qty exceeds the allowed limit';
  if (Number(v.qty.toFixed(SALE_ITEM_LIMITS.qtyDecimals)) !== v.qty) {
    return 'qty must have at most 2 decimal places';
  }
  const money: Record<string, number> = {
    unitPrice: v.unitPrice,
    unitCost: v.unitCost ?? 0,
    taxes: v.taxes,
    fees: v.fees,
    discount: v.discount,
    commission: v.commission ?? 0,
  };
  for (const [field, value] of Object.entries(money)) {
    if (!Number.isFinite(value) || value < 0) return `${field} must not be negative`;
    if (value > SALE_ITEM_LIMITS.maxMoney) return `${field} exceeds the allowed limit`;
    if (Number(value.toFixed(SALE_ITEM_LIMITS.moneyDecimals)) !== value) {
      return `${field} must have at most 2 decimal places`;
    }
  }
  const total = computeLineTotal(v.qty, v.unitPrice, v.discount, v.taxes, v.fees);
  if (total < 0) return 'line total must not be negative';
  if (total > SALE_ITEM_LIMITS.maxMoney) return 'line total exceeds the allowed limit';
  return null;
}

/** Cents-based rounding, same technique as sales.ts/proposals.ts computeTotal(). */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Line-level subtotal -- a NEW field of the NEW SaleItem entity (see module header). */
export function computeLineTotal(
  qty: number,
  unitPrice: number,
  discount: number,
  taxes: number,
  fees: number,
): number {
  const cents =
    Math.round(qty * unitPrice * 100) -
    Math.round(discount * 100) +
    Math.round(taxes * 100) +
    Math.round(fees * 100);
  return cents / 100;
}

export function computeLineMargin(
  lineTotal: number,
  qty: number,
  unitCost: number,
  commission: number,
): number {
  const cents = Math.round(lineTotal * 100) - Math.round(qty * unitCost * 100) - Math.round(commission * 100);
  return cents / 100;
}

export async function listSaleItems(database: DatabaseRuntime, saleId: string): Promise<SaleItem[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<SaleItemRow>(
      `SELECT ${SALE_ITEM_COLUMNS} FROM sale_items WHERE agency_id = $1 AND sale_id = $2 ORDER BY created_at ASC`,
      [agencyId, saleId],
    );
    return result.rows.map(toSaleItem);
  });
}

export async function getSaleItemById(database: DatabaseRuntime, id: string): Promise<SaleItem | null> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<SaleItemRow>(
      `SELECT ${SALE_ITEM_COLUMNS} FROM sale_items WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toSaleItem(row) : null;
  });
}

export async function createSaleItem(
  database: DatabaseRuntime,
  data: CreateSaleItemInput,
): Promise<SaleItem> {
  return database.withTenantTransaction((client) => createSaleItemInTransaction(database, client, data));
}

export async function createSaleItemInTransaction(
  database: DatabaseRuntime,
  client: TenantTransactionClient,
  data: CreateSaleItemInput,
  options: { updateSaleTotal?: boolean } = {},
): Promise<SaleItem> {
  const agencyId = getAgencyId();
  const userId = getUserId();
  const updateTotal = options.updateSaleTotal ?? true;

  if (!data.description || data.description.trim().length === 0) {
    throw new ValidationError('Field "description" is required');
  }
  if (data.unitPrice < 0) {
    throw new ValidationError('Field "unitPrice" must not be negative');
  }

  const qty = data.qty ?? 1;
  if (qty <= 0) {
    throw new ValidationError('Field "qty" must be positive');
  }
  const amountsError = saleItemAmountsError({
    qty,
    unitPrice: data.unitPrice,
    unitCost: data.unitCost ?? 0,
    taxes: data.taxes ?? 0,
    fees: data.fees ?? 0,
    discount: data.discount ?? 0,
    commission: data.commission ?? 0,
  });
  if (amountsError) throw new ValidationError(amountsError);
  const unitCost = data.unitCost ?? 0;
  const taxes = data.taxes ?? 0;
  const fees = data.fees ?? 0;
  const discount = data.discount ?? 0;
  const commission = data.commission ?? 0;
  for (const [field, value] of Object.entries({ unitCost, taxes, fees, discount, commission })) {
    if (value < 0) {
      throw new ValidationError(`Field "${field}" must not be negative`);
    }
  }

  const lineTotal = computeLineTotal(qty, data.unitPrice, discount, taxes, fees);
  if (lineTotal < 0) {
    throw new ValidationError('Computed line total must not be negative');
  }
  const lineMargin = computeLineMargin(lineTotal, qty, unitCost, commission);
  if (data.supplierId !== undefined && unitCost > 0 && roundMoney(qty * unitCost) <= 0) {
    throw new ValidationError('The supplier cost (qty x unitCost) must be at least 0.01');
  }

  const locked = await client.query<{ amount: string }>(
    `SELECT amount FROM sales WHERE agency_id = $1 AND id = $2 ${updateTotal ? 'FOR UPDATE' : ''}`,
    [agencyId, data.saleId],
  );
  const saleAmount = locked.rows[0] ? Number(locked.rows[0].amount) : null;
  if (saleAmount === null) throw new NotFoundError('Sale not found');
    if (data.supplierId !== undefined) {
      await assertRef(client, agencyId, 'suppliers', data.supplierId, 'Supplier not found');
    }
    if (data.productId !== undefined) {
      const product = await client.query<{ active: boolean }>(
        `SELECT active FROM travel_products WHERE agency_id = $1 AND id = $2`,
        [agencyId, data.productId],
      );
      if (!product.rows[0] || !product.rows[0].active) {
        throw new FormFieldError('FIELD_INVALID', 'productId', 'Produto inexistente ou inativo');
      }
    }

    const result = await client.query<SaleItemRow>(
      `INSERT INTO sale_items
         (agency_id, sale_id, product_id, description, supplier_id, travelers, qty, unit_cost,
          unit_price, taxes, fees, discount, commission, line_total, line_margin, currency,
          source, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING ${SALE_ITEM_COLUMNS}`,
      [
        agencyId,
        data.saleId,
        data.productId ?? null,
        data.description,
        data.supplierId ?? null,
        JSON.stringify(data.travelers ?? []),
        qty,
        unitCost,
        data.unitPrice,
        taxes,
        fees,
        discount,
        commission,
        lineTotal,
        lineMargin,
        data.currency ?? 'BRL',
        data.source ?? 'MANUAL',
        userId,
      ],
    );
    const inserted = result.rows[0];
    if (!inserted) throw new Error('SaleItem insert did not return a row');

    await recordAuditEvent(client, {
      eventType: AuditEventType.SALE_ITEM_CREATED,
      entityType: 'sale_item',
      entityId: inserted.id,
      metadata: { saleId: data.saleId, lineTotal, source: data.source ?? 'MANUAL' },
    });

  let payableId: string | null = null;
  if (data.supplierId !== undefined && unitCost > 0) {
    const payable = await createPayable(database, {
      saleId: data.saleId,
      supplierId: data.supplierId,
      description: `SaleItem: ${data.description}`,
      amount: roundMoney(qty * unitCost),
      dueAt: new Date(),
    }, client);
    payableId = payable.id;
    await client.query(`UPDATE sale_items SET payable_id = $3 WHERE agency_id = $1 AND id = $2`, [agencyId, inserted.id, payableId]);
  }

  if (updateTotal) {
    await updateSale(database, data.saleId, { amount: roundMoney(saleAmount + lineTotal) }, client);
  }

  return toSaleItem({ ...inserted, payable_id: payableId ?? inserted.payable_id });
}

/**
 * Cancels a SaleItem and reverses its contribution to the Sale's
 * authoritative total via the same existing updateSale() path used to
 * add it. The linked Payable (if any) is left as-is -- payables.ts/
 * financial.ts expose no cancel-payable transition today, so reversing
 * a supplier cost is out of scope here (documented P2, not a workaround
 * with a hand-rolled formula).
 */
export async function cancelSaleItem(database: DatabaseRuntime, id: string): Promise<SaleItem | null> {
  const agencyId = getAgencyId();

  const existing = await getSaleItemById(database, id);
  if (!existing) return null;
  if (existing.status === 'CANCELLED') return existing;

  const row = await database.withTenantTransaction(async (client) => {
    const locked = await client.query<{ amount: string }>(
      `SELECT amount FROM sales WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
      [agencyId, existing.saleId],
    );
    if (!locked.rows[0]) throw new NotFoundError('Sale not found');
    const saleAmount = Number(locked.rows[0].amount);
    await cancelRevenueForItem(client, existing.saleId, id);
    const result = await client.query<SaleItemRow>(
      `UPDATE sale_items SET status = 'CANCELLED', updated_at = now()
       WHERE agency_id = $1 AND id = $2 AND status = 'ACTIVE'
       RETURNING ${SALE_ITEM_COLUMNS}`,
      [agencyId, id],
    );
    const updated = result.rows[0];
    if (!updated) return null;

    await recordAuditEvent(client, {
      eventType: AuditEventType.SALE_ITEM_CANCELLED,
      entityType: 'sale_item',
      entityId: updated.id,
      metadata: { saleId: updated.sale_id },
    });

    await updateSale(
      database,
      existing.saleId,
      { amount: roundMoney(Math.max(0, saleAmount - existing.lineTotal)) },
      client,
    );

    return updated;
  });

  if (!row) return getSaleItemById(database, id);

  return toSaleItem(row);
}

async function assertRef(
  client: TenantTransactionClient,
  agencyId: string,
  table: string,
  id: string,
  message: string,
): Promise<void> {
  const result = await client.query(`SELECT 1 FROM ${table} WHERE agency_id = $1 AND id = $2`, [
    agencyId,
    id,
  ]);
  if (result.rows.length === 0) {
    throw new NotFoundError(message);
  }
}

const ALLOWED_SALE_ITEM_CREATE_FIELDS = [
  'saleId',
  'productId',
  'description',
  'supplierId',
  'travelers',
  'qty',
  'unitCost',
  'unitPrice',
  'taxes',
  'fees',
  'discount',
  'commission',
  'currency',
  'source',
] as const;

/**
 * Allowlist-based parser for POST /sales/:saleId/items request bodies,
 * mirroring the pattern used by parseCreateSaleInput
 * (commercial-input-parsing.ts): reject unknown fields up front, then
 * hand the typed input to createSaleItem() for the real validation
 * (business rules, non-negativity, existence checks).
 */
export function parseCreateSaleItemInput(saleId: string, body: unknown): CreateSaleItemInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_SALE_ITEM_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }
  if ('saleId' in record && record.saleId !== saleId) {
    throw new ValidationError('Field "saleId" in body must match the route parameter');
  }

  if (typeof record.description !== 'string' || record.description.trim().length === 0) {
    throw new ValidationError('Field "description" is required and must be a non-empty string');
  }
  if (typeof record.unitPrice !== 'number' || !Number.isFinite(record.unitPrice)) {
    throw new ValidationError('Field "unitPrice" is required and must be a number');
  }

  const data: CreateSaleItemInput = {
    saleId,
    description: record.description,
    unitPrice: record.unitPrice,
  };

  const optionalStrings: Array<keyof CreateSaleItemInput> = ['productId', 'supplierId', 'currency'];
  for (const field of optionalStrings) {
    const value = record[field as string];
    if (value !== undefined) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ValidationError(`Field "${String(field)}" must be a non-empty string`);
      }
      (data as unknown as Record<string, unknown>)[field as string] = value;
    }
  }

  const optionalNumbers: Array<keyof CreateSaleItemInput> = [
    'qty',
    'unitCost',
    'taxes',
    'fees',
    'discount',
    'commission',
  ];
  for (const field of optionalNumbers) {
    const value = record[field as string];
    if (value !== undefined) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new ValidationError(`Field "${String(field)}" must be a number`);
      }
      (data as unknown as Record<string, unknown>)[field as string] = value;
    }
  }

  if (record.travelers !== undefined) {
    if (!Array.isArray(record.travelers)) {
      throw new ValidationError('Field "travelers" must be an array');
    }
    data.travelers = record.travelers;
  }

  if (record.source !== undefined) {
    if (record.source !== 'MANUAL' && record.source !== 'UPSELL_SUGGESTION') {
      throw new ValidationError('Field "source" must be "MANUAL" or "UPSELL_SUGGESTION"');
    }
    data.source = record.source;
  }

  return data;
}

function toSaleItem(row: SaleItemRow): SaleItem {
  return {
    id: row.id,
    agencyId: row.agency_id,
    saleId: row.sale_id,
    description: row.description,
    travelers: Array.isArray(row.travelers) ? row.travelers : [],
    qty: Number(row.qty),
    unitCost: Number(row.unit_cost),
    unitPrice: Number(row.unit_price),
    taxes: Number(row.taxes),
    fees: Number(row.fees),
    discount: Number(row.discount),
    commission: Number(row.commission),
    lineTotal: Number(row.line_total),
    lineMargin: Number(row.line_margin),
    currency: row.currency,
    status: row.status,
    source: row.source,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.product_id !== null ? { productId: row.product_id } : {}),
    ...(row.supplier_id !== null ? { supplierId: row.supplier_id } : {}),
    ...(row.payable_id !== null ? { payableId: row.payable_id } : {}),
    ...(row.created_by_user_id !== null ? { createdByUserId: row.created_by_user_id } : {}),
  };
}
