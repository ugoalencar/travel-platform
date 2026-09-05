import { TripType } from '../../../packages/domain/types';
import type { Booking, BookingPassenger } from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';

interface BookingRow {
  id: string;
  agency_id: string;
  booker_customer_id: string;
  trip_type: TripType;
  outbound_departure_id: string;
  return_departure_id: string | null;
  cancelled: boolean;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PassengerRow {
  id: string;
  agency_id: string;
  booking_id: string;
  name: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBookingPassengerInput {
  name: string;
  notes?: string;
}

export interface CreateBookingInput {
  bookerCustomerId: string;
  tripType: TripType;
  outboundDepartureId: string;
  returnDepartureId?: string;
  notes?: string;
  passengers: CreateBookingPassengerInput[];
}

export interface BookingWithPassengers {
  booking: Booking;
  passengers: BookingPassenger[];
}

export interface CancelBookingInput {
  userId: string;
  reason?: string;
}

const BOOKING_COLUMNS = `id, agency_id, booker_customer_id, trip_type, outbound_departure_id,
              return_departure_id, cancelled, cancelled_at, cancelled_by_user_id,
              cancellation_reason, notes, created_at, updated_at`;
const PASSENGER_COLUMNS = `id, agency_id, booking_id, name, notes, created_at, updated_at`;

export async function listBookings(database: DatabaseRuntime): Promise<Booking[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<BookingRow>(
      `SELECT ${BOOKING_COLUMNS} FROM bookings WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toBooking);
  });
}

export async function getBookingById(
  database: DatabaseRuntime,
  id: string,
): Promise<BookingWithPassengers | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<BookingRow>(
      `SELECT ${BOOKING_COLUMNS} FROM bookings WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const passengersResult = await client.query<PassengerRow>(
      `SELECT ${PASSENGER_COLUMNS} FROM booking_passengers
       WHERE agency_id = $1 AND booking_id = $2 ORDER BY created_at ASC`,
      [agencyId, id],
    );

    return {
      booking: toBooking(row),
      passengers: passengersResult.rows.map(toPassenger),
    };
  });
}

/**
 * Creates a Booking together with all of its BookingPassenger rows in a
 * single transaction, enforcing the capacity engine described in
 * 005_booking.sql / the Booking brief:
 *
 *  1. Row-lock every ScheduledDeparture involved (outbound, and return if
 *     round-trip) with SELECT ... FOR UPDATE, in a consistent order (by id)
 *     so two concurrent round-trip bookings referencing the same two
 *     departures in opposite order cannot deadlock.
 *  2. While holding the lock(s), count currently-reserved passengers
 *     (non-cancelled bookings) against each departure's capacity.
 *  3. If the new booking's passenger count would push either departure
 *     over capacity, throw and let the transaction roll back -- no row is
 *     ever committed that would overflow, and for round-trip, a failure on
 *     either leg rolls back both (no partial booking).
 *  4. Only if every check passes, insert the Booking + BookingPassenger
 *     rows and let the transaction commit, releasing the lock(s).
 */
export async function createBooking(
  database: DatabaseRuntime,
  data: CreateBookingInput,
): Promise<BookingWithPassengers> {
  const agencyId = getAgencyId();

  if (data.tripType === TripType.ONE_WAY && data.returnDepartureId !== undefined) {
    throw new ValidationError('Field "returnDepartureId" must not be set when tripType is ONE_WAY');
  }
  if (data.tripType === TripType.ROUND_TRIP && data.returnDepartureId === undefined) {
    throw new ValidationError('Field "returnDepartureId" is required when tripType is ROUND_TRIP');
  }
  if (!Array.isArray(data.passengers) || data.passengers.length === 0) {
    throw new ValidationError('At least one passenger is required');
  }
  for (const passenger of data.passengers) {
    if (typeof passenger.name !== 'string' || passenger.name.trim().length === 0) {
      throw new ValidationError('Each passenger must have a non-empty "name"');
    }
  }
  const passengerCount = data.passengers.length;

  return database.withTenantTransaction(async (client) => {
    const customerCheck = await client.query(
      `SELECT 1 FROM customers WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, data.bookerCustomerId],
    );
    if (customerCheck.rows.length === 0) {
      throw new NotFoundError('Customer not found');
    }

    // Consistent lock order: lock the departure with the lexicographically
    // smaller id first. Both round-trip requests referencing the same pair
    // will therefore always attempt the locks in the same order, avoiding
    // a lock-order deadlock between two concurrent round-trip bookings.
    const departureIds = [data.outboundDepartureId];
    if (data.returnDepartureId !== undefined) {
      departureIds.push(data.returnDepartureId);
    }
    const orderedIds = [...new Set(departureIds)].sort();

    const departures = new Map<
      string,
      { capacity: number; departureAt: Date; cancelled: boolean }
    >();

    for (const departureId of orderedIds) {
      const result = await client.query<{
        capacity: number;
        departure_at: string;
        cancelled: boolean;
      }>(
        `SELECT capacity, departure_at, cancelled FROM scheduled_departures
         WHERE agency_id = $1 AND id = $2
         FOR UPDATE`,
        [agencyId, departureId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new NotFoundError('Scheduled departure not found');
      }
      departures.set(departureId, {
        capacity: row.capacity,
        departureAt: new Date(row.departure_at),
        cancelled: row.cancelled,
      });
    }

    const outbound = departures.get(data.outboundDepartureId);
    if (!outbound) {
      throw new NotFoundError('Scheduled departure not found');
    }
    if (outbound.cancelled) {
      throw new ValidationError('Outbound departure is cancelled');
    }

    let returnDeparture: { capacity: number; departureAt: Date; cancelled: boolean } | undefined;
    if (data.returnDepartureId !== undefined) {
      returnDeparture = departures.get(data.returnDepartureId);
      if (!returnDeparture) {
        throw new NotFoundError('Scheduled departure not found');
      }
      if (returnDeparture.cancelled) {
        throw new ValidationError('Return departure is cancelled');
      }
      if (returnDeparture.departureAt.getTime() <= outbound.departureAt.getTime()) {
        throw new ValidationError(
          'Field "returnDepartureId" must reference a departure after the outbound departure',
        );
      }
    }

    // Still holding the row lock(s) acquired above: count seats already
    // reserved by non-cancelled bookings, then verify the new booking's
    // passengers fit. This whole read-then-decide window is race-free
    // because FOR UPDATE has already serialized any concurrent writer
    // touching the same departure row(s).
    for (const departureId of orderedIds) {
      const departure = departures.get(departureId);
      if (!departure) {
        continue;
      }
      const reservedResult = await client.query<{ reserved: string }>(
        `SELECT COALESCE(SUM(passenger_counts.count), 0) AS reserved
         FROM (
           SELECT COUNT(*) AS count
           FROM bookings b
           JOIN booking_passengers bp ON bp.agency_id = b.agency_id AND bp.booking_id = b.id
           WHERE b.agency_id = $1 AND b.cancelled = false
             AND (b.outbound_departure_id = $2 OR b.return_departure_id = $2)
         ) AS passenger_counts`,
        [agencyId, departureId],
      );
      const reserved = Number(reservedResult.rows[0]?.reserved ?? 0);
      if (reserved + passengerCount > departure.capacity) {
        throw new ConflictError('Requested passenger count exceeds remaining departure capacity');
      }
    }

    const insertResult = await client.query<BookingRow>(
      `INSERT INTO bookings (agency_id, booker_customer_id, trip_type, outbound_departure_id,
                              return_departure_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${BOOKING_COLUMNS}`,
      [
        agencyId,
        data.bookerCustomerId,
        data.tripType,
        data.outboundDepartureId,
        data.returnDepartureId ?? null,
        data.notes ?? null,
      ],
    );
    const bookingRow = insertResult.rows[0];
    if (!bookingRow) {
      throw new Error('Booking insert did not return a row');
    }

    const passengers: BookingPassenger[] = [];
    for (const passenger of data.passengers) {
      const passengerResult = await client.query<PassengerRow>(
        `INSERT INTO booking_passengers (agency_id, booking_id, name, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING ${PASSENGER_COLUMNS}`,
        [agencyId, bookingRow.id, passenger.name, passenger.notes ?? null],
      );
      const passengerRow = passengerResult.rows[0];
      if (!passengerRow) {
        throw new Error('BookingPassenger insert did not return a row');
      }
      passengers.push(toPassenger(passengerRow));
    }

    return { booking: toBooking(bookingRow), passengers };
  });
}

export async function cancelBooking(
  database: DatabaseRuntime,
  id: string,
  data: CancelBookingInput,
): Promise<Booking> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const bookingResult = await client.query<BookingRow>(
      `SELECT ${BOOKING_COLUMNS} FROM bookings
       WHERE agency_id = $1 AND id = $2
       FOR UPDATE`,
      [agencyId, id],
    );
    const bookingRow = bookingResult.rows[0];
    if (!bookingRow) {
      throw new NotFoundError('Booking not found');
    }

    if (bookingRow.cancelled) {
      return toBooking(bookingRow);
    }

    const departureIds = [bookingRow.outbound_departure_id];
    if (bookingRow.return_departure_id !== null) {
      departureIds.push(bookingRow.return_departure_id);
    }
    const orderedIds = [...new Set(departureIds)].sort();

    for (const departureId of orderedIds) {
      const departureLock = await client.query(
        `SELECT 1 FROM scheduled_departures
         WHERE agency_id = $1 AND id = $2
         FOR UPDATE`,
        [agencyId, departureId],
      );
      if (departureLock.rows.length === 0) {
        throw new NotFoundError('Scheduled departure not found');
      }
    }

    const updateResult = await client.query<BookingRow>(
      `UPDATE bookings
       SET cancelled = true,
           cancelled_at = now(),
           cancelled_by_user_id = $3,
           cancellation_reason = $4,
           updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${BOOKING_COLUMNS}`,
      [agencyId, id, data.userId, data.reason ?? null],
    );
    const updatedRow = updateResult.rows[0];
    if (!updatedRow) {
      throw new Error('Booking cancellation did not return a row');
    }

    return toBooking(updatedRow);
  });
}

export interface BookingWithCustomer extends Booking {
  customerName: string;
}

export interface BookingWithCustomerAndPassengers {
  booking: BookingWithCustomer;
  passengers: BookingPassenger[];
}

interface BookingWithCustomerRow extends BookingRow {
  customer_name: string;
}

const BOOKING_WITH_CUSTOMER_QUERY = `
  SELECT b.id, b.agency_id, b.booker_customer_id, b.trip_type, b.outbound_departure_id,
         b.return_departure_id, b.cancelled, b.cancelled_at, b.cancelled_by_user_id,
         b.cancellation_reason, b.notes, b.created_at, b.updated_at,
         c.name AS customer_name
  FROM bookings b
  JOIN customers c ON c.agency_id = b.agency_id AND c.id = b.booker_customer_id
`;

// Read-model for UI surfaces that need the booker's name alongside the
// booking, without changing listBookings/getBookingById's shape for other
// callers. One joined query, no N+1.
export async function listBookingsWithCustomer(
  database: DatabaseRuntime,
): Promise<BookingWithCustomer[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<BookingWithCustomerRow>(
      `${BOOKING_WITH_CUSTOMER_QUERY}
       WHERE b.agency_id = $1
       ORDER BY b.created_at DESC`,
      [agencyId],
    );

    return result.rows.map(toBookingWithCustomer);
  });
}

export async function getBookingWithCustomerById(
  database: DatabaseRuntime,
  id: string,
): Promise<BookingWithCustomerAndPassengers | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<BookingWithCustomerRow>(
      `${BOOKING_WITH_CUSTOMER_QUERY}
       WHERE b.agency_id = $1 AND b.id = $2`,
      [agencyId, id],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const passengersResult = await client.query<PassengerRow>(
      `SELECT ${PASSENGER_COLUMNS} FROM booking_passengers
       WHERE agency_id = $1 AND booking_id = $2 ORDER BY created_at ASC`,
      [agencyId, id],
    );

    return {
      booking: toBookingWithCustomer(row),
      passengers: passengersResult.rows.map(toPassenger),
    };
  });
}

function toBookingWithCustomer(row: BookingWithCustomerRow): BookingWithCustomer {
  return {
    ...toBooking(row),
    customerName: row.customer_name,
  };
}

function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    agencyId: row.agency_id,
    bookerCustomerId: row.booker_customer_id,
    tripType: row.trip_type,
    outboundDepartureId: row.outbound_departure_id,
    cancelled: row.cancelled,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.cancelled_at !== null ? { cancelledAt: new Date(row.cancelled_at) } : {}),
    ...(row.cancelled_by_user_id !== null
      ? { cancelledByUserId: row.cancelled_by_user_id }
      : {}),
    ...(row.cancellation_reason !== null ? { cancellationReason: row.cancellation_reason } : {}),
    ...(row.return_departure_id !== null ? { returnDepartureId: row.return_departure_id } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}

function toPassenger(row: PassengerRow): BookingPassenger {
  return {
    id: row.id,
    agencyId: row.agency_id,
    bookingId: row.booking_id,
    name: row.name,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.notes !== null ? { notes: row.notes } : {}),
  };
}
