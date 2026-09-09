import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { NotFoundError, ValidationError } from './errors';

export type PostTripChecklistItemKey =
  | 'SATISFACAO_ENVIADA'
  | 'AVALIACAO_RECEBIDA'
  | 'DOCUMENTOS_DEVOLVIDOS'
  | 'PROXIMA_OFERTA_SUGERIDA';

export const POST_TRIP_CHECKLIST_ITEMS: readonly PostTripChecklistItemKey[] = [
  'SATISFACAO_ENVIADA',
  'AVALIACAO_RECEBIDA',
  'DOCUMENTOS_DEVOLVIDOS',
  'PROXIMA_OFERTA_SUGERIDA',
];

export interface PostTripChecklistEntry {
  itemKey: PostTripChecklistItemKey;
  done: boolean;
  doneAt: Date | null;
  notes: string | null;
}

export interface CompletedTripWithChecklist {
  tripId: string;
  tripName: string;
  customerName: string;
  destination: string;
  endDate: Date;
  items: PostTripChecklistEntry[];
}

interface ChecklistRow {
  trip_id: string;
  trip_name: string;
  customer_name: string;
  destination: string;
  end_date: string;
  item_key: PostTripChecklistItemKey | null;
  done: boolean | null;
  done_at: string | null;
  notes: string | null;
}

/**
 * Completed trips joined against whatever checklist rows already exist for
 * them. A trip with no rows yet still appears (LEFT JOIN) with every item
 * defaulted to not-done -- rows are only materialized in the DB the first
 * time an item is toggled, matching the read-mostly usage pattern.
 */
export async function listCompletedTripsWithChecklist(
  database: DatabaseRuntime,
): Promise<CompletedTripWithChecklist[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<ChecklistRow>(
      `SELECT t.id AS trip_id, t.name AS trip_name, c.name AS customer_name,
              t.destination, t.end_date,
              p.item_key, p.done, p.done_at, p.notes
       FROM trips t
       JOIN customers c ON c.agency_id = t.agency_id AND c.id = t.customer_id
       LEFT JOIN post_trip_checklist p
         ON p.agency_id = t.agency_id AND p.trip_id = t.id
       WHERE t.agency_id = $1 AND t.status = 'COMPLETED'
       ORDER BY t.end_date DESC`,
      [agencyId],
    );

    const byTrip = new Map<string, CompletedTripWithChecklist>();
    for (const row of result.rows) {
      let trip = byTrip.get(row.trip_id);
      if (!trip) {
        trip = {
          tripId: row.trip_id,
          tripName: row.trip_name,
          customerName: row.customer_name,
          destination: row.destination,
          endDate: new Date(row.end_date),
          items: POST_TRIP_CHECKLIST_ITEMS.map((itemKey) => ({
            itemKey,
            done: false,
            doneAt: null,
            notes: null,
          })),
        };
        byTrip.set(row.trip_id, trip);
      }
      if (row.item_key) {
        const item = trip.items.find((i) => i.itemKey === row.item_key);
        if (item) {
          item.done = row.done ?? false;
          item.doneAt = row.done_at ? new Date(row.done_at) : null;
          item.notes = row.notes;
        }
      }
    }
    return [...byTrip.values()];
  });
}

export async function setPostTripChecklistItem(
  database: DatabaseRuntime,
  tripId: string,
  itemKey: PostTripChecklistItemKey,
  done: boolean,
  notes?: string,
): Promise<PostTripChecklistEntry> {
  const agencyId = getAgencyId();

  if (!POST_TRIP_CHECKLIST_ITEMS.includes(itemKey)) {
    throw new ValidationError(`Unknown checklist item "${itemKey}"`);
  }

  return database.withTenantTransaction(async (client) => {
    const tripCheck = await client.query<{ status: string }>(
      `SELECT status FROM trips WHERE agency_id = $1 AND id = $2`,
      [agencyId, tripId],
    );
    const trip = tripCheck.rows[0];
    if (!trip) {
      throw new NotFoundError('Trip not found');
    }
    if (trip.status !== 'COMPLETED') {
      throw new ValidationError('Post-trip checklist only applies to completed trips');
    }

    const result = await client.query<{
      item_key: PostTripChecklistItemKey;
      done: boolean;
      done_at: string | null;
      notes: string | null;
    }>(
      `INSERT INTO post_trip_checklist (agency_id, trip_id, item_key, done, done_at, notes)
       VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN now() ELSE NULL END, $5)
       ON CONFLICT (agency_id, trip_id, item_key)
       DO UPDATE SET
         done = EXCLUDED.done,
         done_at = CASE WHEN EXCLUDED.done THEN COALESCE(post_trip_checklist.done_at, now()) ELSE NULL END,
         notes = EXCLUDED.notes,
         updated_at = now()
       RETURNING item_key, done, done_at, notes`,
      [agencyId, tripId, itemKey, done, notes ?? null],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Checklist upsert did not return a row');
    }
    return {
      itemKey: row.item_key,
      done: row.done,
      doneAt: row.done_at ? new Date(row.done_at) : null,
      notes: row.notes,
    };
  });
}
