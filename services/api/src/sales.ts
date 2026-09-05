import { SaleStatus, type Sale } from '../../../packages/domain/types';
import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';

interface SaleRow {
  id: string;
  agency_id: string;
  customer_id: string;
  proposal_id: string | null;
  broker_id: string | null;
  user_id: string | null;
  amount: string;
  discount: string;
  total: string;
  status: Sale['status'];
  notes: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ReceivableSyncRow {
  id: string;
  amount: string;
  status: string;
  paid_amount: string;
}

export interface CreateSaleInput {
  customerId: string;
  proposalId?: string;
  brokerId?: string;
  amount: number;
  discount?: number;
  notes?: string;
}

export interface UpdateSaleInput {
  amount?: number;
  discount?: number;
  notes?: string;
}

const SALE_COLUMNS = `id, agency_id, customer_id, proposal_id, broker_id, user_id, amount,
              discount, total, status, notes, paid_at, created_at, updated_at`;

// Postgres unique_violation error code (23505), used to translate the
// sales_agency_proposal_key UNIQUE constraint into a clean domain error
// instead of leaking a raw constraint name in a 500.
const POSTGRES_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}

/**
 * Computes the 2-decimal-safe monetary total for a Sale: total = amount - discount.
 * Same cents-based technique as proposals.ts's computeTotal, to avoid floating
 * point subtraction artifacts (e.g. 199.99 - 50.50 must be exactly 149.49).
 */
export function computeTotal(amount: number, discount: number): number {
  const amountCents = Math.round(amount * 100);
  const discountCents = Math.round(discount * 100);
  return (amountCents - discountCents) / 100;
}

// GET /sales is a single tenant-wide list (see app.ts route comment for the
// RBAC reasoning): userId is never populated on create in this vertical, so
// there is no populated "own" subset to filter "listar próprias" against.
export async function listSales(database: DatabaseRuntime): Promise<Sale[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<SaleRow>(
      `SELECT ${SALE_COLUMNS}
       FROM sales
       WHERE agency_id = $1
       ORDER BY created_at DESC`,
      [agencyId],
    );

    return result.rows.map(toSale);
  });
}

export async function getSaleById(database: DatabaseRuntime, id: string): Promise<Sale | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<SaleRow>(
      `SELECT ${SALE_COLUMNS}
       FROM sales
       WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );

    const row = result.rows[0];
    return row ? toSale(row) : null;
  });
}

export async function createSale(database: DatabaseRuntime, data: CreateSaleInput): Promise<Sale> {
  const agencyId = getAgencyId();

  if (data.amount < 0) {
    throw new ValidationError('Field "amount" must not be negative');
  }
  const discount = data.discount ?? 0;
  if (discount < 0) {
    throw new ValidationError('Field "discount" must not be negative');
  }
  if (discount > data.amount) {
    throw new ValidationError('Field "discount" must not exceed "amount"');
  }

  const total = computeTotal(data.amount, discount);
  if (total < 0) {
    throw new ValidationError('Computed "total" must not be negative');
  }

  return database.withTenantTransaction(async (client) => {
    const customerCheck = await client.query(
      `SELECT 1 FROM customers WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, data.customerId],
    );
    if (customerCheck.rows.length === 0) {
      throw new NotFoundError('Customer not found');
    }

    if (data.proposalId !== undefined) {
      const proposalCheck = await client.query(
        `SELECT 1 FROM proposals WHERE agency_id = $1 AND id = $2`,
        [agencyId, data.proposalId],
      );
      if (proposalCheck.rows.length === 0) {
        throw new NotFoundError('Proposal not found');
      }
    }

    if (data.brokerId !== undefined) {
      const brokerCheck = await client.query(
        `SELECT 1 FROM brokers WHERE agency_id = $1 AND id = $2`,
        [agencyId, data.brokerId],
      );
      if (brokerCheck.rows.length === 0) {
        throw new NotFoundError('Broker not found');
      }
    }

    // user_id is NOT NULL + FK-constrained at the SQL level (unlike Proposal's
    // optional userId), so it must be populated. It is taken from the
    // authenticated session's own tenant context (getUserId()), never from
    // client input -- this is server-derived identity, not client-settable,
    // so it is not authority spoofing.
    const userId = getUserId();

    try {
      const result = await client.query<SaleRow>(
        `INSERT INTO sales (agency_id, customer_id, proposal_id, broker_id, user_id, amount, discount, total, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${SALE_COLUMNS}`,
        [
          agencyId,
          data.customerId,
          data.proposalId ?? null,
          data.brokerId ?? null,
          userId,
          data.amount,
          discount,
          total,
          data.notes ?? null,
        ],
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error('Sale insert did not return a row');
      }
      if (total > 0) {
        await client.query(
          `INSERT INTO receivables (agency_id, sale_id, customer_id, description, amount, due_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [agencyId, row.id, data.customerId, 'Sale receivable', total],
        );

        // Create corresponding revenue record (idempotent: unique constraint on (agency_id, sale_id))
        const defaultCategory = await getOrCreateDefaultRevenueCategory(client, agencyId);
        await client.query(
          `INSERT INTO revenues
             (agency_id, sale_id, customer_id, category_id, description, amount, currency,
              competency_date, due_date, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now(), 'OPEN'::"RevenueStatus")
           ON CONFLICT (agency_id, sale_id) DO NOTHING`,
          [agencyId, row.id, data.customerId, defaultCategory.id, 'Sale revenue', total, 'BRL'],
        );

        await recordAuditEvent(client, {
          eventType: AuditEventType.SALE_CREATED,
          entityType: 'sale',
          entityId: row.id,
          metadata: {
            amount: total,
            customerId: data.customerId,
          },
        });
      }
      return toSale(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('A Sale already exists for this Proposal');
      }
      throw error;
    }
  });
}

export async function updateSale(
  database: DatabaseRuntime,
  id: string,
  data: UpdateSaleInput,
): Promise<Sale | null> {
  const agencyId = getAgencyId();

  if (data.amount !== undefined && data.amount < 0) {
    throw new ValidationError('Field "amount" must not be negative');
  }
  if (data.discount !== undefined && data.discount < 0) {
    throw new ValidationError('Field "discount" must not be negative');
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;
  let amountParamIndex: number | undefined;
  let discountParamIndex: number | undefined;

  if (data.amount !== undefined) {
    amountParamIndex = ++index;
    fields.push(`amount = $${amountParamIndex}`);
    values.push(data.amount);
  }
  if (data.discount !== undefined) {
    discountParamIndex = ++index;
    fields.push(`discount = $${discountParamIndex}`);
    values.push(data.discount);
  }
  if (data.notes !== undefined) {
    fields.push(`notes = $${++index}`);
    values.push(data.notes);
  }

  // Same COALESCE-in-WHERE technique as proposals.ts's updateProposal: reference
  // the bound parameter directly when the field is being changed, otherwise the
  // current column value. NUMERIC(10,2) subtraction in Postgres is exact decimal
  // arithmetic, so total is safely recomputed atomically in the same statement.
  const amountExpr = amountParamIndex !== undefined ? `$${amountParamIndex}::numeric` : 'amount';
  const discountExpr =
    discountParamIndex !== undefined ? `$${discountParamIndex}::numeric` : 'discount';

  if (data.amount !== undefined || data.discount !== undefined) {
    fields.push(`total = ${amountExpr} - ${discountExpr}`);
  }

  if (fields.length === 0) {
    return getSaleById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    let receivableToSync: ReceivableSyncRow | null = null;
    let nextTotal: number | null = null;
    let nextCustomerId: string | null = null;

    if (data.amount !== undefined || data.discount !== undefined) {
      const current = await client.query<SaleRow>(
        `SELECT ${SALE_COLUMNS}
         FROM sales
         WHERE agency_id = $1 AND id = $2
         FOR UPDATE`,
        [agencyId, id],
      );
      const currentRow = current.rows[0];
      if (!currentRow) return null;

      const nextAmount = data.amount ?? Number(currentRow.amount);
      const nextDiscount = data.discount ?? Number(currentRow.discount);
      if (nextDiscount > nextAmount) {
        throw new ValidationError('Field "discount" must not exceed "amount"');
      }

      receivableToSync = await getReceivableSyncState(client, agencyId, id);
      if (receivableToSync && Number(receivableToSync.paid_amount) > 0) {
        throw new ConflictError('Cannot edit Sale financial fields after receivable allocation');
      }

      nextTotal = computeTotal(nextAmount, nextDiscount);
      nextCustomerId = currentRow.customer_id;
    }

    const result = await client.query<SaleRow>(
      `UPDATE sales
       SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
         AND ${discountExpr} <= ${amountExpr}
       RETURNING ${SALE_COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    if (!row) {
      const existsCheck = await client.query(
        `SELECT 1 FROM sales WHERE agency_id = $1 AND id = $2`,
        [agencyId, id],
      );
      if (existsCheck.rows.length > 0) {
        throw new ValidationError('Field "discount" must not exceed "amount"');
      }
      return null;
    }

    if (nextTotal !== null && nextCustomerId !== null) {
      await syncUnallocatedSaleReceivable(client, agencyId, row.id, nextCustomerId, nextTotal, receivableToSync);
    }

    return toSale(row);
  });
}

export async function confirmSale(
  database: DatabaseRuntime,
  id: string,
): Promise<Sale | null> {
  return transitionSale(database, id, SaleStatus.CONFIRMED, [SaleStatus.PENDING]);
}

export async function cancelSale(
  database: DatabaseRuntime,
  id: string,
): Promise<Sale | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const current = await client.query<SaleRow>(
      `SELECT ${SALE_COLUMNS}
       FROM sales
       WHERE agency_id = $1 AND id = $2
       FOR UPDATE`,
      [agencyId, id],
    );
    const currentRow = current.rows[0];
    if (!currentRow) return null;

    if (currentRow.status === SaleStatus.CANCELLED) {
      return toSale(currentRow);
    }

    if (![SaleStatus.PENDING, SaleStatus.CONFIRMED].includes(currentRow.status)) {
      throw new ConflictError(`Cannot transition Sale from ${currentRow.status} to CANCELLED`);
    }

    const paidAmount = await getAllocatedReceivableAmount(client, agencyId, id);
    if (paidAmount > 0) {
      throw new ConflictError('Cannot cancel a Sale with allocated receivable payments');
    }

    const updated = await client.query<SaleRow>(
      `UPDATE sales
       SET status = 'CANCELLED', updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${SALE_COLUMNS}`,
      [agencyId, id],
    );

    await client.query(
      `UPDATE receivables
       SET status = 'CANCELLED', updated_at = now()
       WHERE agency_id = $1 AND sale_id = $2 AND status IN ('OPEN', 'PARTIALLY_PAID')`,
      [agencyId, id],
    );

    const row = updated.rows[0];
    if (!row) throw new Error('Sale cancellation did not return a row');
    return toSale(row);
  });
}

export async function markSalePaid(
  database: DatabaseRuntime,
  id: string,
): Promise<Sale | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const current = await client.query<SaleRow>(
      `SELECT ${SALE_COLUMNS}
       FROM sales
       WHERE agency_id = $1 AND id = $2
       FOR UPDATE`,
      [agencyId, id],
    );
    const currentRow = current.rows[0];
    if (!currentRow) return null;

    if (currentRow.status === SaleStatus.PAID) {
      return toSale(currentRow);
    }

    if (currentRow.status !== SaleStatus.CONFIRMED) {
      throw new ConflictError(`Cannot transition Sale from ${currentRow.status} to PAID`);
    }

    const total = Number(currentRow.total);
    if (total > 0) {
      const receivable = await getReceivablePaymentSummary(client, agencyId, id);
      if (!receivable || receivable.paidAmount < receivable.amount) {
        throw new ConflictError('Sale can be marked PAID only after its Receivable is fully paid');
      }
    }

    const updated = await client.query<SaleRow>(
      `UPDATE sales
       SET status = 'PAID', paid_at = now(), updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${SALE_COLUMNS}`,
      [agencyId, id],
    );

    const row = updated.rows[0];
    if (!row) throw new Error('Sale payment transition did not return a row');
    return toSale(row);
  });
}

async function transitionSale(
  database: DatabaseRuntime,
  id: string,
  targetStatus: SaleStatus,
  allowedFrom: SaleStatus[],
): Promise<Sale | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const current = await client.query<SaleRow>(
      `SELECT ${SALE_COLUMNS}
       FROM sales
       WHERE agency_id = $1 AND id = $2
       FOR UPDATE`,
      [agencyId, id],
    );
    const currentRow = current.rows[0];
    if (!currentRow) return null;

    if (currentRow.status === targetStatus) {
      return toSale(currentRow);
    }

    if (!allowedFrom.includes(currentRow.status)) {
      throw new ConflictError(`Cannot transition Sale from ${currentRow.status} to ${targetStatus}`);
    }

    const updated = await client.query<SaleRow>(
      `UPDATE sales
       SET status = $3, updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${SALE_COLUMNS}`,
      [agencyId, id, targetStatus],
    );

    const row = updated.rows[0];
    if (!row) throw new Error('Sale transition did not return a row');
    return toSale(row);
  });
}

async function getAllocatedReceivableAmount(
  client: TenantTransactionClient,
  agencyId: string,
  saleId: string,
): Promise<number> {
  const result = await client.query<{ paid_amount: string }>(
    `SELECT COALESCE(sum(pa.amount), 0)::numeric(12,2) AS paid_amount
     FROM receivables r
     LEFT JOIN payment_allocations pa
       ON pa.agency_id = r.agency_id AND pa.receivable_id = r.id
     WHERE r.agency_id = $1 AND r.sale_id = $2`,
    [agencyId, saleId],
  );
  return Number(result.rows[0]?.paid_amount ?? 0);
}

async function getReceivablePaymentSummary(
  client: TenantTransactionClient,
  agencyId: string,
  saleId: string,
): Promise<{ amount: number; paidAmount: number } | null> {
  const result = await client.query<{ amount: string; paid_amount: string }>(
    `SELECT r.amount, COALESCE(sum(pa.amount), 0)::numeric(12,2) AS paid_amount
     FROM receivables r
     LEFT JOIN payment_allocations pa
       ON pa.agency_id = r.agency_id AND pa.receivable_id = r.id
     WHERE r.agency_id = $1 AND r.sale_id = $2
     GROUP BY r.id, r.amount`,
    [agencyId, saleId],
  );
  const row = result.rows[0];
  return row ? { amount: Number(row.amount), paidAmount: Number(row.paid_amount) } : null;
}

async function getReceivableSyncState(
  client: TenantTransactionClient,
  agencyId: string,
  saleId: string,
): Promise<ReceivableSyncRow | null> {
  const result = await client.query<ReceivableSyncRow>(
    `SELECT r.id,
            r.amount,
            r.status,
            COALESCE(allocations.paid_amount, 0)::numeric(12,2) AS paid_amount
     FROM receivables r
     LEFT JOIN (
       SELECT agency_id, receivable_id, sum(amount) AS paid_amount
       FROM payment_allocations
       WHERE agency_id = $1
       GROUP BY agency_id, receivable_id
     ) allocations
       ON allocations.agency_id = r.agency_id AND allocations.receivable_id = r.id
     WHERE r.agency_id = $1 AND r.sale_id = $2
     FOR UPDATE OF r`,
    [agencyId, saleId],
  );

  return result.rows[0] ?? null;
}

async function syncUnallocatedSaleReceivable(
  client: TenantTransactionClient,
  agencyId: string,
  saleId: string,
  customerId: string,
  total: number,
  receivable: ReceivableSyncRow | null,
): Promise<void> {
  if (total <= 0) {
    if (receivable) {
      await client.query(
        `UPDATE receivables
         SET status = 'CANCELLED', updated_at = now()
         WHERE agency_id = $1 AND id = $2`,
        [agencyId, receivable.id],
      );
    }
    return;
  }

  if (!receivable) {
    await client.query(
      `INSERT INTO receivables (agency_id, sale_id, customer_id, description, amount, due_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [agencyId, saleId, customerId, 'Sale receivable', total],
    );
    return;
  }

  await client.query(
    `UPDATE receivables
     SET amount = $3, status = 'OPEN', updated_at = now()
     WHERE agency_id = $1 AND id = $2`,
    [agencyId, receivable.id, total],
  );
}

async function getOrCreateDefaultRevenueCategory(
  client: TenantTransactionClient,
  agencyId: string,
): Promise<{ id: string }> {
  // Try to get existing default category
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM financial_categories
     WHERE agency_id = $1 AND type = 'REVENUE' AND name = 'Sales'
     LIMIT 1`,
    [agencyId],
  );

  if (existing.rows.length > 0 && existing.rows[0]) {
    return existing.rows[0];
  }

  // Create default category if it doesn't exist
  const result = await client.query<{ id: string }>(
    `INSERT INTO financial_categories (agency_id, name, type, description)
     VALUES ($1, $2, 'REVENUE', 'Default category for sales revenue')
     ON CONFLICT (agency_id, type, name) DO UPDATE SET id = financial_categories.id
     RETURNING id`,
    [agencyId, 'Sales'],
  );

  const row = result.rows[0];
  if (!row) throw new Error('Failed to create default revenue category');
  return row;
}

export interface SaleWithCustomer extends Sale {
  customerName: string;
  salespersonName: string | null;
  tripId: string | null;
  tripName: string | null;
}

interface SaleWithCustomerRow extends SaleRow {
  customer_name: string;
  salesperson_name: string | null;
  trip_id: string | null;
  trip_name: string | null;
}

const SALE_WITH_CUSTOMER_QUERY = `
  SELECT s.id, s.agency_id, s.customer_id, s.proposal_id, s.broker_id, s.user_id, s.amount,
         s.discount, s.total, s.status, s.notes, s.paid_at, s.created_at, s.updated_at,
         c.name AS customer_name,
         u.name AS salesperson_name,
         t.id AS trip_id,
         t.name AS trip_name
  FROM sales s
  JOIN customers c ON c.agency_id = s.agency_id AND c.id = s.customer_id
  LEFT JOIN users u ON u.agency_id = s.agency_id AND u.id = s.user_id
  LEFT JOIN trips t ON t.agency_id = s.agency_id AND t.sale_id = s.id
`;

// Read-model for UI surfaces (sale list/detail) that need a human-readable
// customer/salesperson/trip label alongside the sale, without forcing every
// other listSales/getSaleById caller (confirmSale, cancelSale, ...) to carry
// the extra joins. One query, no N+1: the join happens in SQL, not per-row.
export async function listSalesWithCustomer(database: DatabaseRuntime): Promise<SaleWithCustomer[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<SaleWithCustomerRow>(
      `${SALE_WITH_CUSTOMER_QUERY}
       WHERE s.agency_id = $1
       ORDER BY s.created_at DESC`,
      [agencyId],
    );

    return result.rows.map(toSaleWithCustomer);
  });
}

export async function getSaleWithCustomerById(
  database: DatabaseRuntime,
  id: string,
): Promise<SaleWithCustomer | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<SaleWithCustomerRow>(
      `${SALE_WITH_CUSTOMER_QUERY}
       WHERE s.agency_id = $1 AND s.id = $2`,
      [agencyId, id],
    );

    const row = result.rows[0];
    return row ? toSaleWithCustomer(row) : null;
  });
}

function toSaleWithCustomer(row: SaleWithCustomerRow): SaleWithCustomer {
  return {
    ...toSale(row),
    customerName: row.customer_name,
    salespersonName: row.salesperson_name,
    tripId: row.trip_id,
    tripName: row.trip_name,
  };
}

function toSale(row: SaleRow): Sale {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerId: row.customer_id,
    // userId is NOT NULL in the DB and is always populated server-side from
    // the authenticated session at create time (see createSale).
    userId: row.user_id ?? '',
    amount: Number(row.amount),
    discount: Number(row.discount),
    total: Number(row.total),
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.proposal_id !== null ? { proposalId: row.proposal_id } : {}),
    ...(row.broker_id !== null ? { brokerId: row.broker_id } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
    ...(row.paid_at !== null ? { paidAt: new Date(row.paid_at) } : {}),
  };
}
