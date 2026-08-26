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
  address: Record<string, unknown> | null;
}

interface CustomerProfileRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  passport: string | null;
  address: Record<string, unknown> | null;
}

export async function getMyProfile(database: DatabaseRuntime): Promise<CustomerProfile | null> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CustomerProfileRow>(
      `SELECT id, name, email, phone, cpf, passport, address
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
      address: row.address ?? null,
    };
  });
}

// ============================================================
// Agency contact (read-only, safe projection: name/phone/email only --
// never cnpj, settings, plan, or any staff-internal field).
// ============================================================
export interface CustomerAgencyContact {
  name: string;
  email: string | null;
  phone: string | null;
}

interface AgencyContactRow {
  name: string;
  email: string | null;
  phone: string | null;
}

export async function getMyAgencyContact(
  database: DatabaseRuntime,
): Promise<CustomerAgencyContact | null> {
  const agencyId = getAgencyId();
  // customerId is still required even though unused in the query below --
  // enforces an established customer context, matching every other
  // function in this file.
  getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<AgencyContactRow>(
      `SELECT name, email, phone FROM agencies WHERE id = $1`,
      [agencyId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return { name: row.name, email: row.email, phone: row.phone };
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

// NOTE: row.notes (Trip.notes) is deliberately NEVER copied into the
// returned shape below. It is internal agency-only free text and must
// never reach the customer portal, in the API response or otherwise --
// see the customer-portal productization audit. It is still selected in
// TRIP_COLUMNS only because staff-side queries elsewhere reuse row
// shapes; if that stops being true, drop it from the SELECT list too.
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
  // Enrichment columns (server-side join: bookings -> scheduled_departures
  // (outbound) -> transport_products -> routes). Prefer this single join
  // over N client-side requests per booking.
  departure_at: string;
  arrival_expected_at: string | null;
  departure_cancelled: boolean;
  product_name: string;
  origin: string;
  destination: string;
  passenger_count: string;
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

const BOOKING_COLUMNS = `b.id, b.agency_id, b.booker_customer_id, b.trip_type, b.outbound_departure_id,
              b.return_departure_id, b.cancelled, b.notes, b.created_at, b.updated_at,
              d.departure_at, d.arrival_expected_at, d.cancelled AS departure_cancelled,
              p.name AS product_name, ro.origin AS origin, ro.destination AS destination,
              (SELECT count(*) FROM booking_passengers bp
                 WHERE bp.agency_id = b.agency_id AND bp.booking_id = b.id) AS passenger_count`;
const BOOKING_JOINS = `FROM bookings b
       JOIN scheduled_departures d ON d.agency_id = b.agency_id AND d.id = b.outbound_departure_id
       JOIN transport_products p ON p.agency_id = b.agency_id AND p.id = d.product_id
       JOIN routes ro ON ro.agency_id = b.agency_id AND ro.id = p.outbound_route_id`;
const PASSENGER_COLUMNS = `id, agency_id, booking_id, name, notes, created_at, updated_at`;

// Enriched, read-model shape for the customer portal. Route/date/product
// context and passenger count are resolved server-side via SQL join
// (BOOKING_JOINS above) rather than requiring the frontend to fan out one
// request per booking. `isFuture` is the single source of truth for
// "future booking" semantics: NOT cancelled (booking or departure) AND
// departure_at in the future -- never just `!cancelled`.
export interface CustomerBookingView {
  id: string;
  tripType: Booking['tripType'];
  cancelled: boolean;
  createdAt: string;
  updatedAt: string;
  departureAt: string;
  arrivalExpectedAt: string | null;
  productName: string;
  origin: string;
  destination: string;
  passengerCount: number;
  isFuture: boolean;
}

// Customer-facing passenger projection — excludes internal notes.
export interface CustomerBookingPassenger {
  id: string;
  agencyId: string;
  bookingId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function listMyBookings(database: DatabaseRuntime): Promise<CustomerBookingView[]> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<BookingRow>(
      `SELECT ${BOOKING_COLUMNS}
       ${BOOKING_JOINS}
       WHERE b.agency_id = $1 AND b.booker_customer_id = $2
       ORDER BY d.departure_at DESC`,
      [agencyId, customerId],
    );
    return result.rows.map(toBookingView);
  });
}

export interface CustomerBookingWithPassengers {
  booking: CustomerBookingView;
  passengers: CustomerBookingPassenger[];
}

export async function getMyBookingById(
  database: DatabaseRuntime,
  id: string,
): Promise<CustomerBookingWithPassengers | null> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<BookingRow>(
      `SELECT ${BOOKING_COLUMNS}
       ${BOOKING_JOINS}
       WHERE b.agency_id = $1 AND b.booker_customer_id = $2 AND b.id = $3`,
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
      booking: toBookingView(row),
      passengers: passengers.rows.map(toCustomerPassenger),
    };
  });
}

function toBookingView(row: BookingRow): CustomerBookingView {
  const departureAt = new Date(row.departure_at);
  const isFuture = !row.cancelled && !row.departure_cancelled && departureAt.getTime() > Date.now();
  return {
    id: row.id,
    tripType: row.trip_type,
    cancelled: row.cancelled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    departureAt: row.departure_at,
    arrivalExpectedAt: row.arrival_expected_at,
    productName: row.product_name,
    origin: row.origin,
    destination: row.destination,
    passengerCount: Number(row.passenger_count),
    isFuture,
  };
}

// Customer-facing passenger projection — internal notes never exposed.
function toCustomerPassenger(row: PassengerRow): CustomerBookingPassenger {
  return {
    id: row.id,
    agencyId: row.agency_id,
    bookingId: row.booking_id,
    name: row.name,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
