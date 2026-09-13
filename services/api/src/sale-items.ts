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
//     itself.
//
// This is the intended, non-parallel integration the mission brief
// requires ("Se exigir formula paralela, parar e escalar ao
// Integrator"): reuse via composition (call the real functions with the
// right inputs), not reimplementation.
//
// Each cross-module call (updateSale, createPayable) runs in its own
// withTenantTransaction -- the same pattern app.ts's route handlers
// already use to compose sales.ts + financial.ts (see e.g. the
// PATCH /sales/:id and POST /financial/payables routes). True
// cross-table atomicity is not available with this codebase's
// per-call-transaction DatabaseRuntime -- this module reuses the
// codebase's existing composition pattern, not a new one.
// ============================================================

import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import type { SaleItem, LineItemSource } from '../../../packages/domain/types';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { NotFoundError, ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';
import { updateSale, getSaleById } from './sales';
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
  const agencyId = getAgencyId();
  const userId = getUserId();

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

  const sale = await getSaleById(database, data.saleId);
  if (!sale) {
    throw new NotFoundError('Sale not found');
  }

  const row = await database.withTenantTransaction(async (client) => {
    if (data.supplierId !== undefined) {
      await assertRef(client, agencyId, 'suppliers', data.supplierId, 'Supplier not found');
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

    return inserted;
  });

  // --- Fold into the Sale's AUTHORITATIVE total via the EXISTING path ---
  // updateSale() recomputes `total` with the existing computeTotal()
  // (amount - discount) and syncs the receivable via the existing
  // syncUnallocatedSaleReceivable() -- no new formula introduced here.
  await updateSale(database, data.saleId, { amount: roundMoney(sale.amount + lineTotal) });

  // --- Fold supplier cost into the Sale's AUTHORITATIVE margin via the
  // EXISTING path --- getSaleMargin() (financial.ts) already sums
  // `payables` by sale_id; creating a real Payable here (via the
  // existing createPayable()) is enough for the margin to reflect this
  // SaleItem, with zero changes to getSaleMargin()'s formula.
  let payableId: string | null = null;
  if (data.supplierId !== undefined && unitCost > 0) {
    const payable = await createPayable(database, {
      saleId: data.saleId,
      supplierId: data.supplierId,
      description: `SaleItem: ${data.description}`,
      amount: roundMoney(qty * unitCost),
      dueAt: new Date(),
    });
    payableId = payable.id;

    await database.withTenantTransaction(async (client) => {
      await client.query(`UPDATE sale_items SET payable_id = $3 WHERE agency_id = $1 AND id = $2`, [
        agencyId,
        row.id,
        payableId,
      ]);
    });
  }

  return toSaleItem({ ...row, payable_id: payableId ?? row.payable_id });
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

  const sale = await getSaleById(database, existing.saleId);
  if (!sale) throw new NotFoundError('Sale not found');

  const row = await database.withTenantTransaction(async (client) => {
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

    return updated;
  });

  if (!row) return getSaleItemById(database, id);

  await updateSale(database, existing.saleId, {
    amount: roundMoney(Math.max(0, sale.amount - existing.lineTotal)),
  });

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
