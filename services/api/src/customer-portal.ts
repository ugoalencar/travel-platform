// Customer-portal data access. Every query here filters by BOTH
// agency_id AND the customer's own id (or the correct FK chain back to
// the customer) at the SQL level. customerId is NEVER taken from request
// params/body/query -- it always comes from getCustomerId(), which reads
// the tenant context established by establishCustomerTenantContext(),
// which itself independently re-validated (via
// validateCustomerAgencyAccess below) that the customer belongs to the
// resolved agency. This file intentionally does not reuse any
// staff/admin data-access function.
import type { Pool } from 'pg';
import type {
  Booking,
  BookingPassenger,
  Offer,
  Proposal,
  Trip,
} from '../../../packages/domain/types';
import { getAgencyId, getCustomerId } from '../../../packages/domain/tenant-context';
import type { ValidateCustomerAgencyAccess } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';

// ============================================================
// Cross-tenant / cross-customer validator (production + dev use this
// same function -- there is no "trust the dev header" shortcut here).
// ============================================================
export function createCustomerAccessValidator(pool: Pool): ValidateCustomerAgencyAccess {
  return async function validateCustomerAgencyAccess(customerId, agencyId) {
    const result = await pool.query(
      `SELECT 1 FROM customers WHERE id = $1 AND agency_id = $2 AND deleted_at IS NULL`,
      [customerId, agencyId],
    );
    return (result.rowCount ?? 0) > 0;
  };
}

// ============================================================
// Profile (read-only; name/email/phone only)
// ============================================================
export interface CustomerProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpfMasked: string | null;
  passportMasked: string | null;
}

interface CustomerProfileRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  passport: string | null;
}

export async function getMyProfile(database: DatabaseRuntime): Promise<CustomerProfile | null> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerProfileRow>(
      `SELECT id, name, email, phone, cpf, passport
       FROM customers
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, customerId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      cpfMasked: maskTail(row.cpf),
      passportMasked: maskTail(row.passport),
    };
  });
}

function maskTail(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const digitsOnly = value.replace(/\s+/g, '');
  if (digitsOnly.length <= 3) {
    return '*'.repeat(digitsOnly.length);
  }
  const tail = digitsOnly.slice(-3);
  return `${'*'.repeat(digitsOnly.length - 3)}${tail}`;
}

// ============================================================
// Trips (scoped: agency_id = $1 AND customer_id = $2)
// ============================================================
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

const TRIP_COLUMNS = `id, agency_id, customer_id, sale_id, name, destination, description,
              start_date, end_date, status, notes, created_at, updated_at`;

export async function listMyTrips(database: DatabaseRuntime): Promise<Trip[]> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TripRow>(
      `SELECT ${TRIP_COLUMNS} FROM trips
       WHERE agency_id = $1 AND customer_id = $2
       ORDER BY start_date DESC`,
      [agencyId, customerId],
    );
    return result.rows.map(toTrip);
  });
}

export async function getMyTripById(database: DatabaseRuntime, id: string): Promise<Trip | null> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TripRow>(
      `SELECT ${TRIP_COLUMNS} FROM trips
       WHERE agency_id = $1 AND customer_id = $2 AND id = $3`,
      [agencyId, customerId, id],
    );
    const row = result.rows[0];
    return row ? toTrip(row) : null;
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

// ============================================================
// Offers -- Offer has no customer-targeting relation in the schema
// (agency_id only). Exposed as agency-wide "available offers", never
// personalized -- do not invent per-customer targeting.
// ============================================================
interface OfferRow {
  id: string;
  agency_id: string;
  name: string;
  description: string | null;
  price: string;
  valid_from: string | null;
  valid_until: string | null;
  status: Offer['status'];
  created_at: string;
  updated_at: string;
}

const OFFER_COLUMNS = `id, agency_id, name, description, price, valid_from, valid_until,
              status, created_at, updated_at`;

export async function listAvailableOffers(database: DatabaseRuntime): Promise<Offer[]> {
  const agencyId = getAgencyId();
  // customerId is still required here even though it is unused in the
  // query -- it enforces that only an established customer context (not
  // a staff context) can reach this function, matching every other
  // function in this file.
  getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<OfferRow>(
      `SELECT ${OFFER_COLUMNS} FROM offers
       WHERE agency_id = $1 AND status = 'ACTIVE'
         AND (valid_until IS NULL OR valid_until >= now())
       ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toOffer);
  });
}

export async function getAvailableOfferById(
  database: DatabaseRuntime,
  id: string,
): Promise<Offer | null> {
  const agencyId = getAgencyId();
  getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<OfferRow>(
      `SELECT ${OFFER_COLUMNS} FROM offers
       WHERE agency_id = $1 AND id = $2 AND status = 'ACTIVE'
         AND (valid_until IS NULL OR valid_until >= now())`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toOffer(row) : null;
  });
}

function toOffer(row: OfferRow): Offer {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    price: Number(row.price),
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.valid_from !== null ? { validFrom: new Date(row.valid_from) } : {}),
    ...(row.valid_until !== null ? { validUntil: new Date(row.valid_until) } : {}),
  };
}

// ============================================================
// Proposals (scoped: agency_id = $1 AND customer_id = $2). Internal/admin
// `notes` are never exposed to the customer portal -- omitted entirely
// from the shape returned here, unlike the staff Proposal type.
// ============================================================
export interface CustomerProposalView {
  id: string;
  agencyId: string;
  customerId: string;
  offerId: string | null;
  wishId: string | null;
  proposedPrice: number;
  discount: number;
  total: number;
  validUntil: Date | null;
  conditions: string | null;
  status: Proposal['status'];
  createdAt: Date;
  updatedAt: Date;
}

interface ProposalRow {
  id: string;
  agency_id: string;
  customer_id: string;
  offer_id: string | null;
  wish_id: string | null;
  proposed_price: string;
  discount: string;
  total: string;
  valid_until: string | null;
  conditions: string | null;
  status: Proposal['status'];
  created_at: string;
  updated_at: string;
}

const CUSTOMER_PROPOSAL_COLUMNS = `id, agency_id, customer_id, offer_id, wish_id, proposed_price,
              discount, total, valid_until, conditions, status, created_at, updated_at`;

export async function listMyProposals(database: DatabaseRuntime): Promise<CustomerProposalView[]> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ProposalRow>(
      `SELECT ${CUSTOMER_PROPOSAL_COLUMNS} FROM proposals
       WHERE agency_id = $1 AND customer_id = $2
       ORDER BY created_at DESC`,
      [agencyId, customerId],
    );
    return result.rows.map(toCustomerProposal);
  });
}

export async function getMyProposalById(
  database: DatabaseRuntime,
  id: string,
): Promise<CustomerProposalView | null> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ProposalRow>(
      `SELECT ${CUSTOMER_PROPOSAL_COLUMNS} FROM proposals
       WHERE agency_id = $1 AND customer_id = $2 AND id = $3`,
      [agencyId, customerId, id],
    );
    const row = result.rows[0];
    return row ? toCustomerProposal(row) : null;
  });
}

function toCustomerProposal(row: ProposalRow): CustomerProposalView {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerId: row.customer_id,
    offerId: row.offer_id,
    wishId: row.wish_id,
    proposedPrice: Number(row.proposed_price),
    discount: Number(row.discount),
    total: Number(row.total),
    validUntil: row.valid_until ? new Date(row.valid_until) : null,
    conditions: row.conditions,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ============================================================
// Bookings (scoped: agency_id = $1 AND booker_customer_id = $2)
// ============================================================
interface BookingRow {
  id: string;
  agency_id: string;
  booker_customer_id: string;
  trip_type: Booking['tripType'];
  outbound_departure_id: string;
  return_departure_id: string | null;
  cancelled: boolean;
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

const BOOKING_COLUMNS = `id, agency_id, booker_customer_id, trip_type, outbound_departure_id,
              return_departure_id, cancelled, notes, created_at, updated_at`;
const PASSENGER_COLUMNS = `id, agency_id, booking_id, name, notes, created_at, updated_at`;

export async function listMyBookings(database: DatabaseRuntime): Promise<Booking[]> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<BookingRow>(
      `SELECT ${BOOKING_COLUMNS} FROM bookings
       WHERE agency_id = $1 AND booker_customer_id = $2
       ORDER BY created_at DESC`,
      [agencyId, customerId],
    );
    return result.rows.map(toBooking);
  });
}

export interface CustomerBookingWithPassengers {
  booking: Booking;
  passengers: BookingPassenger[];
}

export async function getMyBookingById(
  database: DatabaseRuntime,
  id: string,
): Promise<CustomerBookingWithPassengers | null> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<BookingRow>(
      `SELECT ${BOOKING_COLUMNS} FROM bookings
       WHERE agency_id = $1 AND booker_customer_id = $2 AND id = $3`,
      [agencyId, customerId, id],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const passengers = await client.query<PassengerRow>(
      `SELECT ${PASSENGER_COLUMNS} FROM booking_passengers
       WHERE agency_id = $1 AND booking_id = $2
       ORDER BY created_at ASC`,
      [agencyId, id],
    );

    return {
      booking: toBooking(row),
      passengers: passengers.rows.map(toPassenger),
    };
  });
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
