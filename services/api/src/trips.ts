import type { Trip } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { NotFoundError, ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';

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

export type TripCategory = 'AEREO' | 'TERRESTRE' | 'EXCURSAO' | 'OUTRO';

export interface TripWithCategory extends Trip {
  category: TripCategory;
}

interface TripRowWithCategory extends TripRow {
  is_excursion: boolean;
  is_air: boolean;
  is_land: boolean;
}

export interface ListTripsFilters {
  customerId?: string | undefined;
  category?: TripCategory | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
}

function toCategory(row: TripRowWithCategory): TripCategory {
  if (row.is_excursion) return 'EXCURSAO';
  if (row.is_air) return 'AEREO';
  if (row.is_land) return 'TERRESTRE';
  return 'OUTRO';
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

const TRIP_COLUMN_NAMES = [
  'id', 'agency_id', 'customer_id', 'sale_id', 'name', 'destination', 'description',
  'start_date', 'end_date', 'status', 'notes', 'created_at', 'updated_at',
] as const;
const TRIP_COLUMNS = TRIP_COLUMN_NAMES.join(', ');

export async function listTrips(
  database: DatabaseRuntime,
  filters: ListTripsFilters = {},
): Promise<TripWithCategory[]> {
  const agencyId = getAgencyId();

  const conditions = ['t.agency_id = $1'];
  const values: unknown[] = [agencyId];

  if (filters.customerId) {
    values.push(filters.customerId);
    conditions.push(`t.customer_id = $${values.length}`);
  }
  if (filters.startDate) {
    values.push(filters.startDate);
    conditions.push(`t.end_date >= $${values.length}`);
  }
  if (filters.endDate) {
    values.push(filters.endDate);
    conditions.push(`t.start_date <= $${values.length}`);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TripRowWithCategory>(
      `SELECT ${TRIP_COLUMN_NAMES.map((c) => `t.${c}`).join(', ')},
              EXISTS (SELECT 1 FROM excursion_customers ec WHERE ec.agency_id = t.agency_id AND ec.trip_id = t.id) AS is_excursion,
              EXISTS (SELECT 1 FROM air_services a WHERE a.agency_id = t.agency_id AND a.trip_id = t.id) AS is_air,
              EXISTS (SELECT 1 FROM land_services l WHERE l.agency_id = t.agency_id AND l.trip_id = t.id) AS is_land
       FROM trips t
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.created_at DESC`,
      values,
    );

    let rows = result.rows;
    if (filters.category) {
      rows = rows.filter((row) => toCategory(row) === filters.category);
    }

    return rows.map((row) => ({ ...toTrip(row), category: toCategory(row) }));
  });
}

export async function listTripsByCustomer(
  database: DatabaseRuntime,
  customerId: string,
): Promise<Trip[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TripRow>(
      `SELECT ${TRIP_COLUMNS}
       FROM trips
       WHERE agency_id = $1 AND customer_id = $2
       ORDER BY created_at DESC`,
      [agencyId, customerId],
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
    const trip = toTrip(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.TRIP_CREATED,
      entityType: 'trip',
      entityId: trip.id,
    });
    return trip;
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
  const changedFields: string[] = [];
  let index = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${++index}`);
    values.push(data.name);
    changedFields.push('name');
  }
  if (data.destination !== undefined) {
    fields.push(`destination = $${++index}`);
    values.push(data.destination);
    changedFields.push('destination');
  }
  if (data.startDate !== undefined) {
    fields.push(`start_date = $${++index}`);
    values.push(data.startDate);
    changedFields.push('startDate');
  }
  if (data.endDate !== undefined) {
    fields.push(`end_date = $${++index}`);
    values.push(data.endDate);
    changedFields.push('endDate');
  }
  if (data.description !== undefined) {
    fields.push(`description = $${++index}`);
    values.push(data.description);
    changedFields.push('description');
  }
  if (data.notes !== undefined) {
    fields.push(`notes = $${++index}`);
    values.push(data.notes);
    changedFields.push('notes');
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
    const trip = toTrip(row);
    await recordAuditEvent(client, {
      eventType: AuditEventType.TRIP_UPDATED,
      entityType: 'trip',
      entityId: trip.id,
      metadata: { fieldsChanged: changedFields },
    });
    return trip;
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
