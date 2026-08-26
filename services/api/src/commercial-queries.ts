// ============================================================
// COMMERCIAL COCKPIT -- REUSABLE QUERY LAYER
// ============================================================
// Plain, HTTP-independent query functions intended to be reusable by any
// future consumer of this domain (a future bot/WhatsApp integration is
// explicitly NOT implemented here -- see the brief for this vertical).
//
// Each function takes an explicit agencyId (and customerId where the
// question is customer-scoped) as a parameter rather than reading it off
// ambient AsyncLocalStorage tenant context, so a non-HTTP caller can use
// them directly. They still take a `client` that must already be inside a
// transaction where set_tenant_context() has been called (RLS-enforced) --
// callers reached via HTTP get that from DatabaseRuntime.withTenantTransaction
// (see commercial-cockpit.ts); a future bot integration would need its own
// equivalent tenant-context-establishing wrapper, not a bypass of RLS.
// ============================================================

import type { TenantTransactionClient } from './database';

export interface NextTripSummary {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface NextDepartureSummary {
  bookingId: string;
  departureId: string;
  departureAt: string;
  originDestination: string;
}

export interface FollowUpDue {
  id: string;
  customerId: string;
  opportunityId: string | null;
  title: string;
  dueAt: string;
  type: string;
}

export type OverdueFollowUp = FollowUpDue;

export interface ProposalNoResponse {
  id: string;
  customerId: string;
  total: string;
  validUntil: string | null;
  createdAt: string;
}

export interface CustomerProposalStatus {
  id: string;
  customerId: string;
  status: string;
  total: string;
  validUntil: string | null;
  createdAt: string;
}

export interface TravelerToDestination {
  tripId: string;
  customerId: string;
  destination: string;
  startDate: string;
  endDate: string;
}

export interface UpcomingTripSummary {
  tripId: string;
  customerId: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface OverdueReceivableSummary {
  id: string;
  saleId: string | null;
  customerId: string;
  description: string;
  amount: string;
  dueAt: string;
  status: string;
}

export interface CancelledBookingSummary {
  id: string;
  customerId: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface CustomerBookingSummary {
  id: string;
  customerId: string;
  tripType: string;
  departureAt: string;
  originDestination: string;
  cancelled: boolean;
}

// "Customer's next trip" -- the earliest upcoming (or in-progress) Trip
// for this customer. Commercial date concept (Trip), not the operational
// ScheduledDeparture concept -- see getNextDepartureForCustomerBooking.
export async function getCustomerNextTrip(
  client: TenantTransactionClient,
  agencyId: string,
  customerId: string,
): Promise<NextTripSummary | null> {
  const result = await client.query<NextTripSummary>(
    `SELECT id, name, destination, start_date::text AS "startDate",
            end_date::text AS "endDate", status::text AS status
     FROM trips
     WHERE agency_id = $1 AND customer_id = $2
       AND status NOT IN ('CANCELLED', 'COMPLETED')
       AND end_date >= CURRENT_DATE
     ORDER BY start_date ASC
     LIMIT 1`,
    [agencyId, customerId],
  );
  return result.rows[0] ?? null;
}

// "Next departure time for their booking" -- operational date concept
// (ScheduledDeparture), deliberately separate from Trip dates above.
export async function getNextDepartureForCustomerBooking(
  client: TenantTransactionClient,
  agencyId: string,
  customerId: string,
): Promise<NextDepartureSummary | null> {
  const result = await client.query<NextDepartureSummary>(
    `SELECT b.id AS "bookingId", sd.id AS "departureId",
            sd.departure_at::text AS "departureAt",
            r.origin || ' -> ' || r.destination AS "originDestination"
     FROM bookings b
     JOIN scheduled_departures sd ON sd.agency_id = b.agency_id AND sd.id = b.outbound_departure_id
     JOIN transport_products tp ON tp.agency_id = sd.agency_id AND tp.id = sd.product_id
     JOIN routes r ON r.agency_id = tp.agency_id AND r.id = tp.outbound_route_id
     WHERE b.agency_id = $1 AND b.booker_customer_id = $2
       AND sd.departure_at >= now()
     ORDER BY sd.departure_at ASC
     LIMIT 1`,
    [agencyId, customerId],
  );
  return result.rows[0] ?? null;
}

// "Whether their proposal is still valid" -- read-only check, never
// mutates Proposal.status (which remains unmanaged/read-only per ADR).
export async function isProposalStillValid(
  client: TenantTransactionClient,
  agencyId: string,
  proposalId: string,
): Promise<boolean> {
  const result = await client.query<{ valid: boolean }>(
    `SELECT (status IN ('DRAFT', 'SENT') AND (valid_until IS NULL OR valid_until > now())) AS valid
     FROM proposals
     WHERE agency_id = $1 AND id = $2`,
    [agencyId, proposalId],
  );
  return result.rows[0]?.valid ?? false;
}

// "Which follow-ups a staff member owes today" -- pending (not completed)
// CommercialTask rows due today or earlier, for one assigned user.
export async function listFollowUpsDueTodayForUser(
  client: TenantTransactionClient,
  agencyId: string,
  assignedUserId: string,
): Promise<FollowUpDue[]> {
  const result = await client.query<FollowUpDue>(
    `SELECT id, customer_id AS "customerId", opportunity_id AS "opportunityId",
            title, due_at::text AS "dueAt", type::text AS type
     FROM commercial_tasks
     WHERE agency_id = $1 AND assigned_user_id = $2
       AND completed_at IS NULL
       AND due_at <= (CURRENT_DATE + INTERVAL '1 day')
     ORDER BY due_at ASC`,
    [agencyId, assignedUserId],
  );
  return result.rows;
}

export async function listOverdueFollowUps(
  client: TenantTransactionClient,
  agencyId: string,
): Promise<OverdueFollowUp[]> {
  const result = await client.query<OverdueFollowUp>(
    `SELECT id, customer_id AS "customerId", opportunity_id AS "opportunityId",
            title, due_at::text AS "dueAt", type::text AS type
     FROM commercial_tasks
     WHERE agency_id = $1
       AND completed_at IS NULL
       AND due_at < now()
     ORDER BY due_at ASC`,
    [agencyId],
  );
  return result.rows;
}

// "Which proposals have no response" -- Proposal.status = SENT with no
// CommercialOpportunity closed (WON/LOST) referencing it. Read-only;
// never infers or writes a Proposal.status transition.
export async function listProposalsWithNoResponse(
  client: TenantTransactionClient,
  agencyId: string,
): Promise<ProposalNoResponse[]> {
  const result = await client.query<ProposalNoResponse>(
    `SELECT p.id, p.customer_id AS "customerId", p.total::text AS total,
            p.valid_until::text AS "validUntil", p.created_at::text AS "createdAt"
     FROM proposals p
     WHERE p.agency_id = $1
       AND p.status = 'SENT'
       AND NOT EXISTS (
         SELECT 1 FROM commercial_opportunities co
         WHERE co.agency_id = p.agency_id AND co.proposal_id = p.id
           AND co.stage IN ('WON', 'LOST')
       )
     ORDER BY p.created_at ASC`,
    [agencyId],
  );
  return result.rows;
}

export async function getCustomerProposalStatus(
  client: TenantTransactionClient,
  agencyId: string,
  customerId: string,
  proposalId: string,
): Promise<CustomerProposalStatus | null> {
  const result = await client.query<CustomerProposalStatus>(
    `SELECT id, customer_id AS "customerId", status::text AS status,
            total::text AS total, valid_until::text AS "validUntil",
            created_at::text AS "createdAt"
     FROM proposals
     WHERE agency_id = $1 AND customer_id = $2 AND id = $3`,
    [agencyId, customerId, proposalId],
  );
  return result.rows[0] ?? null;
}

export async function listOverdueReceivables(
  client: TenantTransactionClient,
  agencyId: string,
): Promise<OverdueReceivableSummary[]> {
  const result = await client.query<OverdueReceivableSummary>(
    `SELECT id, sale_id AS "saleId", customer_id AS "customerId",
            description, amount::text AS amount, due_at::text AS "dueAt",
            status::text AS status
     FROM receivables
     WHERE agency_id = $1
       AND status IN ('OPEN', 'PARTIALLY_PAID')
       AND due_at < now()
     ORDER BY due_at ASC`,
    [agencyId],
  );
  return result.rows;
}

export async function listUpcomingTrips(
  client: TenantTransactionClient,
  agencyId: string,
): Promise<UpcomingTripSummary[]> {
  const result = await client.query<UpcomingTripSummary>(
    `SELECT id AS "tripId", customer_id AS "customerId", destination,
            start_date::text AS "startDate", end_date::text AS "endDate",
            status::text AS status
     FROM trips
     WHERE agency_id = $1
       AND status NOT IN ('CANCELLED', 'COMPLETED')
       AND start_date >= CURRENT_DATE
     ORDER BY start_date ASC`,
    [agencyId],
  );
  return result.rows;
}

export async function listCancelledBookings(
  client: TenantTransactionClient,
  agencyId: string,
): Promise<CancelledBookingSummary[]> {
  const result = await client.query<CancelledBookingSummary>(
    `SELECT id, booker_customer_id AS "customerId",
            cancelled_at::text AS "cancelledAt",
            cancellation_reason AS "cancellationReason"
     FROM bookings
     WHERE agency_id = $1 AND cancelled = true
     ORDER BY cancelled_at DESC NULLS LAST, updated_at DESC`,
    [agencyId],
  );
  return result.rows;
}

export async function listCustomerBookings(
  client: TenantTransactionClient,
  agencyId: string,
  customerId: string,
): Promise<CustomerBookingSummary[]> {
  const result = await client.query<CustomerBookingSummary>(
    `SELECT b.id, b.booker_customer_id AS "customerId",
            b.trip_type::text AS "tripType",
            sd.departure_at::text AS "departureAt",
            r.origin || ' -> ' || r.destination AS "originDestination",
            b.cancelled
     FROM bookings b
     JOIN scheduled_departures sd ON sd.agency_id = b.agency_id AND sd.id = b.outbound_departure_id
     JOIN transport_products tp ON tp.agency_id = sd.agency_id AND tp.id = sd.product_id
     JOIN routes r ON r.agency_id = tp.agency_id AND r.id = tp.outbound_route_id
     WHERE b.agency_id = $1 AND b.booker_customer_id = $2
     ORDER BY sd.departure_at ASC`,
    [agencyId, customerId],
  );
  return result.rows;
}

// "Who is traveling to a destination in a date range" -- commercial Trip
// dates (never merged with operational ScheduledDeparture times).
export async function listTravelersToDestination(
  client: TenantTransactionClient,
  agencyId: string,
  destination: string,
  dateFrom: string,
  dateTo: string,
): Promise<TravelerToDestination[]> {
  const result = await client.query<TravelerToDestination>(
    `SELECT id AS "tripId", customer_id AS "customerId", destination,
            start_date::text AS "startDate", end_date::text AS "endDate"
     FROM trips
     WHERE agency_id = $1
       AND destination ILIKE '%' || $2 || '%'
       AND start_date <= $4::date AND end_date >= $3::date
       AND status NOT IN ('CANCELLED')
     ORDER BY start_date ASC`,
    [agencyId, destination, dateFrom, dateTo],
  );
  return result.rows;
}

export interface PostSaleCandidate {
  tripId: string;
  customerId: string;
  destination: string;
  endDate: string;
}

// Read-only detection: Trip.status = COMPLETED with no existing
// CommercialTask of type POST_SALE for that customer yet. Never
// auto-creates a task -- exposed so staff can manually create one.
export async function listPostSaleCandidates(
  client: TenantTransactionClient,
  agencyId: string,
): Promise<PostSaleCandidate[]> {
  const result = await client.query<PostSaleCandidate>(
    `SELECT t.id AS "tripId", t.customer_id AS "customerId", t.destination,
            t.end_date::text AS "endDate"
     FROM trips t
     WHERE t.agency_id = $1
       AND t.status = 'COMPLETED'
       AND NOT EXISTS (
         SELECT 1 FROM commercial_tasks ct
         WHERE ct.agency_id = t.agency_id AND ct.customer_id = t.customer_id
           AND ct.type = 'POST_SALE'
       )
     ORDER BY t.end_date DESC`,
    [agencyId],
  );
  return result.rows;
}
