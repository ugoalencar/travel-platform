import type { Wish } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { NotFoundError } from './errors';

interface WishRow {
  id: string;
  agency_id: string;
  customer_id: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: string | null;
  travelers_count: number | null;
  notes: string | null;
  status: Wish['status'];
  created_at: string;
  updated_at: string;
}

export interface CreateWishInput {
  destination?: string;
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  travelersCount?: number;
  notes?: string;
}

export interface UpdateWishInput {
  destination?: string;
  startDate?: Date;
  endDate?: Date;
  budget?: number;
  travelersCount?: number;
  notes?: string;
}

const WISH_COLUMNS = `id, agency_id, customer_id, destination, start_date, end_date, budget,
              travelers_count, notes, status, created_at, updated_at`;

export async function listWishes(database: DatabaseRuntime): Promise<Wish[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<WishRow>(
      `SELECT ${WISH_COLUMNS}
       FROM wishes
       WHERE agency_id = $1
       ORDER BY created_at DESC`,
      [agencyId],
    );

    return result.rows.map(toWish);
  });
}

export async function listWishesByCustomer(
  database: DatabaseRuntime,
  customerId: string,
): Promise<Wish[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<WishRow>(
      `SELECT ${WISH_COLUMNS}
       FROM wishes
       WHERE agency_id = $1 AND customer_id = $2
       ORDER BY created_at DESC`,
      [agencyId, customerId],
    );

    return result.rows.map(toWish);
  });
}

export async function getWishById(database: DatabaseRuntime, id: string): Promise<Wish | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<WishRow>(
      `SELECT ${WISH_COLUMNS}
       FROM wishes
       WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );

    const row = result.rows[0];
    return row ? toWish(row) : null;
  });
}

export async function createWish(
  database: DatabaseRuntime,
  customerId: string,
  data: CreateWishInput,
): Promise<Wish> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const customerCheck = await client.query(
      `SELECT 1 FROM customers WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, customerId],
    );

    if (customerCheck.rows.length === 0) {
      throw new NotFoundError('Customer not found');
    }

    const result = await client.query<WishRow>(
      `INSERT INTO wishes (agency_id, customer_id, destination, start_date, end_date, budget,
                            travelers_count, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${WISH_COLUMNS}`,
      [
        agencyId,
        customerId,
        data.destination ?? null,
        data.startDate ?? null,
        data.endDate ?? null,
        data.budget ?? null,
        data.travelersCount ?? null,
        data.notes ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Wish insert did not return a row');
    }
    return toWish(row);
  });
}

export async function updateWish(
  database: DatabaseRuntime,
  id: string,
  data: UpdateWishInput,
): Promise<Wish | null> {
  const agencyId = getAgencyId();

  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (data.destination !== undefined) {
    fields.push(`destination = $${++index}`);
    values.push(data.destination);
  }
  if (data.startDate !== undefined) {
    fields.push(`start_date = $${++index}`);
    values.push(data.startDate);
  }
  if (data.endDate !== undefined) {
    fields.push(`end_date = $${++index}`);
    values.push(data.endDate);
  }
  if (data.budget !== undefined) {
    fields.push(`budget = $${++index}`);
    values.push(data.budget);
  }
  if (data.travelersCount !== undefined) {
    fields.push(`travelers_count = $${++index}`);
    values.push(data.travelersCount);
  }
  if (data.notes !== undefined) {
    fields.push(`notes = $${++index}`);
    values.push(data.notes);
  }

  if (fields.length === 0) {
    return getWishById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<WishRow>(
      `UPDATE wishes
       SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${WISH_COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    return row ? toWish(row) : null;
  });
}

function toWish(row: WishRow): Wish {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerId: row.customer_id,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.destination !== null ? { destination: row.destination } : {}),
    ...(row.start_date !== null ? { startDate: new Date(row.start_date) } : {}),
    ...(row.end_date !== null ? { endDate: new Date(row.end_date) } : {}),
    ...(row.budget !== null ? { budget: Number(row.budget) } : {}),
    ...(row.travelers_count !== null ? { travelersCount: row.travelers_count } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}
