/**
 * Excursões (group trips) -- configure a shared trip once (destination,
 * dates, and either air or land details) and assign customers; the
 * backend fans out one Trip + one AirService/LandService row per
 * assigned customer automatically, instead of an agent repeating the
 * same data entry per customer.
 *
 * Requested directly: "quando uma viagem aérea ou terrestre vai
 * agregar vários clientes para o mesmo destino... o atendente vai só
 * setar os clientes na excursão e assim todos os clientes recebem de
 * uma vez as configurações da viagem."
 *
 * Deliberately its own entity rather than extending Trip (which stays
 * single-customer) or Booking/ScheduledDeparture (capacity-managed,
 * free-text passengers, no Customer linkage, no frontend) -- see
 * 071_excursions.sql's header for why neither existing concept fit.
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
  startDate: Date;
  endDate: Date;
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

export interface ExcursionCustomer {
  id: string;
  excursionId: string;
  customerId: string;
  customerName?: string;
  tripId?: string;
  airServiceId?: string;
  landServiceId?: string;
  createdAt: Date;
}

export interface CreateExcursionInput {
  name: string;
  destination: string;
  transportType: ExcursionTransportType;
  startDate: string;
  endDate: string;
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
  /** Assigned immediately at creation -- fanned out to a Trip +
   * AirService/LandService per customer in the same call, matching
   * "o atendente vai só setar os clientes na excursão". */
  customerIds?: string[];
}

interface ExcursionRow {
  id: string;
  agency_id: string;
  name: string;
  destination: string;
  transport_type: ExcursionTransportType;
  start_date: string;
  end_date: string;
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

const EXCURSION_COLUMNS = `id, agency_id, name, destination, transport_type, start_date, end_date, notes,
  airline, origin, flight_number, cabin_class, land_description, land_service_type,
  sale_value, cost, currency, created_at, updated_at`;

function toExcursion(row: ExcursionRow): Excursion {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    destination: row.destination,
    transportType: row.transport_type,
    startDate: new Date(row.start_date),
    endDate: new Date(row.end_date),
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

export async function listExcursions(database: DatabaseRuntime): Promise<Array<Excursion & { customerCount: number }>> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ExcursionRow & { customer_count: string }>(
      `SELECT e.*, count(ec.id)::text AS customer_count
       FROM excursions e
       LEFT JOIN excursion_customers ec ON ec.agency_id = e.agency_id AND ec.excursion_id = e.id
       WHERE e.agency_id = $1 AND e.deleted_at IS NULL
       GROUP BY e.id
       ORDER BY e.start_date DESC`,
      [agencyId],
    );
    return result.rows.map((row) => ({ ...toExcursion(row), customerCount: Number(row.customer_count) }));
  });
}

export async function getExcursionById(
  database: DatabaseRuntime,
  id: string,
): Promise<{ excursion: Excursion; customers: ExcursionCustomer[] } | null> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ExcursionRow>(
      `SELECT ${EXCURSION_COLUMNS} FROM excursions WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );
    const row = result.rows[0];
    if (!row) return null;

    const customersResult = await client.query<{
      id: string;
      excursion_id: string;
      customer_id: string;
      customer_name: string;
      trip_id: string | null;
      air_service_id: string | null;
      land_service_id: string | null;
      created_at: string;
    }>(
      `SELECT ec.id, ec.excursion_id, ec.customer_id, c.name AS customer_name,
              ec.trip_id, ec.air_service_id, ec.land_service_id, ec.created_at
       FROM excursion_customers ec
       JOIN customers c ON c.agency_id = ec.agency_id AND c.id = ec.customer_id
       WHERE ec.agency_id = $1 AND ec.excursion_id = $2
       ORDER BY c.name ASC`,
      [agencyId, id],
    );

    return {
      excursion: toExcursion(row),
      customers: customersResult.rows.map((r) => ({
        id: r.id,
        excursionId: r.excursion_id,
        customerId: r.customer_id,
        customerName: r.customer_name,
        createdAt: new Date(r.created_at),
        ...(r.trip_id !== null ? { tripId: r.trip_id } : {}),
        ...(r.air_service_id !== null ? { airServiceId: r.air_service_id } : {}),
        ...(r.land_service_id !== null ? { landServiceId: r.land_service_id } : {}),
      })),
    };
  });
}

/**
 * Creates one Trip + one AirService/LandService for a single customer,
 * using the excursion's shared config, then records the roster row.
 * Reused by both createExcursion() (initial roster) and
 * addCustomersToExcursion() (adding someone later) so the fan-out logic
 * only lives in one place.
 */
async function fanOutToCustomer(
  database: DatabaseRuntime,
  excursion: Excursion,
  customerId: string,
): Promise<void> {
  const trip = await createTrip(database, customerId, {
    name: excursion.name,
    destination: excursion.destination,
    startDate: excursion.startDate,
    endDate: excursion.endDate,
    ...(excursion.notes ? { notes: excursion.notes } : {}),
  });

  const departureDate = excursion.startDate.toISOString().slice(0, 10);
  const arrivalDate = excursion.endDate.toISOString().slice(0, 10);

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
      `INSERT INTO excursion_customers (agency_id, excursion_id, customer_id, trip_id, air_service_id, land_service_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [agencyId, excursion.id, customerId, trip.id, airServiceId ?? null, landServiceId ?? null],
    );
  });
}

export async function createExcursion(
  database: DatabaseRuntime,
  data: CreateExcursionInput,
): Promise<{ excursion: Excursion; assignedCount: number }> {
  if (!data.name?.trim()) throw new ValidationError('Field "name" is required');
  if (!data.destination?.trim()) throw new ValidationError('Field "destination" is required');
  if (!data.startDate || !data.endDate) {
    throw new ValidationError('Fields "startDate" and "endDate" are required');
  }
  validateTransportFields(data);

  const agencyId = getAgencyId();
  const row = await database.withTenantTransaction(async (client) => {
    const result = await client.query<ExcursionRow>(
      `INSERT INTO excursions
         (agency_id, name, destination, transport_type, start_date, end_date, notes,
          airline, origin, flight_number, cabin_class, land_description, land_service_type,
          sale_value, cost, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING ${EXCURSION_COLUMNS}`,
      [
        agencyId,
        data.name.trim(),
        data.destination.trim(),
        data.transportType,
        data.startDate,
        data.endDate,
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

  const excursion = toExcursion(row);

  const customerIds = Array.from(new Set(data.customerIds ?? []));
  for (const customerId of customerIds) {
    await fanOutToCustomer(database, excursion, customerId);
  }

  return { excursion, assignedCount: customerIds.length };
}

/** Adds customers to an already-created excursion, fanning out the same
 * shared config for just the new ones (already-assigned customers are
 * silently skipped, not re-created). */
export async function addCustomersToExcursion(
  database: DatabaseRuntime,
  excursionId: string,
  customerIds: string[],
): Promise<{ addedCount: number }> {
  const found = await getExcursionById(database, excursionId);
  if (!found) throw new NotFoundError('Excursion not found');

  const alreadyAssigned = new Set(found.customers.map((c) => c.customerId));
  const toAdd = Array.from(new Set(customerIds)).filter((id) => !alreadyAssigned.has(id));

  for (const customerId of toAdd) {
    await fanOutToCustomer(database, found.excursion, customerId);
  }

  return { addedCount: toAdd.length };
}

/** Removes a customer from the excursion roster. Does NOT delete their
 * already-generated Trip/AirService/LandService -- those are real
 * operational records at that point; removing them here would silently
 * undo work already sent to the customer. */
export async function removeCustomerFromExcursion(
  database: DatabaseRuntime,
  excursionId: string,
  customerId: string,
): Promise<boolean> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query(
      `DELETE FROM excursion_customers WHERE agency_id = $1 AND excursion_id = $2 AND customer_id = $3`,
      [agencyId, excursionId, customerId],
    );
    return (result.rowCount ?? 0) > 0;
  });
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
