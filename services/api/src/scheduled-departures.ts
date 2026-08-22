import type { DepartureServiceType, ScheduledDeparture } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { NotFoundError, ValidationError } from './errors';

interface DepartureRow {
  id: string;
  agency_id: string;
  product_id: string;
  departure_at: string;
  arrival_expected_at: string | null;
  capacity: number;
  supplier_id: string | null;
  service_type: DepartureServiceType;
  cancelled: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateScheduledDepartureInput {
  productId: string;
  departureAt: Date;
  arrivalExpectedAt?: Date;
  capacity: number;
  supplierId?: string;
  serviceType: DepartureServiceType;
  notes?: string;
}

export interface UpdateScheduledDepartureInput {
  departureAt?: Date;
  arrivalExpectedAt?: Date;
  capacity?: number;
  supplierId?: string;
  serviceType?: DepartureServiceType;
  cancelled?: boolean;
  notes?: string;
}

const DEPARTURE_COLUMNS = `id, agency_id, product_id, departure_at, arrival_expected_at, capacity,
              supplier_id, service_type, cancelled, notes, created_at, updated_at`;

export async function listScheduledDepartures(
  database: DatabaseRuntime,
): Promise<ScheduledDeparture[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DepartureRow>(
      `SELECT ${DEPARTURE_COLUMNS} FROM scheduled_departures
       WHERE agency_id = $1 ORDER BY departure_at ASC`,
      [agencyId],
    );
    return result.rows.map(toDeparture);
  });
}

export async function getScheduledDepartureById(
  database: DatabaseRuntime,
  id: string,
): Promise<ScheduledDeparture | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DepartureRow>(
      `SELECT ${DEPARTURE_COLUMNS} FROM scheduled_departures WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toDeparture(row) : null;
  });
}

export async function createScheduledDeparture(
  database: DatabaseRuntime,
  data: CreateScheduledDepartureInput,
): Promise<ScheduledDeparture> {
  const agencyId = getAgencyId();

  // P0-2: overbooking is not permitted; capacity is a hard limit. There
  // is no Booking table yet, so nothing consumes capacity at creation
  // time -- the only enforceable rule here is non-negativity. Real
  // enforcement against consumption happens in a future Booking-creation
  // transaction, not here.
  if (data.capacity < 0) {
    throw new ValidationError('Field "capacity" must not be negative');
  }
  if (
    data.arrivalExpectedAt !== undefined &&
    data.arrivalExpectedAt.getTime() < data.departureAt.getTime()
  ) {
    throw new ValidationError('Field "arrivalExpectedAt" must not be before "departureAt"');
  }

  return database.withTenantTransaction(async (client) => {
    const productCheck = await client.query(
      `SELECT 1 FROM transport_products WHERE agency_id = $1 AND id = $2`,
      [agencyId, data.productId],
    );
    if (productCheck.rows.length === 0) {
      throw new NotFoundError('Transport product not found');
    }

    if (data.supplierId !== undefined) {
      const supplierCheck = await client.query(
        `SELECT 1 FROM suppliers WHERE agency_id = $1 AND id = $2`,
        [agencyId, data.supplierId],
      );
      if (supplierCheck.rows.length === 0) {
        throw new NotFoundError('Supplier not found');
      }
    }

    const result = await client.query<DepartureRow>(
      `INSERT INTO scheduled_departures
         (agency_id, product_id, departure_at, arrival_expected_at, capacity, supplier_id, service_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${DEPARTURE_COLUMNS}`,
      [
        agencyId,
        data.productId,
        data.departureAt,
        data.arrivalExpectedAt ?? null,
        data.capacity,
        data.supplierId ?? null,
        data.serviceType,
        data.notes ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('ScheduledDeparture insert did not return a row');
    }
    return toDeparture(row);
  });
}

export async function updateScheduledDeparture(
  database: DatabaseRuntime,
  id: string,
  data: UpdateScheduledDepartureInput,
): Promise<ScheduledDeparture | null> {
  const agencyId = getAgencyId();

  if (data.capacity !== undefined && data.capacity < 0) {
    throw new ValidationError('Field "capacity" must not be negative');
  }

  return database.withTenantTransaction(async (client) => {
    if (data.supplierId !== undefined) {
      const supplierCheck = await client.query(
        `SELECT 1 FROM suppliers WHERE agency_id = $1 AND id = $2`,
        [agencyId, data.supplierId],
      );
      if (supplierCheck.rows.length === 0) {
        throw new NotFoundError('Supplier not found');
      }
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (data.departureAt !== undefined) {
      fields.push(`departure_at = $${++index}`);
      values.push(data.departureAt);
    }
    if (data.arrivalExpectedAt !== undefined) {
      fields.push(`arrival_expected_at = $${++index}`);
      values.push(data.arrivalExpectedAt);
    }
    if (data.capacity !== undefined) {
      fields.push(`capacity = $${++index}`);
      values.push(data.capacity);
    }
    if (data.supplierId !== undefined) {
      fields.push(`supplier_id = $${++index}`);
      values.push(data.supplierId);
    }
    if (data.serviceType !== undefined) {
      fields.push(`service_type = $${++index}`);
      values.push(data.serviceType);
    }
    if (data.cancelled !== undefined) {
      fields.push(`cancelled = $${++index}`);
      values.push(data.cancelled);
    }
    if (data.notes !== undefined) {
      fields.push(`notes = $${++index}`);
      values.push(data.notes);
    }

    if (fields.length === 0) {
      const existing = await client.query<DepartureRow>(
        `SELECT ${DEPARTURE_COLUMNS} FROM scheduled_departures WHERE agency_id = $1 AND id = $2`,
        [agencyId, id],
      );
      const row = existing.rows[0];
      return row ? toDeparture(row) : null;
    }

    const result = await client.query<DepartureRow>(
      `UPDATE scheduled_departures SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${DEPARTURE_COLUMNS}`,
      [agencyId, ...values, id],
    );

    const row = result.rows[0];
    return row ? toDeparture(row) : null;
  });
}

interface AgendaRow extends DepartureRow {
  product_name: string;
  product_trip_type: DepartureRow['service_type'];
  outbound_origin: string;
  outbound_destination: string;
  supplier_name: string | null;
}

export interface AgendaEntry {
  departure: ScheduledDeparture;
  productName: string;
  outboundOrigin: string;
  outboundDestination: string;
  supplierName?: string;
  // Stub: no Booking integration exists yet, so availableSeats is
  // always equal to capacity (nothing consumes it). See brief P0-2/P1-1.
  availableSeats: number;
}

export async function getAgenda(
  database: DatabaseRuntime,
  filters: { from?: Date; to?: Date } = {},
): Promise<AgendaEntry[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const conditions = ['sd.agency_id = $1'];
    const values: unknown[] = [agencyId];

    if (filters.from !== undefined) {
      values.push(filters.from);
      conditions.push(`sd.departure_at >= $${values.length}`);
    }
    if (filters.to !== undefined) {
      values.push(filters.to);
      conditions.push(`sd.departure_at <= $${values.length}`);
    }

    const result = await client.query<AgendaRow>(
      `SELECT sd.id, sd.agency_id, sd.product_id, sd.departure_at, sd.arrival_expected_at,
              sd.capacity, sd.supplier_id, sd.service_type, sd.cancelled, sd.notes,
              sd.created_at, sd.updated_at,
              tp.name AS product_name, tp.trip_type AS product_trip_type,
              r.origin AS outbound_origin, r.destination AS outbound_destination,
              s.name AS supplier_name
       FROM scheduled_departures sd
       JOIN transport_products tp ON tp.agency_id = sd.agency_id AND tp.id = sd.product_id
       JOIN routes r ON r.agency_id = tp.agency_id AND r.id = tp.outbound_route_id
       LEFT JOIN suppliers s ON s.agency_id = sd.agency_id AND s.id = sd.supplier_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY sd.departure_at ASC`,
      values,
    );

    return result.rows.map((row) => ({
      departure: toDeparture(row),
      productName: row.product_name,
      outboundOrigin: row.outbound_origin,
      outboundDestination: row.outbound_destination,
      availableSeats: row.cancelled ? 0 : row.capacity,
      ...(row.supplier_name !== null ? { supplierName: row.supplier_name } : {}),
    }));
  });
}

function toDeparture(row: DepartureRow): ScheduledDeparture {
  return {
    id: row.id,
    agencyId: row.agency_id,
    productId: row.product_id,
    departureAt: new Date(row.departure_at),
    capacity: row.capacity,
    serviceType: row.service_type,
    cancelled: row.cancelled,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.arrival_expected_at !== null
      ? { arrivalExpectedAt: new Date(row.arrival_expected_at) }
      : {}),
    ...(row.supplier_id !== null ? { supplierId: row.supplier_id } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}
