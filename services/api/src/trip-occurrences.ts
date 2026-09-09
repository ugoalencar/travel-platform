import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { NotFoundError } from './errors';

export type TripOccurrenceType =
  | 'ATRASO'
  | 'CANCELAMENTO'
  | 'PROBLEMA_DOCUMENTO'
  | 'RECLAMACAO'
  | 'OUTRO';
export type TripOccurrenceSeverity = 'BAIXA' | 'MEDIA' | 'ALTA';
export type TripOccurrenceStatus = 'ABERTA' | 'EM_ANDAMENTO' | 'RESOLVIDA';

export interface TripOccurrence {
  id: string;
  agencyId: string;
  tripId: string;
  bookingId: string | null;
  type: TripOccurrenceType;
  description: string;
  severity: TripOccurrenceSeverity;
  status: TripOccurrenceStatus;
  reportedBy: string;
  reportedAt: Date;
  resolvedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Denormalized for list display -- avoids an N+1 join in the frontend.
  tripName: string;
  customerName: string;
}

interface TripOccurrenceRow {
  id: string;
  agency_id: string;
  trip_id: string;
  booking_id: string | null;
  type: TripOccurrenceType;
  description: string;
  severity: TripOccurrenceSeverity;
  status: TripOccurrenceStatus;
  reported_by: string;
  reported_at: string;
  resolved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  trip_name: string;
  customer_name: string;
}

export interface CreateTripOccurrenceInput {
  tripId: string;
  bookingId?: string;
  type: TripOccurrenceType;
  description: string;
  severity?: TripOccurrenceSeverity;
  reportedBy: string;
  notes?: string;
}

export interface UpdateTripOccurrenceInput {
  status?: TripOccurrenceStatus;
  severity?: TripOccurrenceSeverity;
  description?: string;
  notes?: string;
}

const SELECT_COLUMNS = `
  o.id, o.agency_id, o.trip_id, o.booking_id, o.type, o.description, o.severity, o.status,
  o.reported_by, o.reported_at, o.resolved_at, o.notes, o.created_at, o.updated_at,
  t.name AS trip_name, c.name AS customer_name
`;

const FROM_JOIN = `
  FROM trip_occurrences o
  JOIN trips t ON t.agency_id = o.agency_id AND t.id = o.trip_id
  JOIN customers c ON c.agency_id = t.agency_id AND c.id = t.customer_id
`;

export async function listTripOccurrences(database: DatabaseRuntime): Promise<TripOccurrence[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TripOccurrenceRow>(
      `SELECT ${SELECT_COLUMNS} ${FROM_JOIN}
       WHERE o.agency_id = $1
       ORDER BY o.reported_at DESC`,
      [agencyId],
    );
    return result.rows.map(toTripOccurrence);
  });
}

export async function getTripOccurrenceById(
  database: DatabaseRuntime,
  id: string,
): Promise<TripOccurrence | null> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TripOccurrenceRow>(
      `SELECT ${SELECT_COLUMNS} ${FROM_JOIN}
       WHERE o.agency_id = $1 AND o.id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toTripOccurrence(row) : null;
  });
}

export async function createTripOccurrence(
  database: DatabaseRuntime,
  data: CreateTripOccurrenceInput,
): Promise<TripOccurrence> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const tripCheck = await client.query(
      `SELECT 1 FROM trips WHERE agency_id = $1 AND id = $2`,
      [agencyId, data.tripId],
    );
    if (tripCheck.rows.length === 0) {
      throw new NotFoundError('Trip not found');
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO trip_occurrences
         (agency_id, trip_id, booking_id, type, description, severity, reported_by, notes)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'MEDIA'), $7, $8)
       RETURNING id`,
      [
        agencyId,
        data.tripId,
        data.bookingId ?? null,
        data.type,
        data.description,
        data.severity ?? null,
        data.reportedBy,
        data.notes ?? null,
      ],
    );

    const id = inserted.rows[0]?.id;
    if (!id) {
      throw new Error('Trip occurrence insert did not return a row');
    }

    const result = await client.query<TripOccurrenceRow>(
      `SELECT ${SELECT_COLUMNS} ${FROM_JOIN} WHERE o.agency_id = $1 AND o.id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Trip occurrence lookup after insert returned no row');
    }
    return toTripOccurrence(row);
  });
}

export async function updateTripOccurrence(
  database: DatabaseRuntime,
  id: string,
  data: UpdateTripOccurrenceInput,
): Promise<TripOccurrence | null> {
  const agencyId = getAgencyId();

  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 2;

  if (data.status !== undefined) {
    index += 1;
    fields.push(`status = $${index}`);
    values.push(data.status);
    if (data.status === 'RESOLVIDA') {
      fields.push(`resolved_at = now()`);
    } else {
      fields.push(`resolved_at = NULL`);
    }
  }
  if (data.severity !== undefined) {
    index += 1;
    fields.push(`severity = $${index}`);
    values.push(data.severity);
  }
  if (data.description !== undefined) {
    index += 1;
    fields.push(`description = $${index}`);
    values.push(data.description);
  }
  if (data.notes !== undefined) {
    index += 1;
    fields.push(`notes = $${index}`);
    values.push(data.notes);
  }

  if (fields.length === 0) {
    return getTripOccurrenceById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query(
      `UPDATE trip_occurrences
       SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}`,
      [agencyId, ...values, id],
    );
    if (result.rowCount === 0) {
      return null;
    }
    return getTripOccurrenceById(database, id);
  });
}

function toTripOccurrence(row: TripOccurrenceRow): TripOccurrence {
  return {
    id: row.id,
    agencyId: row.agency_id,
    tripId: row.trip_id,
    bookingId: row.booking_id,
    type: row.type,
    description: row.description,
    severity: row.severity,
    status: row.status,
    reportedBy: row.reported_by,
    reportedAt: new Date(row.reported_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    notes: row.notes,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    tripName: row.trip_name,
    customerName: row.customer_name,
  };
}
