/* eslint-disable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-return */
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
      COALESCE(SUM(s.total_amount), '0')::text as total
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

  return rows.map((row) => ({
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
      COALESCE(b.status, 'ACTIVE')::text as status,
      COUNT(b.id)::integer as count
    FROM bookings b
    WHERE b.agency_id = $1
    GROUP BY b.status
    ORDER BY count DESC
    `,
    [agencyId],
  );

  return rows;
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

  const { sent, accepted } = result[0] || { sent: 0, accepted: 0 };
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
    SELECT
      t.destination,
      COUNT(DISTINCT b.id)::integer as booking_count,
      COUNT(DISTINCT t.id)::integer as trip_count
    FROM trips t
    LEFT JOIN bookings b ON t.id = b.trip_id OR t.id = (
      SELECT t2.id FROM trips t2 WHERE t2.id = b.trip_id
    )
    WHERE t.agency_id = $1
    GROUP BY t.destination
    ORDER BY booking_count DESC
    LIMIT $2
    `,
    [agencyId, limit],
  );

  return rows.map((row) => {
    const rowData = row as { destination: string; booking_count: number; trip_count: number };
    return {
      destination: rowData.destination,
      bookingCount: rowData.booking_count,
      tripCount: rowData.trip_count,
    };
  });
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

  return rows;
}

export type { SalesByPeriod, BookingsByStatus, ProposalConversion, TopDestination, TripsByStatus };
