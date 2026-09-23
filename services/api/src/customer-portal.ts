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
  TravelRequirement,
} from '../../../packages/domain/types';
import { EngagementType } from '../../../packages/domain/types';
import { getAgencyId, getCustomerId } from '../../../packages/domain/tenant-context';
import type { ValidateCustomerAgencyAccess } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { insertEngagement } from './engagements';
import {
  computeEligibleSegmentIds,
  isCustomerInSegment,
} from './customer-segmentation';
import { NotFoundError } from './errors';

// ============================================================
// Cross-tenant / cross-customer validator (production + dev use this
// same function -- there is no "trust the dev header" shortcut here).
//
// customers_select_tenant's RLS policy is `USING (agency_id =
// current_agency_id())`, which reads a per-transaction Postgres setting
// that a bare pool.query() never sets -- so this always returned zero
// rows (silently rejecting every real customer session) until fixed here.
// Found by dry-running Track B locally against a real, NOBYPASSRLS role
// (see services/api/src/dev-auth.ts's createStaffAccessValidator for the
// same bug/fix on the staff side, with the full empirical trace). Fixed
// by explicitly setting tenant context via set_tenant_context() inside a
// short read-only transaction before the SELECT.
// ============================================================
export function createCustomerAccessValidator(pool: Pool): ValidateCustomerAgencyAccess {
  return async function validateCustomerAgencyAccess(customerId, agencyId) {
    const client = await pool.connect();
    let result: { rowCount: number | null };
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_tenant_context($1, $2)', [agencyId, customerId]);
      result = await client.query(
        `SELECT 1 FROM customers WHERE id = $1 AND agency_id = $2 AND deleted_at IS NULL`,
        [customerId, agencyId],
      );
      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
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
  featured: boolean;
  show_on_customer_app: boolean;
  target_segment_id: string | null;
  display_priority: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

const OFFER_COLUMNS = `id, agency_id, name, description, price, valid_from, valid_until,
              status, featured, show_on_customer_app, target_segment_id, display_priority,
              image_url, created_at, updated_at`;

export async function listAvailableOffers(database: DatabaseRuntime): Promise<Offer[]> {
  const agencyId = getAgencyId();
  // customerId is still required here even though it is unused in the
  // query -- it enforces that only an established customer context (not
  // a staff context) can reach this function, matching every other
  // function in this file.
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    // F-04: evaluate this customer's real segment membership live via the
    // shared segmentation engine (fail closed -- non-members get no
    // segment-targeted offers). Never "include all active segments".
    const eligibleSegmentIds = await computeEligibleSegmentIds(client, customerId);

    const result = await client.query<OfferRow>(
      `SELECT ${OFFER_COLUMNS} FROM offers
       WHERE agency_id = $1 AND status = 'ACTIVE'
         AND (valid_until IS NULL OR valid_until >= now())
         AND show_on_customer_app = true
         AND (
           target_segment_id IS NULL
           OR target_segment_id = ANY($2::text[])
         )
       ORDER BY display_priority DESC, created_at DESC`,
       [agencyId, eligibleSegmentIds.length > 0 ? eligibleSegmentIds : ['__none__']],
    );
    // Belt and braces: never surface hidden or non-member-targeted rows
    // even if the SQL predicate were ever bypassed.
    return result.rows
      .filter(
        (row) =>
          row.show_on_customer_app &&
          (row.target_segment_id === null || eligibleSegmentIds.includes(row.target_segment_id)),
      )
      .map(toOffer);
  });
}

export async function getAvailableOfferById(
  database: DatabaseRuntime,
  id: string,
): Promise<Offer | null> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<OfferRow>(
      `SELECT ${OFFER_COLUMNS} FROM offers
       WHERE agency_id = $1 AND id = $2 AND status = 'ACTIVE'
         AND (valid_until IS NULL OR valid_until >= now())
         AND show_on_customer_app = true`,
      [agencyId, id],
    );
    const row = result.rows[0];
    if (!row) return null;

    // Defense in depth: the SQL already requires show_on_customer_app,
    // but never return a hidden offer if the predicate were bypassed.
    if (!row.show_on_customer_app) return null;

    // F-04: a segment-targeted offer is only available to members of
    // that segment (fail closed -- unknown/archived/invalid segment or
    // non-member => not found).
    if (row.target_segment_id !== null) {
      const isMember = await isCustomerInSegment(client, row.target_segment_id, customerId);
      if (!isMember) return null;
    }

    return toOffer(row);
  });
}

function toOffer(row: OfferRow): Offer {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    price: Number(row.price),
    status: row.status,
    featured: row.featured,
    showOnCustomerApp: row.show_on_customer_app,
    displayPriority: row.display_priority,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.valid_from !== null ? { validFrom: new Date(row.valid_from) } : {}),
    ...(row.valid_until !== null ? { validUntil: new Date(row.valid_until) } : {}),
    ...(row.target_segment_id !== null ? { targetSegmentId: row.target_segment_id } : {}),
    ...(row.image_url !== null ? { imageUrl: row.image_url } : {}),
  };
}

// ============================================================
// Travel requirements -- "Próximos passos" checklist for a trip. Reuses
// the existing travel_requirements table (Customer 360). row.notes is
// deliberately NEVER copied into the returned shape below, same
// convention as toTrip() above -- it is internal agency-only free text.
// ============================================================
interface TravelRequirementRow {
  id: string;
  agency_id: string;
  customer_id: string;
  traveler_type: TravelRequirement['travelerType'];
  dependent_id: string | null;
  trip_id: string | null;
  destination: string | null;
  type: TravelRequirement['type'];
  required: boolean;
  fulfilled: boolean;
  document_id: string | null;
  expiration_date: string | null;
  created_at: string;
  updated_at: string;
}

const TRAVEL_REQUIREMENT_COLUMNS = `id, agency_id, customer_id, traveler_type, dependent_id,
              trip_id, destination, type, required, fulfilled, document_id, expiration_date,
              created_at, updated_at`;

export async function listMyTravelRequirements(
  database: DatabaseRuntime,
  tripId?: string,
): Promise<TravelRequirement[]> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TravelRequirementRow>(
      `SELECT ${TRAVEL_REQUIREMENT_COLUMNS} FROM travel_requirements
       WHERE agency_id = $1 AND customer_id = $2 AND deleted_at IS NULL
         AND ($3::text IS NULL OR trip_id = $3)
       ORDER BY created_at DESC`,
      [agencyId, customerId, tripId ?? null],
    );
    return result.rows.map(toTravelRequirement);
  });
}

function toTravelRequirement(row: TravelRequirementRow): TravelRequirement {
  return {
    id: row.id,
    agencyId: row.agency_id,
    customerId: row.customer_id,
    travelerType: row.traveler_type,
    type: row.type,
    required: row.required,
    fulfilled: row.fulfilled,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.dependent_id !== null ? { dependentId: row.dependent_id } : {}),
    ...(row.trip_id !== null ? { tripId: row.trip_id } : {}),
    ...(row.destination !== null ? { destination: row.destination } : {}),
    ...(row.document_id !== null ? { documentId: row.document_id } : {}),
    ...(row.expiration_date !== null ? { expirationDate: new Date(row.expiration_date) } : {}),
  };
}

// ============================================================
// Offer interest -- "Tenho interesse" CTA. Records a real, agency-visible
// engagement (EngagementType.INTEREST) the agency can follow up on via
// the existing staff-side engagements list. Re-validates the offer is a
// real, currently-available offer for this customer's own agency before
// recording anything (never trusts an id blindly).
// ============================================================
export async function recordMyOfferInterest(
  database: DatabaseRuntime,
  offerId: string,
): Promise<void> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  const offer = await getAvailableOfferById(database, offerId);
  if (!offer) {
    throw new NotFoundError('Offer not found');
  }

  await database.withTenantTransaction((client) =>
    insertEngagement(client, agencyId, {
      type: EngagementType.INTEREST,
      channel: 'customer_portal',
      offerId,
      customerId,
    }),
  );
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
  title: string | null;
  subtitle: string | null;
  destinationSummary: string | null;
  travelPeriod: string | null;
  travelerSummary: string | null;
  introText: string | null;
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
  title: string | null;
  subtitle: string | null;
  destination_summary: string | null;
  travel_period: string | null;
  traveler_summary: string | null;
  intro_text: string | null;
  created_at: string;
  updated_at: string;
}

const CUSTOMER_PROPOSAL_COLUMNS = `id, agency_id, customer_id, offer_id, wish_id, proposed_price,
              discount, total, valid_until, conditions, status, title, subtitle,
              destination_summary, travel_period, traveler_summary, intro_text, created_at, updated_at`;

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
    title: row.title,
    subtitle: row.subtitle,
    destinationSummary: row.destination_summary,
    travelPeriod: row.travel_period,
    travelerSummary: row.traveler_summary,
    introText: row.intro_text,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// ============================================================
// Proposal Visual 2.0 -- Customer Proposal Viewer's detail payload.
// One aggregated call (Fase 18: no N+1, no fetch-per-section) --
// proposal + visible sections + their items + media, all in a single
// transaction. Draft-only sections (is_visible_to_customer = false)
// and internal fields (notes, reference_type/reference_id) never reach
// this shape. Media exposes a download URL, never the raw
// secure_file_key.
// ============================================================

export interface CustomerProposalSectionView {
  id: string;
  type: string;
  title: string;
  description: string | null;
  sortOrder: number;
  items: CustomerProposalItemView[];
}

export interface CustomerProposalItemView {
  id: string;
  type: string;
  title: string | null;
  description: string | null;
  sortOrder: number;
  dayNumber: number | null;
  locationName: string | null;
  price: number | null;
}

export interface CustomerProposalMediaView {
  id: string;
  caption: string | null;
  isCover: boolean;
  sortOrder: number;
  downloadUrl: string;
}

export interface CustomerProposalDetail extends CustomerProposalView {
  sections: CustomerProposalSectionView[];
  media: CustomerProposalMediaView[];
}

export async function getMyProposalDetailById(
  database: DatabaseRuntime,
  id: string,
): Promise<CustomerProposalDetail | null> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const proposalResult = await client.query<ProposalRow>(
      `SELECT ${CUSTOMER_PROPOSAL_COLUMNS} FROM proposals
       WHERE agency_id = $1 AND customer_id = $2 AND id = $3`,
      [agencyId, customerId, id],
    );
    const proposalRow = proposalResult.rows[0];
    if (!proposalRow) return null;

    const sectionsResult = await client.query<{
      id: string;
      type: string;
      title: string;
      description: string | null;
      sort_order: number;
    }>(
      `SELECT id, type, title, description, sort_order FROM proposal_sections
       WHERE agency_id = $1 AND proposal_id = $2 AND is_visible_to_customer = true
       ORDER BY sort_order ASC, created_at ASC`,
      [agencyId, id],
    );

    const itemsResult = await client.query<{
      id: string;
      proposal_section_id: string;
      type: string;
      title: string | null;
      description: string | null;
      sort_order: number;
      day_number: number | null;
      location_name: string | null;
      price: string | null;
    }>(
      `SELECT pi.id, pi.proposal_section_id, pi.type, pi.title, pi.description, pi.sort_order,
              pi.day_number, pi.location_name, pi.price
       FROM proposal_items pi
       JOIN proposal_sections ps ON ps.agency_id = pi.agency_id AND ps.id = pi.proposal_section_id
       WHERE pi.agency_id = $1 AND ps.proposal_id = $2 AND ps.is_visible_to_customer = true
       ORDER BY pi.sort_order ASC, pi.created_at ASC`,
      [agencyId, id],
    );

    const mediaResult = await client.query<{
      media_asset_id: string;
      caption: string | null;
      is_cover: boolean;
      sort_order: number;
    }>(
      `SELECT l.media_asset_id, a.alt_text AS caption, (l.usage = 'COVER') AS is_cover, l.sort_order
       FROM media_asset_links l
       JOIN media_assets a ON a.agency_id = l.agency_id AND a.id = l.media_asset_id
       WHERE l.agency_id = $1 AND l.entity_type = 'PROPOSAL' AND l.entity_id = $2
       ORDER BY is_cover DESC, l.sort_order ASC, l.created_at ASC`,
      [agencyId, id],
    );

    const itemsBySection = new Map<string, CustomerProposalItemView[]>();
    for (const item of itemsResult.rows) {
      const list = itemsBySection.get(item.proposal_section_id) ?? [];
      list.push({
        id: item.id,
        type: item.type,
        title: item.title,
        description: item.description,
        sortOrder: item.sort_order,
        dayNumber: item.day_number,
        locationName: item.location_name,
        price: item.price !== null ? Number(item.price) : null,
      });
      itemsBySection.set(item.proposal_section_id, list);
    }

    return {
      ...toCustomerProposal(proposalRow),
      sections: sectionsResult.rows.map((section) => ({
        id: section.id,
        type: section.type,
        title: section.title,
        description: section.description,
        sortOrder: section.sort_order,
        items: itemsBySection.get(section.id) ?? [],
      })),
      media: mediaResult.rows.map((media) => ({
        id: media.media_asset_id,
        caption: media.caption,
        isCover: media.is_cover,
        sortOrder: media.sort_order,
        downloadUrl: `/customer-api/proposals/${id}/media/${media.media_asset_id}/download`,
      })),
    };
  });
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
  notes?: string;
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
      passengers: passengers.rows.map(toPassenger),
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

// ============================================================
// Air segments (scoped: agency_id = $1 AND customer_id = $2, AND the
// segment's trip must also belong to that customer -- belt and braces).
// Deliberately excludes cost/sale_value/commission/supplier/consolidator/
// supplier_due_date/supplier_payment_status -- those are internal
// negotiation/finance fields, never exposed to the customer portal.
// ============================================================
export interface CustomerAirSegmentView {
  id: string;
  tripId: string;
  airline: string;
  direction: string;
  sequence: number;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string | null;
  arrivalDate: string;
  arrivalTime: string | null;
  flightNumber: string | null;
  cabinClass: string;
  bookingLocator: string | null;
  seat: string | null;
  status: string;
}

interface AirSegmentRow {
  id: string;
  trip_id: string;
  airline: string;
  direction: string;
  sequence: number;
  origin: string;
  destination: string;
  departure_date: string;
  departure_time: string | null;
  arrival_date: string;
  arrival_time: string | null;
  flight_number: string | null;
  cabin_class: string;
  booking_locator: string | null;
  seat: string | null;
  status: string;
}

const AIR_SEGMENT_COLUMNS = `a.id, a.trip_id, a.airline, a.direction, a.sequence, a.origin,
  a.destination, a.departure_date, a.arrival_date, a.departure_time, a.arrival_time,
  a.flight_number, a.cabin_class, a.booking_locator, a.seat, a.status`;

export async function listMyTripAirServices(
  database: DatabaseRuntime,
  tripId: string,
): Promise<CustomerAirSegmentView[]> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<AirSegmentRow>(
      `SELECT ${AIR_SEGMENT_COLUMNS}
       FROM air_services a
       JOIN trips t ON t.agency_id = a.agency_id AND t.id = a.trip_id
       WHERE a.agency_id = $1 AND a.customer_id = $2 AND a.trip_id = $3
         AND t.customer_id = $2
       ORDER BY a.direction, a.sequence`,
      [agencyId, customerId, tripId],
    );
    return result.rows.map(toAirSegment);
  });
}

function toAirSegment(row: AirSegmentRow): CustomerAirSegmentView {
  return {
    id: row.id,
    tripId: row.trip_id,
    airline: row.airline,
    direction: row.direction,
    sequence: Number(row.sequence),
    origin: row.origin,
    destination: row.destination,
    departureDate: row.departure_date,
    departureTime: row.departure_time,
    arrivalDate: row.arrival_date,
    arrivalTime: row.arrival_time,
    flightNumber: row.flight_number,
    cabinClass: row.cabin_class,
    bookingLocator: row.booking_locator,
    seat: row.seat,
    status: row.status,
  };
}

// ============================================================
// Land services (same scoping/exclusion rules as air segments above --
// no cost/sale_value/commission/supplier fields exposed).
// ============================================================
export interface CustomerLandServiceView {
  id: string;
  tripId: string;
  serviceType: string;
  description: string;
  startDate: string;
  endDate: string;
  confirmationNumber: string | null;
  status: string;
}

interface LandServiceRow {
  id: string;
  trip_id: string;
  service_type: string;
  description: string;
  start_date: string;
  end_date: string;
  confirmation_number: string | null;
  status: string;
}

const LAND_SERVICE_COLUMNS = `l.id, l.trip_id, l.service_type, l.description, l.start_date,
  l.end_date, l.confirmation_number, l.status`;

export async function listMyTripLandServices(
  database: DatabaseRuntime,
  tripId: string,
): Promise<CustomerLandServiceView[]> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<LandServiceRow>(
      `SELECT ${LAND_SERVICE_COLUMNS}
       FROM land_services l
       JOIN trips t ON t.agency_id = l.agency_id AND t.id = l.trip_id
       WHERE l.agency_id = $1 AND l.customer_id = $2 AND l.trip_id = $3
         AND t.customer_id = $2
       ORDER BY l.start_date`,
      [agencyId, customerId, tripId],
    );
    return result.rows.map(toLandService);
  });
}

function toLandService(row: LandServiceRow): CustomerLandServiceView {
  return {
    id: row.id,
    tripId: row.trip_id,
    serviceType: row.service_type,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    confirmationNumber: row.confirmation_number,
    status: row.status,
  };
}

// ============================================================
// Documents (Customer 360). Only the customer's own documents; internal
// verification notes/verified_by_user_id are omitted -- those are
// staff-only fields.
// ============================================================
export interface CustomerDocumentView {
  id: string;
  documentType: string;
  documentNumber: string;
  holderName: string | null;
  issuingCountry: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  verificationStatus: string;
  attachments: { id: string; attachmentType: string; fileName: string }[];
}

interface DocumentRow {
  id: string;
  document_type: string;
  document_number: string;
  holder_name: string | null;
  issuing_country: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  verification_status: string;
}

export async function listMyDocuments(database: DatabaseRuntime): Promise<CustomerDocumentView[]> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentRow>(
      `SELECT id, document_type, document_number, holder_name, issuing_country,
              issued_date, expiry_date, verification_status
       FROM customer_documents
       WHERE agency_id = $1 AND customer_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [agencyId, customerId],
    );

    const docs = result.rows;
    if (docs.length === 0) {
      return [];
    }

    const attachmentsResult = await client.query<{
      id: string;
      document_id: string;
      attachment_type: string;
      file_name: string;
    }>(
      `SELECT id, document_id, attachment_type, file_name
       FROM document_attachments
       WHERE agency_id = $1 AND document_id = ANY($2::text[]) AND deleted_at IS NULL`,
      [agencyId, docs.map((d) => d.id)],
    );

    return docs.map((row) => ({
      id: row.id,
      documentType: row.document_type,
      documentNumber: row.document_number,
      holderName: row.holder_name,
      issuingCountry: row.issuing_country,
      issuedDate: row.issued_date,
      expiryDate: row.expiry_date,
      verificationStatus: row.verification_status,
      attachments: attachmentsResult.rows
        .filter((a) => a.document_id === row.id)
        .map((a) => ({ id: a.id, attachmentType: a.attachment_type, fileName: a.file_name })),
    }));
  });
}

// ============================================================
// Payment schedule (from the customer's own receivables). Exposes only
// what the customer needs to see: amount due, due date, status, and
// remaining balance -- never internal negotiation/discount/margin
// context (that lives on `sales`/`payables`, which are never queried
// from this file).
// ============================================================
export interface CustomerPaymentScheduleItem {
  id: string;
  description: string;
  amount: number;
  dueAt: string;
  status: string;
  amountPaid: number;
  amountRemaining: number;
}

interface ReceivableWithPaidRow {
  id: string;
  description: string;
  amount: string;
  due_at: string;
  status: string;
  amount_paid: string;
}

export async function listMyPaymentSchedule(
  database: DatabaseRuntime,
): Promise<CustomerPaymentScheduleItem[]> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ReceivableWithPaidRow>(
      `SELECT r.id, r.description, r.amount::text AS amount, r.due_at::text AS due_at, r.status,
              COALESCE((
                SELECT SUM(pa.amount) FROM payment_allocations pa
                WHERE pa.agency_id = r.agency_id AND pa.receivable_id = r.id
              ), 0)::text AS amount_paid
       FROM receivables r
       WHERE r.agency_id = $1 AND r.customer_id = $2
       ORDER BY r.due_at ASC`,
      [agencyId, customerId],
    );
    return result.rows.map((row) => {
      const amount = Number(row.amount);
      const amountPaid = Number(row.amount_paid);
      return {
        id: row.id,
        description: row.description,
        amount,
        dueAt: row.due_at,
        status: row.status,
        amountPaid,
        amountRemaining: Math.max(0, Math.round((amount - amountPaid) * 100) / 100),
      };
    });
  });
}
