// Customer Engagement Tracking -- digital-behavior signals (view/click)
// from the Customer App, distinct from CustomerInteraction (human/
// commercial actions). See docs/product/CUSTOMER_ENGAGEMENT_TRACKING.md.
//
// Reuses the existing `engagements` table/service entirely (no new
// analytics table). Every function here re-validates the entity is
// real, belongs to this tenant, and (where applicable) belongs to the
// authenticated customer, before recording anything -- ids are never
// trusted from the request alone.
import { EngagementType } from '../../../packages/domain/types';
import { getAgencyId, getCustomerId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { insertEngagement } from './engagements';
import { getAvailableOfferById, getMyProposalById, getMyTripById } from './customer-portal';
import { getVisibleCommunicationById } from './agency-communications';
import { NotFoundError } from './errors';

export interface RecordViewResult {
  // false means the event was suppressed as a duplicate (see
  // REVISIT_WINDOW_MS below) -- not an error, just nothing new to show.
  recorded: boolean;
}

// A second VIEWED-type signal for the same (customer, entity) within
// this window is treated as a reload/re-render/polling artifact, not a
// genuine return visit, and is never written. Past the window, it's a
// real revisit. Chosen deliberately simple (no session store, no
// Redis): one query against `engagements` per view, using the
// engagements_agency_customer_type_idx index added in
// 087_engagement_tracking_columns.sql.
const REVISIT_WINDOW_MS = 30 * 60 * 1000;

type EntityColumn = 'offer_id' | 'proposal_id' | 'trip_id' | 'communication_id';

async function recordEntityView(
  database: DatabaseRuntime,
  entityColumn: EntityColumn,
  entityId: string,
  viewedType: EngagementType,
  revisitedType: EngagementType,
): Promise<RecordViewResult> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const last = await client.query<{ occurred_at: string }>(
      `SELECT occurred_at FROM engagements
       WHERE agency_id = $1 AND customer_id = $2 AND ${entityColumn} = $3
         AND type = ANY($4)
       ORDER BY occurred_at DESC LIMIT 1`,
      [agencyId, customerId, entityId, [viewedType, revisitedType]],
    );
    const lastRow = last.rows[0];
    if (lastRow && Date.now() - new Date(lastRow.occurred_at).getTime() < REVISIT_WINDOW_MS) {
      return { recorded: false };
    }

    const type = lastRow ? revisitedType : viewedType;
    const columnKey = entityColumn.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()) as
      | 'offerId'
      | 'proposalId'
      | 'tripId'
      | 'communicationId';
    await insertEngagement(client, agencyId, {
      type,
      channel: 'customer_portal',
      customerId,
      [columnKey]: entityId,
    });
    return { recorded: true };
  });
}

export async function recordOfferViewed(database: DatabaseRuntime, offerId: string): Promise<RecordViewResult> {
  const offer = await getAvailableOfferById(database, offerId);
  if (!offer) throw new NotFoundError('Offer not found');
  return recordEntityView(database, 'offer_id', offerId, EngagementType.OFFER_VIEWED, EngagementType.OFFER_REVISITED);
}

export async function recordProposalViewed(
  database: DatabaseRuntime,
  proposalId: string,
): Promise<RecordViewResult> {
  const proposal = await getMyProposalById(database, proposalId);
  if (!proposal) throw new NotFoundError('Proposal not found');
  return recordEntityView(
    database,
    'proposal_id',
    proposalId,
    EngagementType.PROPOSAL_VIEWED,
    EngagementType.PROPOSAL_REVISITED,
  );
}

// The taxonomy has no TRIP_REVISITED -- TRIP_VIEWED is used for both the
// first view and later ones, still deduplicated within the same window.
export async function recordTripViewed(database: DatabaseRuntime, tripId: string): Promise<RecordViewResult> {
  const trip = await getMyTripById(database, tripId);
  if (!trip) throw new NotFoundError('Trip not found');
  return recordEntityView(database, 'trip_id', tripId, EngagementType.TRIP_VIEWED, EngagementType.TRIP_VIEWED);
}

// Same rule: COMMUNICATION_VIEWED covers first view and later ones,
// deduplicated. Only CTA clicks get their own distinct event type.
export async function recordCommunicationViewed(
  database: DatabaseRuntime,
  communicationId: string,
): Promise<RecordViewResult> {
  const communication = await getVisibleCommunicationById(database, communicationId);
  if (!communication) throw new NotFoundError('Communication not found');
  return recordEntityView(
    database,
    'communication_id',
    communicationId,
    EngagementType.COMMUNICATION_VIEWED,
    EngagementType.COMMUNICATION_VIEWED,
  );
}

// CTA clicks are never suppressed as duplicates -- unlike a passive
// view, a second click is still a real, distinct signal worth keeping
// (e.g. the customer opening the CTA link again after navigating away).
export async function recordCommunicationCtaClicked(
  database: DatabaseRuntime,
  communicationId: string,
): Promise<RecordViewResult> {
  const communication = await getVisibleCommunicationById(database, communicationId);
  if (!communication) throw new NotFoundError('Communication not found');

  const agencyId = getAgencyId();
  const customerId = getCustomerId();
  return database.withTenantTransaction(async (client) => {
    await insertEngagement(client, agencyId, {
      type: EngagementType.COMMUNICATION_CTA_CLICKED,
      channel: 'customer_portal',
      customerId,
      communicationId,
    });
    return { recorded: true };
  });
}

// Home has no entity id to key off of -- dedup keys on
// (customer, type) alone, matched against rows where every entity
// column is null so it never collides with an entity-scoped VIEWED row.
export async function recordCustomerHomeViewed(database: DatabaseRuntime): Promise<RecordViewResult> {
  const agencyId = getAgencyId();
  const customerId = getCustomerId();

  return database.withTenantTransaction(async (client) => {
    const last = await client.query<{ occurred_at: string }>(
      `SELECT occurred_at FROM engagements
       WHERE agency_id = $1 AND customer_id = $2 AND type = $3
         AND offer_id IS NULL AND proposal_id IS NULL AND trip_id IS NULL AND communication_id IS NULL
       ORDER BY occurred_at DESC LIMIT 1`,
      [agencyId, customerId, EngagementType.CUSTOMER_HOME_VIEWED],
    );
    const lastRow = last.rows[0];
    if (lastRow && Date.now() - new Date(lastRow.occurred_at).getTime() < REVISIT_WINDOW_MS) {
      return { recorded: false };
    }
    await insertEngagement(client, agencyId, {
      type: EngagementType.CUSTOMER_HOME_VIEWED,
      channel: 'customer_portal',
      customerId,
    });
    return { recorded: true };
  });
}
