import type { Trip } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { NotFoundError, ValidationError } from './errors';

interface TripRow {
  id: string;
  agency_id: string;
  customer_id: string;
  sale_id: string | null;
  name: string;
  destination: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: Trip['status'];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTripInput {
  name: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  description?: string;
  notes?: string;
}

export interface UpdateTripInput {
  name?: string;
  destination?: string;
  startDate?: Date;
  endDate?: Date;
  description?: string;
  notes?: string;
}

const TRIP_COLUMNS = `id, agency_id, customer_id, sale_id, name, destination, description,
              start_date, end_date, status, notes, created_at, updated_at`;

export async function listTrips(database: DatabaseRuntime): Promise<Trip[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TripRow>(
      `SELECT ${TRIP_COLUMNS}
       FROM trips
       WHERE agency_id = $1
       ORDER BY created_at DESC`,
      [agencyId],
    );

    return result.rows.map(toTrip);
  });
}

export async function getTripById(database: DatabaseRuntime, id: string): Promise<Trip | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TripRow>(
      `SELECT ${TRIP_COLUMNS}
       FROM trips
       WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );

    const row = result.rows[0];
    return row ? toTrip(row) : null;
  });
}

export async function createTrip(
  database: DatabaseRuntime,
  customerId: string,
  data: CreateTripInput,
): Promise<Trip> {
  const agencyId = getAgencyId();

  if (data.startDate.getTime() > data.endDate.getTime()) {
    throw new ValidationError('Field "startDate" must not be after "endDate"');
  }

  return database.withTenantTransaction(async (client) => {
    const customerCheck = await client.query(
      `SELECT 1 FROM customers WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, customerId],
    );

    if (customerCheck.rows.length === 0) {
      throw new NotFoundError('Customer not found');
    }

    const result = await client.query<TripRow>(
      `INSERT INTO trips (agency_id, customer_id, name, destination, description, start_date,
                           end_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${TRIP_COLUMNS}`,
      [
        agencyId,
        customerId,
        data.name,
        data.destination,
        data.description ?? null,
        data.startDate,
        data.endDate,
        data.notes ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Trip insert did not return a row');
    }
    return toTrip(row);
  });
}

export async function updateTrip(
  database: DatabaseRuntime,
  id: string,
  data: UpdateTripInput,
): Promise<Trip | null> {
  const agencyId = getAgencyId();

  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${++index}`);
    values.push(data.name);
  }
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
  if (data.description !== undefined) {
    fields.push(`description = $${++index}`);
    values.push(data.description);
  }
  if (data.notes !== undefined) {
    fields.push(`notes = $${++index}`);
    values.push(data.notes);
  }

  if (fields.length === 0) {
    return getTripById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    // The date-range CHECK constraint (start_date <= end_date) must be validated at the
    // app layer even for partial updates. When only one of the two dates is present in
    // this PATCH, we need the *other* current value from the row to validate the full
    // range, so the comparison is done in SQL against COALESCE(new value, current value)
    // as part of the same UPDATE statement (single round trip, no separate SELECT, and
    // the WHERE clause already keeps this tenant-scoped and atomic).
    const startDateExpr = data.startDate !== undefined ? `$${values.indexOf(data.startDate) + 2}` : 'start_date';
    const endDateExpr = data.endDate !== undefined ? `$${values.indexOf(data.endDate) + 2}` : 'end_date';

    const result = await client.query<TripRow>(
      `UPDATE trips
       SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
         AND ${startDateExpr} <= ${endDateExpr}
       RETURNING ${TRIP_COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    if (!row) {
      // Distinguish "no such tenant row" (return null, matches Wish precedent) from
      // "row exists but the date-range guard rejected it" (return a clean 400).
      const existsCheck = await client.query(
        `SELECT 1 FROM trips WHERE agency_id = $1 AND id = $2`,
        [agencyId, id],
      );
      if (existsCheck.rows.length > 0) {
        throw new ValidationError('Field "startDate" must not be after "endDate"');
      }
      return null;
    }
    return toTrip(row);
  });
}

function toTrip(row: TripRow): Trip {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerId: row.customer_id,
    name: row.name,
    destination: row.destination,
    startDate: new Date(row.start_date),
    endDate: new Date(row.end_date),
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.sale_id !== null ? { saleId: row.sale_id } : {}),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}
