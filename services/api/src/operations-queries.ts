import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';

// ============================================================
// PASSAGEIROS -- cross-trip traveler aggregation.
//
// There is no dedicated "traveler" table. Travelers are referenced from
// air_services / land_services via (customer_id, dependent_id nullable),
// and every trip's primary customer is implicitly a traveler on it even
// with no service rows yet. This aggregates those three sources into one
// read-only, deduplicated list scoped to upcoming/active trips.
// ============================================================

export interface OperationalPassenger {
  tripId: string;
  tripName: string;
  destination: string;
  startDate: Date;
  customerId: string;
  dependentId: string | null;
  travelerName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  documentsFulfilled: number;
  documentsRequired: number;
}

interface PassengerRow {
  trip_id: string;
  trip_name: string;
  destination: string;
  start_date: string;
  customer_id: string;
  dependent_id: string | null;
  traveler_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  documents_fulfilled: string;
  documents_required: string;
}

export async function listOperationalPassengers(
  database: DatabaseRuntime,
): Promise<OperationalPassenger[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<PassengerRow>(
      `WITH travelers AS (
         -- Primary customer on every non-cancelled trip.
         SELECT t.id AS trip_id, t.customer_id, NULL::TEXT AS dependent_id
         FROM trips t
         WHERE t.agency_id = $1 AND t.status IN ('PLANNED', 'CONFIRMED', 'IN_PROGRESS')
         UNION
         SELECT a.trip_id, a.customer_id, a.dependent_id
         FROM air_services a
         JOIN trips t ON t.agency_id = a.agency_id AND t.id = a.trip_id
         WHERE a.agency_id = $1 AND t.status IN ('PLANNED', 'CONFIRMED', 'IN_PROGRESS')
         UNION
         SELECT l.trip_id, l.customer_id, l.dependent_id
         FROM land_services l
         JOIN trips t ON t.agency_id = l.agency_id AND t.id = l.trip_id
         WHERE l.agency_id = $1 AND t.status IN ('PLANNED', 'CONFIRMED', 'IN_PROGRESS')
       )
       SELECT
         t.id AS trip_id, t.name AS trip_name, t.destination, t.start_date,
         tr.customer_id, tr.dependent_id,
         COALESCE(d.name, c.name) AS traveler_name,
         c.email AS contact_email,
         c.phone AS contact_phone,
         COUNT(*) FILTER (WHERE req.fulfilled) AS documents_fulfilled,
         COUNT(req.id) AS documents_required
       FROM (SELECT DISTINCT trip_id, customer_id, dependent_id FROM travelers) tr
       JOIN trips t ON t.agency_id = $1 AND t.id = tr.trip_id
       JOIN customers c ON c.agency_id = $1 AND c.id = tr.customer_id
       LEFT JOIN customer_dependents d ON d.agency_id = $1 AND d.id = tr.dependent_id
       LEFT JOIN travel_requirements req
         ON req.agency_id = $1
        AND req.customer_id = tr.customer_id
        AND (req.dependent_id IS NOT DISTINCT FROM tr.dependent_id)
        AND req.deleted_at IS NULL
       GROUP BY t.id, t.name, t.destination, t.start_date, tr.customer_id, tr.dependent_id,
                d.name, c.name, c.email, c.phone
       ORDER BY t.start_date ASC, traveler_name ASC`,
      [agencyId],
    );

    return result.rows.map((row) => ({
      tripId: row.trip_id,
      tripName: row.trip_name,
      destination: row.destination,
      startDate: new Date(row.start_date),
      customerId: row.customer_id,
      dependentId: row.dependent_id,
      travelerName: row.traveler_name,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      documentsFulfilled: Number(row.documents_fulfilled),
      documentsRequired: Number(row.documents_required),
    }));
  });
}

// ============================================================
// DOCUMENTOS (operational) -- cross-customer document alerts for upcoming
// trips: which travel_requirements are pending, or fulfilled but expiring
// (or already expired). This is the "ver todos" expansion of a dashboard
// document-alerts widget, distinct from Customer 360's per-customer tab.
// ============================================================

export type DocumentAlertStatus = 'PENDENTE' | 'EXPIRANDO' | 'EXPIRADO' | 'OK';

export interface DocumentAlert {
  requirementId: string;
  customerId: string;
  dependentId: string | null;
  travelerName: string;
  tripId: string | null;
  tripName: string | null;
  destination: string | null;
  type: string;
  status: DocumentAlertStatus;
  expirationDate: Date | null;
}

interface DocumentAlertRow {
  requirement_id: string;
  customer_id: string;
  dependent_id: string | null;
  traveler_name: string;
  trip_id: string | null;
  trip_name: string | null;
  destination: string | null;
  type: string;
  fulfilled: boolean;
  expiration_date: string | null;
}

const EXPIRING_WINDOW_DAYS = 60;

export async function listDocumentAlerts(database: DatabaseRuntime): Promise<DocumentAlert[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentAlertRow>(
      `SELECT
         req.id AS requirement_id, req.customer_id, req.dependent_id,
         COALESCE(d.name, c.name) AS traveler_name,
         t.id AS trip_id, t.name AS trip_name, t.destination,
         req.type::TEXT AS type, req.fulfilled, req.expiration_date
       FROM travel_requirements req
       JOIN customers c ON c.agency_id = $1 AND c.id = req.customer_id
       LEFT JOIN customer_dependents d ON d.agency_id = $1 AND d.id = req.dependent_id
       LEFT JOIN trips t ON t.agency_id = $1 AND t.id = req.trip_id
       WHERE req.agency_id = $1
         AND req.deleted_at IS NULL
         AND req.required = true
         AND (
           req.fulfilled = false
           OR (req.expiration_date IS NOT NULL
               AND req.expiration_date <= (CURRENT_DATE + $2::INTEGER))
         )
       ORDER BY
         (req.expiration_date IS NULL) ASC,
         req.expiration_date ASC NULLS LAST`,
      [agencyId, EXPIRING_WINDOW_DAYS],
    );

    return result.rows.map((row) => ({
      requirementId: row.requirement_id,
      customerId: row.customer_id,
      dependentId: row.dependent_id,
      travelerName: row.traveler_name,
      tripId: row.trip_id,
      tripName: row.trip_name,
      destination: row.destination,
      type: row.type,
      status: computeAlertStatus(row),
      expirationDate: row.expiration_date ? new Date(row.expiration_date) : null,
    }));
  });
}

function computeAlertStatus(row: DocumentAlertRow): DocumentAlertStatus {
  if (!row.fulfilled) {
    return 'PENDENTE';
  }
  if (row.expiration_date) {
    const expiry = new Date(row.expiration_date).getTime();
    const now = Date.now();
    if (expiry < now) {
      return 'EXPIRADO';
    }
    const daysLeft = (expiry - now) / (1000 * 60 * 60 * 24);
    if (daysLeft <= EXPIRING_WINDOW_DAYS) {
      return 'EXPIRANDO';
    }
  }
  return 'OK';
}
