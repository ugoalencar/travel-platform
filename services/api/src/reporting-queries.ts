import type { TenantTransactionClient } from './database';
import { getAgencyId } from '../../../packages/domain/tenant-context';

// ============================================================
// REPORTING QUERIES
// All queries are tenant-scoped using getAgencyId()
// Server-side aggregation only - no client-side computation
// ============================================================

interface SalesByPeriod {
  period: string;
  count: number;
  total: string;
}

interface BookingsByStatus {
  status: string;
  count: number;
}

interface ProposalConversion {
  sent: number;
  accepted: number;
  conversionRate: string;
}

interface TopDestination {
  destination: string;
  bookingCount: number;
  tripCount: number;
}

interface TripsByStatus {
  status: string;
  count: number;
}

/**
 * Sales by period (month/quarter based on date range)
 * Only counts CONFIRMED sales
 */
export async function getSalesByPeriod(
  client: TenantTransactionClient,
  startDate: string,
  endDate: string,
): Promise<SalesByPeriod[]> {
  const agencyId = getAgencyId();

  const rows = await client.query<
    { period: string; count: number; total: string }
  >(
    `
    SELECT
      TO_CHAR(s.created_at, 'Mon/YYYY') as period,
      COUNT(s.id)::integer as count,
      COALESCE(SUM(s.total), '0')::text as total
    FROM sales s
    WHERE s.agency_id = $1
      AND s.created_at >= $2::timestamp
      AND s.created_at <= $3::timestamp
      AND s.status = 'CONFIRMED'
    GROUP BY TO_CHAR(s.created_at, 'Mon/YYYY')
    ORDER BY MIN(s.created_at) ASC
    `,
    [agencyId, startDate, endDate],
  );

  return rows.rows.map((row) => ({
    period: row.period,
    count: row.count,
    total: row.total,
  }));
}

/**
 * Bookings by status (ACTIVE, CANCELLED, etc.)
 * Aggregates all bookings regardless of date
 */
export async function getBookingsByStatus(
  client: TenantTransactionClient,
): Promise<BookingsByStatus[]> {
  const agencyId = getAgencyId();

  const rows = await client.query<{ status: string; count: number }>(
    `
    SELECT
      CASE WHEN b.cancelled THEN 'CANCELLED' ELSE 'ACTIVE' END as status,
      COUNT(b.id)::integer as count
    FROM bookings b
    WHERE b.agency_id = $1
    GROUP BY status
    ORDER BY count DESC
    `,
    [agencyId],
  );

  return rows.rows;
}

/**
 * Proposal conversion metrics
 * Sent = all proposals with status SENT
 * Accepted = proposals that became sales
 */
export async function getProposalConversion(
  client: TenantTransactionClient,
): Promise<ProposalConversion> {
  const agencyId = getAgencyId();

  const result = await client.query<{
    sent: number;
    accepted: number;
  }>(
    `
    WITH proposal_counts AS (
      SELECT
        COUNT(CASE WHEN p.status = 'SENT' THEN 1 END)::integer as sent_count,
        COUNT(CASE WHEN s.id IS NOT NULL THEN 1 END)::integer as accepted_count
      FROM proposals p
      LEFT JOIN sales s ON p.id = s.proposal_id
      WHERE p.agency_id = $1
    )
    SELECT sent_count as sent, accepted_count as accepted
    FROM proposal_counts
    `,
    [agencyId],
  );

  const { sent, accepted } = result.rows[0] || { sent: 0, accepted: 0 };
  const rate = sent > 0 ? ((accepted / sent) * 100).toFixed(2) : '0.00';

  return {
    sent,
    accepted,
    conversionRate: rate,
  };
}

/**
 * Top destinations by booking count
 * Limited to top N destinations
 */
export async function getTopDestinations(
  client: TenantTransactionClient,
  limit: number = 10,
): Promise<TopDestination[]> {
  const agencyId = getAgencyId();

  const rows = await client.query<
    { destination: string; booking_count: number; trip_count: number }
  >(
    `
    WITH trip_counts AS (
      SELECT
        t.destination,
        COUNT(t.id)::integer as trip_count
      FROM trips t
      WHERE t.agency_id = $1
      GROUP BY t.destination
    ),
    booking_counts AS (
      SELECT
        r.destination,
        COUNT(b.id)::integer as booking_count
      FROM bookings b
      JOIN scheduled_departures sd
        ON sd.agency_id = b.agency_id
       AND sd.id = b.outbound_departure_id
      JOIN transport_products tp
        ON tp.agency_id = sd.agency_id
       AND tp.id = sd.product_id
      JOIN routes r
        ON r.agency_id = tp.agency_id
       AND r.id = tp.outbound_route_id
      WHERE b.agency_id = $1
      GROUP BY r.destination
    )
    SELECT
      COALESCE(tc.destination, bc.destination) as destination,
      COALESCE(bc.booking_count, 0)::integer as booking_count,
      COALESCE(tc.trip_count, 0)::integer as trip_count
    FROM trip_counts tc
    FULL OUTER JOIN booking_counts bc ON bc.destination = tc.destination
    ORDER BY booking_count DESC, trip_count DESC, destination ASC
    LIMIT $2
    `,
    [agencyId, limit],
  );

  return rows.rows.map((row) => ({
    destination: row.destination,
    bookingCount: row.booking_count,
    tripCount: row.trip_count,
  }));
}

/**
 * Trips by status (PLANNED, IN_PROGRESS, COMPLETED, CANCELLED)
 */
export async function getTripsByStatus(
  client: TenantTransactionClient,
): Promise<TripsByStatus[]> {
  const agencyId = getAgencyId();

  const rows = await client.query<{ status: string; count: number }>(
    `
    SELECT
      COALESCE(t.status, 'PLANNED')::text as status,
      COUNT(t.id)::integer as count
    FROM trips t
    WHERE t.agency_id = $1
    GROUP BY t.status
    ORDER BY count DESC
    `,
    [agencyId],
  );

  return rows.rows;
}

export type { SalesByPeriod, BookingsByStatus, ProposalConversion, TopDestination, TripsByStatus };
