import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import {
  PUBLICATION_STATUS_TRANSITIONS,
  PublicationStatus,
} from '../../../packages/domain/types';
import type { Publication } from '../../../packages/domain/types';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { recordAuditLog } from './offer-growth-audit';
import type { ChannelConnector } from '../../../packages/domain/types';

interface PublicationRow {
  id: string;
  agency_id: string;
  campaign_id: string;
  offer_id: string;
  creative_template_id: string | null;
  channel: string;
  snapshot: Record<string, unknown> | null;
  snapshot_generated_at: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  status: PublicationStatus;
  external_publication_id: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePublicationInput {
  campaignId: string;
  offerId: string;
  channel: string;
  creativeTemplateId?: string;
  scheduledAt?: Date;
}

const COLUMNS = `id, agency_id, campaign_id, offer_id, creative_template_id, channel, snapshot,
  snapshot_generated_at, scheduled_at, published_at, status, external_publication_id,
  created_by_user_id, created_at, updated_at`;

export async function listPublications(database: DatabaseRuntime): Promise<Publication[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<PublicationRow>(
      `SELECT ${COLUMNS} FROM publications WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toPublication);
  });
}

export async function getPublicationById(database: DatabaseRuntime, id: string): Promise<Publication> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction((client) => loadPublication(client, agencyId, id));
}

export async function createPublication(
  database: DatabaseRuntime,
  data: CreatePublicationInput,
): Promise<Publication> {
  const agencyId = getAgencyId();
  const userId = getUserId();
  validateCreatePublicationInput(data);

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<PublicationRow>(
      `INSERT INTO publications
         (agency_id, campaign_id, offer_id, creative_template_id, channel, scheduled_at, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [
        agencyId,
        data.campaignId,
        data.offerId,
        data.creativeTemplateId ?? null,
        data.channel,
        data.scheduledAt ?? null,
        userId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Publication insert did not return a row');

    await recordAuditLog(client, {
      actorUserId: userId,
      action: 'publication.created',
      entityType: 'Publication',
      entityId: row.id,
      metadata: { channel: row.channel, campaignId: row.campaign_id },
    });

    return toPublication(row);
  });
}

// Generates and freezes the creative snapshot. Immutable once set: a
// later Offer edit must never re-derive or overwrite it (campaigns-
// publications.md). Enforced here by only ever writing snapshot when it
// is currently NULL.
export async function generatePublicationSnapshot(
  database: DatabaseRuntime,
  id: string,
  snapshot: Record<string, unknown>,
): Promise<Publication> {
  const agencyId = getAgencyId();
  const userId = getUserId();

  return database.withTenantTransaction(async (client) => {
    const current = await lockPublication(client, agencyId, id);
    if (current.snapshot) {
      throw new ConflictError('Publication snapshot is already set and is immutable');
    }

    const result = await client.query<PublicationRow>(
      `UPDATE publications
       SET snapshot = $3, snapshot_generated_at = now(), updated_at = now()
       WHERE agency_id = $1 AND id = $2 AND snapshot IS NULL
       RETURNING ${COLUMNS}`,
      [agencyId, id, JSON.stringify(snapshot)],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ConflictError('Publication snapshot is already set and is immutable');
    }

    await recordAuditLog(client, {
      actorUserId: userId,
      action: 'publication.snapshot_generated',
      entityType: 'Publication',
      entityId: row.id,
      metadata: {},
    });

    return toPublication(row);
  });
}

export async function transitionPublicationStatus(
  database: DatabaseRuntime,
  id: string,
  toStatus: PublicationStatus,
  options: { externalPublicationId?: string } = {},
): Promise<Publication> {
  const agencyId = getAgencyId();
  const userId = getUserId();

  if (!Object.values(PublicationStatus).includes(toStatus)) {
    throw new ValidationError('Field "status" must be a valid PublicationStatus');
  }

  return database.withTenantTransaction(async (client) => {
    const current = await lockPublication(client, agencyId, id);
    if (current.status === toStatus) {
      return current;
    }
    const allowed = PUBLICATION_STATUS_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new ConflictError(`Publication cannot transition from ${current.status} to ${toStatus}`);
    }

    const publishedAtSql = toStatus === PublicationStatus.PUBLISHED ? 'now()' : 'published_at';
    const result = await client.query<PublicationRow>(
      `UPDATE publications
       SET status = $3, external_publication_id = COALESCE($4, external_publication_id),
           published_at = ${publishedAtSql}, updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${COLUMNS}`,
      [agencyId, id, toStatus, options.externalPublicationId ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Publication transition did not return a row');

    await recordAuditLog(client, {
      actorUserId: userId,
      action: 'publication.status_changed',
      entityType: 'Publication',
      entityId: row.id,
      metadata: { from: current.status, to: toStatus },
    });

    return toPublication(row);
  });
}

// Drives a Publication through the mock/real ChannelConnector's
// publish() -- routes through a Channel Connector, never fakes an
// external send inline.
export async function publishViaConnector(
  database: DatabaseRuntime,
  connector: ChannelConnector,
  id: string,
): Promise<Publication> {
  const agencyId = getAgencyId();
  const publication = await getPublicationById(database, id);
  if (!publication.snapshot) {
    throw new ConflictError('Publication requires a snapshot before it can be published');
  }

  const publishing = await transitionPublicationStatus(database, id, PublicationStatus.PUBLISHING);
  try {
    const result = await connector.publish({
      agencyId,
      publicationId: id,
      channel: publishing.channel,
      snapshot: publishing.snapshot as Record<string, unknown>,
    });
    return transitionPublicationStatus(database, id, PublicationStatus.PUBLISHED, {
      externalPublicationId: result.externalPublicationId,
    });
  } catch (error) {
    await transitionPublicationStatus(database, id, PublicationStatus.FAILED);
    throw error;
  }
}

async function loadPublication(
  client: TenantTransactionClient,
  agencyId: string,
  id: string,
): Promise<Publication> {
  const result = await client.query<PublicationRow>(
    `SELECT ${COLUMNS} FROM publications WHERE agency_id = $1 AND id = $2`,
    [agencyId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Publication not found');
  return toPublication(row);
}

async function lockPublication(
  client: TenantTransactionClient,
  agencyId: string,
  id: string,
): Promise<Publication> {
  const result = await client.query<PublicationRow>(
    `SELECT ${COLUMNS} FROM publications WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
    [agencyId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Publication not found');
  return toPublication(row);
}

function validateCreatePublicationInput(data: CreatePublicationInput): void {
  if (typeof data.campaignId !== 'string' || data.campaignId.trim().length === 0) {
    throw new ValidationError('Field "campaignId" is required');
  }
  if (typeof data.offerId !== 'string' || data.offerId.trim().length === 0) {
    throw new ValidationError('Field "offerId" is required');
  }
  if (typeof data.channel !== 'string' || data.channel.trim().length === 0) {
    throw new ValidationError('Field "channel" is required');
  }
}

function toPublication(row: PublicationRow): Publication {
  return {
    id: row.id,
    agencyId: row.agency_id,
    campaignId: row.campaign_id,
    offerId: row.offer_id,
    channel: row.channel,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.creative_template_id !== null ? { creativeTemplateId: row.creative_template_id } : {}),
    ...(row.snapshot !== null ? { snapshot: row.snapshot } : {}),
    ...(row.snapshot_generated_at !== null
      ? { snapshotGeneratedAt: new Date(row.snapshot_generated_at) }
      : {}),
    ...(row.scheduled_at !== null ? { scheduledAt: new Date(row.scheduled_at) } : {}),
    ...(row.published_at !== null ? { publishedAt: new Date(row.published_at) } : {}),
    ...(row.external_publication_id !== null
      ? { externalPublicationId: row.external_publication_id }
      : {}),
    ...(row.created_by_user_id !== null ? { createdByUserId: row.created_by_user_id } : {}),
  };
}
