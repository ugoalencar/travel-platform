import type {
  AirCabinClass,
  AirSegmentDirection,
  AirService,
  AirServiceStatus,
  FinancialObligationStatus,
} from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';

interface AirServiceRow {
  id: string;
  agency_id: string;
  trip_id: string;
  booking_id: string | null;
  supplier_id: string | null;
  customer_id: string;
  dependent_id: string | null;
  airline: string;
  consolidator: string | null;
  direction: AirSegmentDirection;
  sequence: number;
  origin: string;
  destination: string;
  departure_date: string;
  departure_time: string | null;
  arrival_date: string;
  arrival_time: string | null;
  flight_number: string | null;
  cabin_class: AirCabinClass;
  booking_locator: string | null;
  ticket_number: string | null;
  baggage: string | null;
  seat: string | null;
  fare: string;
  taxes: string;
  fees: string;
  commission: string | null;
  cost: string;
  sale_value: string;
  currency: string;
  supplier_due_date: string | null;
  supplier_payment_status: FinancialObligationStatus;
  status: AirServiceStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AirServiceInput {
  tripId: string;
  bookingId?: string;
  supplierId?: string;
  customerId: string;
  dependentId?: string;
  airline: string;
  consolidator?: string;
  direction?: AirSegmentDirection;
  sequence?: number;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime?: string;
  arrivalDate: string;
  arrivalTime?: string;
  flightNumber?: string;
  cabinClass?: AirCabinClass;
  bookingLocator?: string;
  ticketNumber?: string;
  baggage?: string;
  seat?: string;
  fare?: number;
  taxes?: number;
  fees?: number;
  commission?: number;
  cost?: number;
  saleValue?: number;
  currency?: string;
  supplierDueDate?: string;
  supplierPaymentStatus?: FinancialObligationStatus;
  status?: AirServiceStatus;
  notes?: string;
}

export type CreateAirServiceInput = AirServiceInput;
export type UpdateAirServiceInput = Partial<AirServiceInput>;

const AIR_SERVICE_COLUMNS = `id, agency_id, trip_id, booking_id, supplier_id, customer_id, dependent_id,
  airline, consolidator, direction, sequence, origin, destination, departure_date, departure_time,
  arrival_date, arrival_time, flight_number, cabin_class, booking_locator, ticket_number, baggage,
  seat, fare, taxes, fees, commission, cost, sale_value, currency, supplier_due_date,
  supplier_payment_status, status, notes, created_at, updated_at`;

export async function listAirServices(
  database: DatabaseRuntime,
  filters: { tripId?: string | undefined; customerId?: string | undefined } = {},
): Promise<AirService[]> {
  const agencyId = getAgencyId();

  const conditions = ['agency_id = $1'];
  const values: unknown[] = [agencyId];
  if (filters.tripId) {
    values.push(filters.tripId);
    conditions.push(`trip_id = $${values.length}`);
  }
  if (filters.customerId) {
    values.push(filters.customerId);
    conditions.push(`customer_id = $${values.length}`);
  }

  const rows = await database.withTenantTransaction(async (client) => {
    const result = await client.query<AirServiceRow>(
      `SELECT ${AIR_SERVICE_COLUMNS} FROM air_services
       WHERE ${conditions.join(' AND ')}
       ORDER BY trip_id, direction, sequence, departure_date`,
      values,
    );
    return result.rows;
  });

  return rows.map(toAirService);
}

export async function getAirServiceById(
  database: DatabaseRuntime,
  id: string,
): Promise<AirService | null> {
  const agencyId = getAgencyId();

  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<AirServiceRow>(
      `SELECT ${AIR_SERVICE_COLUMNS} FROM air_services WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    return result.rows[0] ?? null;
  });

  return row ? toAirService(row) : null;
}

function assertRequiredFields(data: CreateAirServiceInput): void {
  if (!data.tripId || data.tripId.trim().length === 0) {
    throw new ValidationError('Field "tripId" is required');
  }
  if (!data.customerId || data.customerId.trim().length === 0) {
    throw new ValidationError('Field "customerId" is required');
  }
  if (!data.airline || data.airline.trim().length === 0) {
    throw new ValidationError('Field "airline" must not be empty');
  }
  if (!data.origin || data.origin.trim().length === 0) {
    throw new ValidationError('Field "origin" must not be empty');
  }
  if (!data.destination || data.destination.trim().length === 0) {
    throw new ValidationError('Field "destination" must not be empty');
  }
  if (!data.departureDate) {
    throw new ValidationError('Field "departureDate" is required');
  }
  if (!data.arrivalDate) {
    throw new ValidationError('Field "arrivalDate" is required');
  }
}

export async function createAirService(
  database: DatabaseRuntime,
  data: CreateAirServiceInput,
): Promise<AirService> {
  const agencyId = getAgencyId();
  assertRequiredFields(data);

  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<AirServiceRow>(
      `INSERT INTO air_services (
         agency_id, trip_id, booking_id, supplier_id, customer_id, dependent_id,
         airline, consolidator, direction, sequence, origin, destination, departure_date,
         departure_time, arrival_date, arrival_time, flight_number, cabin_class,
         booking_locator, ticket_number, baggage, seat, fare, taxes, fees, commission,
         cost, sale_value, currency, supplier_due_date, supplier_payment_status, status, notes
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
         $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33
       )
       RETURNING ${AIR_SERVICE_COLUMNS}`,
      [
        agencyId,
        data.tripId,
        data.bookingId ?? null,
        data.supplierId ?? null,
        data.customerId,
        data.dependentId ?? null,
        data.airline,
        data.consolidator ?? null,
        data.direction ?? 'OUTBOUND',
        data.sequence ?? 1,
        data.origin,
        data.destination,
        data.departureDate,
        data.departureTime ?? null,
        data.arrivalDate,
        data.arrivalTime ?? null,
        data.flightNumber ?? null,
        data.cabinClass ?? 'ECONOMY',
        data.bookingLocator ?? null,
        data.ticketNumber ?? null,
        data.baggage ?? null,
        data.seat ?? null,
        data.fare ?? 0,
        data.taxes ?? 0,
        data.fees ?? 0,
        data.commission ?? null,
        data.cost ?? 0,
        data.saleValue ?? 0,
        data.currency ?? 'BRL',
        data.supplierDueDate ?? null,
        data.supplierPaymentStatus ?? 'OPEN',
        data.status ?? 'PENDING',
        data.notes ?? null,
      ],
    );

    const inserted = result.rows[0];
    if (!inserted) {
      throw new Error('Air service insert did not return a row');
    }
    return inserted;
  });

  return toAirService(row);
}

const UPDATE_COLUMN_MAP: Array<[keyof UpdateAirServiceInput, string]> = [
  ['tripId', 'trip_id'],
  ['bookingId', 'booking_id'],
  ['supplierId', 'supplier_id'],
  ['customerId', 'customer_id'],
  ['dependentId', 'dependent_id'],
  ['airline', 'airline'],
  ['consolidator', 'consolidator'],
  ['direction', 'direction'],
  ['sequence', 'sequence'],
  ['origin', 'origin'],
  ['destination', 'destination'],
  ['departureDate', 'departure_date'],
  ['departureTime', 'departure_time'],
  ['arrivalDate', 'arrival_date'],
  ['arrivalTime', 'arrival_time'],
  ['flightNumber', 'flight_number'],
  ['cabinClass', 'cabin_class'],
  ['bookingLocator', 'booking_locator'],
  ['ticketNumber', 'ticket_number'],
  ['baggage', 'baggage'],
  ['seat', 'seat'],
  ['fare', 'fare'],
  ['taxes', 'taxes'],
  ['fees', 'fees'],
  ['commission', 'commission'],
  ['cost', 'cost'],
  ['saleValue', 'sale_value'],
  ['currency', 'currency'],
  ['supplierDueDate', 'supplier_due_date'],
  ['supplierPaymentStatus', 'supplier_payment_status'],
  ['status', 'status'],
  ['notes', 'notes'],
];

export async function updateAirService(
  database: DatabaseRuntime,
  id: string,
  data: UpdateAirServiceInput,
): Promise<AirService | null> {
  const agencyId = getAgencyId();

  if (data.airline !== undefined && data.airline.trim().length === 0) {
    throw new ValidationError('Field "airline" must not be empty');
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  for (const [key, column] of UPDATE_COLUMN_MAP) {
    if (data[key] !== undefined) {
      fields.push(`${column} = $${++index}`);
      values.push(data[key]);
    }
  }

  if (fields.length === 0) {
    return getAirServiceById(database, id);
  }

  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<AirServiceRow>(
      `UPDATE air_services SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${AIR_SERVICE_COLUMNS}`,
      [agencyId, ...values, id],
    );
    return result.rows[0] ?? null;
  });

  return row ? toAirService(row) : null;
}

export async function deleteAirService(database: DatabaseRuntime, id: string): Promise<boolean> {
  const agencyId = getAgencyId();

  const deleted = await database.withTenantTransaction(async (client) => {
    const result = await client.query(
      `DELETE FROM air_services WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    return (result.rowCount ?? 0) > 0;
  });

  return deleted;
}

function toAirService(row: AirServiceRow): AirService {
  return {
    id: row.id,
    agencyId: row.agency_id,
    tripId: row.trip_id,
    customerId: row.customer_id,
    airline: row.airline,
    direction: row.direction,
    sequence: row.sequence,
    origin: row.origin,
    destination: row.destination,
    departureDate: new Date(row.departure_date),
    arrivalDate: new Date(row.arrival_date),
    cabinClass: row.cabin_class,
    fare: Number(row.fare),
    taxes: Number(row.taxes),
    fees: Number(row.fees),
    cost: Number(row.cost),
    saleValue: Number(row.sale_value),
    currency: row.currency,
    supplierPaymentStatus: row.supplier_payment_status,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.booking_id !== null ? { bookingId: row.booking_id } : {}),
    ...(row.supplier_id !== null ? { supplierId: row.supplier_id } : {}),
    ...(row.dependent_id !== null ? { dependentId: row.dependent_id } : {}),
    ...(row.consolidator !== null ? { consolidator: row.consolidator } : {}),
    ...(row.departure_time !== null ? { departureTime: row.departure_time } : {}),
    ...(row.arrival_time !== null ? { arrivalTime: row.arrival_time } : {}),
    ...(row.flight_number !== null ? { flightNumber: row.flight_number } : {}),
    ...(row.booking_locator !== null ? { bookingLocator: row.booking_locator } : {}),
    ...(row.ticket_number !== null ? { ticketNumber: row.ticket_number } : {}),
    ...(row.baggage !== null ? { baggage: row.baggage } : {}),
    ...(row.seat !== null ? { seat: row.seat } : {}),
    ...(row.commission !== null ? { commission: Number(row.commission) } : {}),
    ...(row.supplier_due_date !== null ? { supplierDueDate: new Date(row.supplier_due_date) } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}
