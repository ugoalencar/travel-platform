import { getAgencyId } from '../../../packages/domain/tenant-context';
import { EngagementType } from '../../../packages/domain/types';
import type { ConnectorEvent, Engagement } from '../../../packages/domain/types';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ValidationError } from './errors';

interface EngagementRow {
  id: string;
  agency_id: string;
  type: EngagementType;
  channel: string;
  campaign_id: string | null;
  publication_id: string | null;
  offer_id: string | null;
  proposal_id: string | null;
  trip_id: string | null;
  communication_id: string | null;
  external_user_id: string | null;
  customer_id: string | null;
  opportunity_id: string | null;
  content: string | null;
  occurred_at: string;
  raw_payload: unknown;
  created_at: string;
}

export interface RecordEngagementInput {
  type: EngagementType;
  channel: string;
  campaignId?: string;
  publicationId?: string;
  offerId?: string;
  proposalId?: string;
  tripId?: string;
  communicationId?: string;
  externalUserId?: string;
  customerId?: string;
  content?: string;
  occurredAt?: Date;
  rawPayload?: unknown;
}

const COLUMNS = `id, agency_id, type, channel, campaign_id, publication_id, offer_id, proposal_id,
  trip_id, communication_id, external_user_id, customer_id, opportunity_id, content, occurred_at,
  raw_payload, created_at`;

export async function recordEngagement(
  database: DatabaseRuntime,
  data: RecordEngagementInput,
): Promise<Engagement> {
  const agencyId = getAgencyId();
  validateInput(data);

  return database.withTenantTransaction((client) => insertEngagement(client, agencyId, data));
}

export async function insertEngagement(
  client: TenantTransactionClient,
  agencyId: string,
  data: RecordEngagementInput,
): Promise<Engagement> {
  const result = await client.query<EngagementRow>(
    `INSERT INTO engagements
       (agency_id, type, channel, campaign_id, publication_id, offer_id, proposal_id, trip_id,
        communication_id, external_user_id, customer_id, content, occurred_at, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, now()), $14)
     RETURNING ${COLUMNS}`,
    [
      agencyId,
      data.type,
      data.channel,
      data.campaignId ?? null,
      data.publicationId ?? null,
      data.offerId ?? null,
      data.proposalId ?? null,
      data.tripId ?? null,
      data.communicationId ?? null,
      data.externalUserId ?? null,
      data.customerId ?? null,
      data.content ?? null,
      data.occurredAt ?? null,
      data.rawPayload !== undefined ? JSON.stringify(data.rawPayload) : null,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Engagement insert did not return a row');
  return toEngagement(row);
}

// Normalizes a raw ConnectorEvent (from any ChannelConnector, including
// the internal mock adapter) into a real Engagement row. Never trusts
// event.externalUserId as internal identity -- stored verbatim as an
// opaque string.
export function connectorEventToEngagementInput(event: ConnectorEvent): RecordEngagementInput {
  return {
    type: event.type,
    channel: event.channel,
    occurredAt: event.occurredAt,
    ...(event.externalUserId !== undefined ? { externalUserId: event.externalUserId } : {}),
    ...(event.content !== undefined ? { content: event.content } : {}),
    ...(event.rawPayload !== undefined ? { rawPayload: event.rawPayload } : {}),
  };
}

export async function listEngagements(database: DatabaseRuntime): Promise<Engagement[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<EngagementRow>(
      `SELECT ${COLUMNS} FROM engagements WHERE agency_id = $1 ORDER BY occurred_at DESC LIMIT 500`,
      [agencyId],
    );
    return result.rows.map(toEngagement);
  });
}

// Customer 360's engagement timeline/aggregation. Deliberately NOT gated
// by requireEntitlement(SOCIAL_AUTOMATION) like GET /engagements above --
// seeing "Cancún -- 3 visualizações" for a customer is core CRM
// visibility, not the paid social-automation feature that route exists
// for. Uses the engagements_agency_customer_type_idx index added in
// 087_engagement_tracking_columns.sql.
export async function listCustomerEngagements(
  database: DatabaseRuntime,
  customerId: string,
): Promise<Engagement[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<EngagementRow>(
      `SELECT ${COLUMNS} FROM engagements WHERE agency_id = $1 AND customer_id = $2
       ORDER BY occurred_at DESC LIMIT 200`,
      [agencyId, customerId],
    );
    return result.rows.map(toEngagement);
  });
}

function validateInput(data: RecordEngagementInput): void {
  if (!Object.values(EngagementType).includes(data.type)) {
    throw new ValidationError('Field "type" must be a valid EngagementType');
  }
  if (typeof data.channel !== 'string' || data.channel.trim().length === 0) {
    throw new ValidationError('Field "channel" is required');
  }
}

function toEngagement(row: EngagementRow): Engagement {
  return {
    id: row.id,
    agencyId: row.agency_id,
    type: row.type,
    channel: row.channel,
    occurredAt: new Date(row.occurred_at),
    createdAt: new Date(row.created_at),
    ...(row.campaign_id !== null ? { campaignId: row.campaign_id } : {}),
    ...(row.publication_id !== null ? { publicationId: row.publication_id } : {}),
    ...(row.offer_id !== null ? { offerId: row.offer_id } : {}),
    ...(row.proposal_id !== null ? { proposalId: row.proposal_id } : {}),
    ...(row.trip_id !== null ? { tripId: row.trip_id } : {}),
    ...(row.communication_id !== null ? { communicationId: row.communication_id } : {}),
    ...(row.external_user_id !== null ? { externalUserId: row.external_user_id } : {}),
    ...(row.customer_id !== null ? { customerId: row.customer_id } : {}),
    ...(row.opportunity_id !== null ? { opportunityId: row.opportunity_id } : {}),
    ...(row.content !== null ? { content: row.content } : {}),
    ...(row.raw_payload !== null ? { rawPayload: row.raw_payload } : {}),
  };
}
