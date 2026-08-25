import type { Sale } from '../../../packages/domain/types';
import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';

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
    return toSale(row);
  });
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
