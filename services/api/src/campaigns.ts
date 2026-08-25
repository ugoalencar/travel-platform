import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import {
  CAMPAIGN_STATUS_TRANSITIONS,
  CampaignStatus,
} from '../../../packages/domain/types';
import type { Campaign } from '../../../packages/domain/types';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { recordAuditLog } from './offer-growth-audit';

interface CampaignRow {
  id: string;
  agency_id: string;
  name: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  publication_starts_at: string | null;
  publication_ends_at: string | null;
  timezone: string;
  status: CampaignStatus;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCampaignInput {
  name: string;
  description?: string;
  startsAt?: Date;
  endsAt?: Date;
  publicationStartsAt?: Date;
  publicationEndsAt?: Date;
  timezone?: string;
  offerIds?: string[];
}

const COLUMNS = `id, agency_id, name, description, starts_at, ends_at, publication_starts_at,
  publication_ends_at, timezone, status, created_by_user_id, created_at, updated_at`;

export async function listCampaigns(database: DatabaseRuntime): Promise<Campaign[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CampaignRow>(
      `SELECT ${COLUMNS} FROM campaigns WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toCampaign);
  });
}

export async function getCampaignById(database: DatabaseRuntime, id: string): Promise<Campaign> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction((client) => loadCampaign(client, agencyId, id));
}

export async function createCampaign(
  database: DatabaseRuntime,
  data: CreateCampaignInput,
): Promise<Campaign> {
  const agencyId = getAgencyId();
  const userId = getUserId();
  validateCreateCampaignInput(data);

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CampaignRow>(
      `INSERT INTO campaigns
         (agency_id, name, description, starts_at, ends_at, publication_starts_at,
          publication_ends_at, timezone, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${COLUMNS}`,
      [
        agencyId,
        data.name,
        data.description ?? null,
        data.startsAt ?? null,
        data.endsAt ?? null,
        data.publicationStartsAt ?? null,
        data.publicationEndsAt ?? null,
        data.timezone ?? 'UTC',
        userId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Campaign insert did not return a row');

    if (data.offerIds && data.offerIds.length > 0) {
      for (const offerId of data.offerIds) {
        await client.query(
          `INSERT INTO campaign_offers (agency_id, campaign_id, offer_id) VALUES ($1, $2, $3)
           ON CONFLICT (agency_id, campaign_id, offer_id) DO NOTHING`,
          [agencyId, row.id, offerId],
        );
      }
    }

    await recordAuditLog(client, {
      actorUserId: userId,
      action: 'campaign.created',
      entityType: 'Campaign',
      entityId: row.id,
      metadata: { name: row.name },
    });

    return toCampaign(row);
  });
}

export async function linkOfferToCampaign(
  database: DatabaseRuntime,
  campaignId: string,
  offerId: string,
): Promise<void> {
  const agencyId = getAgencyId();
  await database.withTenantTransaction(async (client) => {
    await loadCampaign(client, agencyId, campaignId);
    await client.query(
      `INSERT INTO campaign_offers (agency_id, campaign_id, offer_id) VALUES ($1, $2, $3)
       ON CONFLICT (agency_id, campaign_id, offer_id) DO NOTHING`,
      [agencyId, campaignId, offerId],
    );
  });
}

// Explicit lifecycle state machine -- only transitions listed in
// CAMPAIGN_STATUS_TRANSITIONS are valid. Never an arbitrary PATCH to any
// status (campaigns-publications.md's state diagram).
export async function transitionCampaignStatus(
  database: DatabaseRuntime,
  id: string,
  toStatus: CampaignStatus,
): Promise<Campaign> {
  const agencyId = getAgencyId();
  const userId = getUserId();

  if (!Object.values(CampaignStatus).includes(toStatus)) {
    throw new ValidationError('Field "status" must be a valid CampaignStatus');
  }

  return database.withTenantTransaction(async (client) => {
    const current = await lockCampaign(client, agencyId, id);
    if (current.status === toStatus) {
      return current;
    }
    const allowed = CAMPAIGN_STATUS_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new ConflictError(`Campaign cannot transition from ${current.status} to ${toStatus}`);
    }

    const result = await client.query<CampaignRow>(
      `UPDATE campaigns SET status = $3, updated_at = now() WHERE agency_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
      [agencyId, id, toStatus],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Campaign transition did not return a row');

    await recordAuditLog(client, {
      actorUserId: userId,
      action: 'campaign.status_changed',
      entityType: 'Campaign',
      entityId: row.id,
      metadata: { from: current.status, to: toStatus },
    });

    return toCampaign(row);
  });
}

async function loadCampaign(
  client: TenantTransactionClient,
  agencyId: string,
  id: string,
): Promise<Campaign> {
  const result = await client.query<CampaignRow>(
    `SELECT ${COLUMNS} FROM campaigns WHERE agency_id = $1 AND id = $2`,
    [agencyId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Campaign not found');
  return toCampaign(row);
}

async function lockCampaign(
  client: TenantTransactionClient,
  agencyId: string,
  id: string,
): Promise<Campaign> {
  const result = await client.query<CampaignRow>(
    `SELECT ${COLUMNS} FROM campaigns WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
    [agencyId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Campaign not found');
  return toCampaign(row);
}

function validateCreateCampaignInput(data: CreateCampaignInput): void {
  if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    throw new ValidationError('Field "name" is required');
  }
}

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    timezone: row.timezone,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.starts_at !== null ? { startsAt: new Date(row.starts_at) } : {}),
    ...(row.ends_at !== null ? { endsAt: new Date(row.ends_at) } : {}),
    ...(row.publication_starts_at !== null
      ? { publicationStartsAt: new Date(row.publication_starts_at) }
      : {}),
    ...(row.publication_ends_at !== null
      ? { publicationEndsAt: new Date(row.publication_ends_at) }
      : {}),
    ...(row.created_by_user_id !== null ? { createdByUserId: row.created_by_user_id } : {}),
  };
}
