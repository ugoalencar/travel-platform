/**
 * Excursões (group trips) -- reusable templates + dated departures.
 *
 * A template (Excursion) holds everything EXCEPT dates: destination,
 * transport type, air/land details, shared sale/cost -- registered
 * once, reused many times. Each actual use is a Departure: an agent
 * picks a template and sets a period; customers are then assigned to
 * that specific departure, and the backend fans out one Trip + one
 * AirService/LandService per assigned customer, using the template's
 * shared config plus the departure's dates.
 *
 * Requested directly: "uma excursão pode ser usada várias vezes então
 * ela deve ser cadastrada com todas as suas características menos a
 * data porque essa muda na hora de usar a excursão, o agente escolhe a
 * excursão e pode colocar o período."
 *
 * Deliberately its own entity rather than extending Trip (which stays
 * single-customer) or Booking/ScheduledDeparture (capacity-managed,
 * free-text passengers, no Customer linkage, no frontend) -- see
 * 071_excursions.sql / 072_excursion_departures.sql headers for why
 * neither existing concept fit.
 */

import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { NotFoundError, ValidationError } from './errors';
import { createTrip } from './trips';
import { createAirService } from './air-services';
import { createLandService } from './land-services';

export type ExcursionTransportType = 'AEREO' | 'TERRESTRE';

export interface Excursion {
  id: string;
  agencyId: string;
  name: string;
  destination: string;
  transportType: ExcursionTransportType;
  notes?: string;
  airline?: string;
  origin?: string;
  flightNumber?: string;
  cabinClass?: string;
  landDescription?: string;
  landServiceType?: string;
  saleValue?: number;
  cost?: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExcursionDeparture {
  id: string;
  excursionId: string;
  startDate: Date;
  endDate: Date;
  notes?: string;
  createdAt: Date;
}

export interface ExcursionCustomer {
  id: string;
  excursionDepartureId: string;
  customerId: string;
  customerName?: string;
  /** Shown alongside the name everywhere a customer is picked/listed,
   * so the agent can tell apart two customers who share a first name
   * -- requested directly: "podemos ter várias Amandas... deve vir o
   * nome seguido da data de nascimento... isso torna assertivo". */
  customerBirthDate?: string;
  tripId?: string;
  airServiceId?: string;
  landServiceId?: string;
  createdAt: Date;
}

export interface CreateExcursionInput {
  name: string;
  destination: string;
  transportType: ExcursionTransportType;
  notes?: string;
  airline?: string;
  origin?: string;
  flightNumber?: string;
  cabinClass?: string;
  landDescription?: string;
  landServiceType?: string;
  saleValue?: number;
  cost?: number;
  currency?: string;
}

export interface CreateDepartureInput {
  startDate: string;
  endDate: string;
  notes?: string;
  /** Assigned immediately -- fanned out to a Trip + AirService/
   * LandService per customer in the same call. */
  customerIds?: string[];
}

interface ExcursionRow {
  id: string;
  agency_id: string;
  name: string;
  destination: string;
  transport_type: ExcursionTransportType;
  notes: string | null;
  airline: string | null;
  origin: string | null;
  flight_number: string | null;
  cabin_class: string | null;
  land_description: string | null;
  land_service_type: string | null;
  sale_value: string | null;
  cost: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

interface DepartureRow {
  id: string;
  excursion_id: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  created_at: string;
}

const EXCURSION_COLUMNS = `id, agency_id, name, destination, transport_type, notes,
  airline, origin, flight_number, cabin_class, land_description, land_service_type,
  sale_value, cost, currency, created_at, updated_at`;

const DEPARTURE_COLUMNS = `id, excursion_id, start_date, end_date, notes, created_at`;

function toExcursion(row: ExcursionRow): Excursion {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    destination: row.destination,
    transportType: row.transport_type,
    currency: row.currency,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.notes !== null ? { notes: row.notes } : {}),
    ...(row.airline !== null ? { airline: row.airline } : {}),
    ...(row.origin !== null ? { origin: row.origin } : {}),
    ...(row.flight_number !== null ? { flightNumber: row.flight_number } : {}),
    ...(row.cabin_class !== null ? { cabinClass: row.cabin_class } : {}),
    ...(row.land_description !== null ? { landDescription: row.land_description } : {}),
    ...(row.land_service_type !== null ? { landServiceType: row.land_service_type } : {}),
    ...(row.sale_value !== null ? { saleValue: Number(row.sale_value) } : {}),
    ...(row.cost !== null ? { cost: Number(row.cost) } : {}),
  };
}

function toDeparture(row: DepartureRow): ExcursionDeparture {
  return {
    id: row.id,
    excursionId: row.excursion_id,
    startDate: new Date(row.start_date),
    endDate: new Date(row.end_date),
    createdAt: new Date(row.created_at),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}

function validateTransportFields(data: Pick<CreateExcursionInput, 'transportType' | 'airline' | 'origin' | 'landDescription'>): void {
  if (data.transportType === 'AEREO') {
    if (!data.airline || !data.origin) {
      throw new ValidationError('Fields "airline" and "origin" are required when transportType is AEREO');
    }
  } else if (data.transportType === 'TERRESTRE') {
    if (!data.landDescription) {
      throw new ValidationError('Field "landDescription" is required when transportType is TERRESTRE');
    }
  } else {
    throw new ValidationError('Field "transportType" must be AEREO or TERRESTRE');
  }
}

// ============================================================
// TEMPLATES
// ============================================================

export async function listExcursions(database: DatabaseRuntime): Promise<Array<Excursion & { departureCount: number }>> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ExcursionRow & { departure_count: string }>(
      `SELECT e.*, count(ed.id)::text AS departure_count
       FROM excursions e
       LEFT JOIN excursion_departures ed ON ed.agency_id = e.agency_id AND ed.excursion_id = e.id AND ed.deleted_at IS NULL
       WHERE e.agency_id = $1 AND e.deleted_at IS NULL
       GROUP BY e.id
       ORDER BY e.name ASC`,
      [agencyId],
    );
    return result.rows.map((row) => ({ ...toExcursion(row), departureCount: Number(row.departure_count) }));
  });
}

export async function getExcursionById(
  database: DatabaseRuntime,
  id: string,
): Promise<{ excursion: Excursion; departures: ExcursionDeparture[] } | null> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ExcursionRow>(
      `SELECT ${EXCURSION_COLUMNS} FROM excursions WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );
    const row = result.rows[0];
    if (!row) return null;

    const departuresResult = await client.query<DepartureRow>(
      `SELECT ${DEPARTURE_COLUMNS} FROM excursion_departures
       WHERE agency_id = $1 AND excursion_id = $2 AND deleted_at IS NULL
       ORDER BY start_date DESC`,
      [agencyId, id],
    );

    return { excursion: toExcursion(row), departures: departuresResult.rows.map(toDeparture) };
  });
}

export async function createExcursion(database: DatabaseRuntime, data: CreateExcursionInput): Promise<Excursion> {
  if (!data.name?.trim()) throw new ValidationError('Field "name" is required');
  if (!data.destination?.trim()) throw new ValidationError('Field "destination" is required');
  validateTransportFields(data);

  const agencyId = getAgencyId();
  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<ExcursionRow>(
      `INSERT INTO excursions
         (agency_id, name, destination, transport_type, notes,
          airline, origin, flight_number, cabin_class, land_description, land_service_type,
          sale_value, cost, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING ${EXCURSION_COLUMNS}`,
      [
        agencyId,
        data.name.trim(),
        data.destination.trim(),
        data.transportType,
        data.notes ?? null,
        data.airline ?? null,
        data.origin ?? null,
        data.flightNumber ?? null,
        data.cabinClass ?? null,
        data.landDescription ?? null,
        data.landServiceType ?? null,
        data.saleValue ?? null,
        data.cost ?? null,
        data.currency ?? 'BRL',
      ],
    );
    const inserted = result.rows[0];
    if (!inserted) throw new Error('Excursion insert did not return a row');
    return inserted;
  });

  return toExcursion(row);
}

export async function deleteExcursion(database: DatabaseRuntime, id: string): Promise<boolean> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query(
      `UPDATE excursions SET deleted_at = now(), updated_at = now()
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );
    return (result.rowCount ?? 0) > 0;
  });
}

// ============================================================
// DEPARTURES (one dated use of a template)
// ============================================================

async function getExcursionOrThrow(database: DatabaseRuntime, excursionId: string): Promise<Excursion> {
  const found = await getExcursionById(database, excursionId);
  if (!found) throw new NotFoundError('Excursion not found');
  return found.excursion;
}

export async function getDepartureById(
  database: DatabaseRuntime,
  departureId: string,
): Promise<{ excursion: Excursion; departure: ExcursionDeparture; customers: ExcursionCustomer[] } | null> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DepartureRow>(
      `SELECT ${DEPARTURE_COLUMNS} FROM excursion_departures
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, departureId],
    );
    const row = result.rows[0];
    if (!row) return null;

    const excursionResult = await client.query<ExcursionRow>(
      `SELECT ${EXCURSION_COLUMNS} FROM excursions WHERE agency_id = $1 AND id = $2`,
      [agencyId, row.excursion_id],
    );
    const excursionRow = excursionResult.rows[0];
    if (!excursionRow) return null;

    const customersResult = await client.query<{
      id: string;
      excursion_departure_id: string;
      customer_id: string;
      customer_name: string;
      customer_birth_date: string | null;
      trip_id: string | null;
      air_service_id: string | null;
      land_service_id: string | null;
      created_at: string;
    }>(
      `SELECT ec.id, ec.excursion_departure_id, ec.customer_id, c.name AS customer_name,
              c.birth_date AS customer_birth_date, ec.trip_id, ec.air_service_id, ec.land_service_id, ec.created_at
       FROM excursion_customers ec
       JOIN customers c ON c.agency_id = ec.agency_id AND c.id = ec.customer_id
       WHERE ec.agency_id = $1 AND ec.excursion_departure_id = $2
       ORDER BY c.name ASC`,
      [agencyId, departureId],
    );

    return {
      excursion: toExcursion(excursionRow),
      departure: toDeparture(row),
      customers: customersResult.rows.map((r) => ({
        id: r.id,
        excursionDepartureId: r.excursion_departure_id,
        customerId: r.customer_id,
        customerName: r.customer_name,
        createdAt: new Date(r.created_at),
        ...(r.customer_birth_date !== null ? { customerBirthDate: r.customer_birth_date } : {}),
        ...(r.trip_id !== null ? { tripId: r.trip_id } : {}),
        ...(r.air_service_id !== null ? { airServiceId: r.air_service_id } : {}),
        ...(r.land_service_id !== null ? { landServiceId: r.land_service_id } : {}),
      })),
    };
  });
}

/** Creates one Trip + one AirService/LandService for a single customer
 * on a specific departure, using the template's shared config plus the
 * departure's dates, then records the roster row. Reused by both
 * createDeparture() (initial roster) and addCustomersToDeparture(). */
async function fanOutToCustomer(
  database: DatabaseRuntime,
  excursion: Excursion,
  departure: ExcursionDeparture,
  customerId: string,
): Promise<void> {
  const trip = await createTrip(database, customerId, {
    name: excursion.name,
    destination: excursion.destination,
    startDate: departure.startDate,
    endDate: departure.endDate,
    ...(excursion.notes ? { notes: excursion.notes } : {}),
  });

  const departureDate = departure.startDate.toISOString().slice(0, 10);
  const arrivalDate = departure.endDate.toISOString().slice(0, 10);

  let airServiceId: string | undefined;
  let landServiceId: string | undefined;

  if (excursion.transportType === 'AEREO') {
    const airService = await createAirService(database, {
      tripId: trip.id,
      customerId,
      airline: excursion.airline ?? '',
      origin: excursion.origin ?? '',
      destination: excursion.destination,
      departureDate,
      arrivalDate,
      ...(excursion.flightNumber ? { flightNumber: excursion.flightNumber } : {}),
      ...(excursion.cabinClass ? { cabinClass: excursion.cabinClass as never } : {}),
      ...(excursion.saleValue !== undefined ? { saleValue: excursion.saleValue } : {}),
      ...(excursion.cost !== undefined ? { cost: excursion.cost } : {}),
      currency: excursion.currency,
    });
    airServiceId = airService.id;
  } else {
    const landService = await createLandService(database, {
      tripId: trip.id,
      customerId,
      description: excursion.landDescription ?? excursion.name,
      startDate: departureDate,
      endDate: arrivalDate,
      ...(excursion.landServiceType ? { serviceType: excursion.landServiceType as never } : {}),
      ...(excursion.saleValue !== undefined ? { saleValue: excursion.saleValue } : {}),
      ...(excursion.cost !== undefined ? { cost: excursion.cost } : {}),
      currency: excursion.currency,
    });
    landServiceId = landService.id;
  }

  const agencyId = getAgencyId();
  await database.withTenantTransaction(async (client: TenantTransactionClient) => {
    await client.query(
      `INSERT INTO excursion_customers (agency_id, excursion_departure_id, customer_id, trip_id, air_service_id, land_service_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [agencyId, departure.id, customerId, trip.id, airServiceId ?? null, landServiceId ?? null],
    );
  });
}

export async function createDeparture(
  database: DatabaseRuntime,
  excursionId: string,
  data: CreateDepartureInput,
): Promise<{ departure: ExcursionDeparture; assignedCount: number }> {
  if (!data.startDate || !data.endDate) {
    throw new ValidationError('Fields "startDate" and "endDate" are required');
  }
  const excursion = await getExcursionOrThrow(database, excursionId);

  const agencyId = getAgencyId();
  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<DepartureRow>(
      `INSERT INTO excursion_departures (agency_id, excursion_id, start_date, end_date, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${DEPARTURE_COLUMNS}`,
      [agencyId, excursionId, data.startDate, data.endDate, data.notes ?? null],
    );
    const inserted = result.rows[0];
    if (!inserted) throw new Error('Excursion departure insert did not return a row');
    return inserted;
  });

  const departure = toDeparture(row);
  const customerIds = Array.from(new Set(data.customerIds ?? []));
  for (const customerId of customerIds) {
    await fanOutToCustomer(database, excursion, departure, customerId);
  }

  return { departure, assignedCount: customerIds.length };
}

/** Adds customers to an already-created departure, fanning out the same
 * shared config for just the new ones (already-assigned customers are
 * silently skipped, not re-created). */
export async function addCustomersToDeparture(
  database: DatabaseRuntime,
  departureId: string,
  customerIds: string[],
): Promise<{ addedCount: number }> {
  const found = await getDepartureById(database, departureId);
  if (!found) throw new NotFoundError('Departure not found');

  const alreadyAssigned = new Set(found.customers.map((c) => c.customerId));
  const toAdd = Array.from(new Set(customerIds)).filter((id) => !alreadyAssigned.has(id));

  for (const customerId of toAdd) {
    await fanOutToCustomer(database, found.excursion, found.departure, customerId);
  }

  return { addedCount: toAdd.length };
}

/** Removes a customer from a departure's roster. Does NOT delete their
 * already-generated Trip/AirService/LandService -- those are real
 * operational records at that point; removing them here would silently
 * undo work already sent to the customer. */
export async function removeCustomerFromDeparture(
  database: DatabaseRuntime,
  departureId: string,
  customerId: string,
): Promise<boolean> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query(
      `DELETE FROM excursion_customers WHERE agency_id = $1 AND excursion_departure_id = $2 AND customer_id = $3`,
      [agencyId, departureId, customerId],
    );
    return (result.rowCount ?? 0) > 0;
  });
}
