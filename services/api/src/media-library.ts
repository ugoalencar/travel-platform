// Media Library -- central, agency-owned asset library. See
// docs/product/MEDIA_LIBRARY.md and docs/product/MEDIA_ASSET_MODEL.md.
//
// Corrects Proposal Visual 2.0's proposal_media (per-proposal-only
// upload): media now belongs to the agency, referenced (not
// duplicated) by Offer/Proposal/Communication via media_asset_links.
// Reuses the existing secure_file_key + file-storage.ts contract --
// no new storage abstraction.
import { randomUUID } from 'node:crypto';
import { MediaAssetUsageContext, MediaAssetUsageKind } from '../../../packages/domain/types';
import type {
  MediaAsset,
  MediaAssetLink,
  MediaAssetSource,
  MediaAssetStatus,
  MediaAssetType,
} from '../../../packages/domain/types';
import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import {
  MAX_ATTACHMENT_BYTES,
  isBlockedFileName,
  validateFileSize,
  validateFileType,
} from './document-attachments';
import { assertProposalContentEditable } from './proposals';

const ALLOWED_MEDIA_MIME_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export function validateMediaAssetFileType(mimeType: string | null | undefined): boolean {
  if (typeof mimeType !== 'string') return false;
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return ALLOWED_MEDIA_MIME_TYPES.includes(normalized);
}

export function generateMediaAssetSecureFileKey(agencyId: string, fileName: string): string {
  const safeAgencyId = agencyId.replace(/[^A-Za-z0-9-]/g, '');
  const extension = fileName.split('.').pop()?.trim().toLowerCase() ?? '';
  const safeExtension = /^[a-z0-9]{1,8}$/.test(extension) ? `.${extension}` : '';
  return `media-assets/${safeAgencyId}/${randomUUID()}${safeExtension}`;
}

// ============================================================
// MediaAsset
// ============================================================

interface MediaAssetRow {
  id: string;
  agency_id: string;
  title: string;
  description: string | null;
  asset_type: MediaAssetType;
  mime_type: string;
  file_size_bytes: string;
  secure_file_key: string;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  tags: string[];
  status: MediaAssetStatus;
  source: MediaAssetSource;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

const ASSET_COLUMNS = `id, agency_id, title, description, asset_type, mime_type, file_size_bytes,
  secure_file_key, width, height, alt_text, tags, status, source, created_by, created_at,
  updated_at, archived_at`;

export interface CreateMediaAssetInput {
  title: string;
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number;
  secureFileKey: string;
  description?: string;
  altText?: string;
  tags?: string[];
  width?: number;
  height?: number;
}

export async function createMediaAsset(
  database: DatabaseRuntime,
  data: CreateMediaAssetInput,
): Promise<MediaAsset> {
  const agencyId = getAgencyId();
  const userId = getUserId();

  if (!data.title || data.title.trim().length === 0) {
    throw new ValidationError('Field "title" is required');
  }
  if (isBlockedFileName(data.fileName)) {
    throw new ValidationError('File type is not permitted');
  }
  if (!validateMediaAssetFileType(data.fileMimeType) || !validateFileType(data.fileMimeType)) {
    throw new ValidationError(`Unsupported file type. Allowed types: ${ALLOWED_MEDIA_MIME_TYPES.join(', ')}`);
  }
  if (!validateFileSize(data.fileSizeBytes)) {
    throw new ValidationError(`File size must be between 1 byte and ${MAX_ATTACHMENT_BYTES} bytes`);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<MediaAssetRow>(
      `INSERT INTO media_assets
         (agency_id, title, description, asset_type, mime_type, file_size_bytes, secure_file_key,
          width, height, alt_text, tags, created_by)
       VALUES ($1, $2, $3, 'IMAGE', $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${ASSET_COLUMNS}`,
      [
        agencyId,
        data.title.trim(),
        data.description ?? null,
        data.fileMimeType,
        data.fileSizeBytes,
        data.secureFileKey,
        data.width ?? null,
        data.height ?? null,
        data.altText ?? null,
        data.tags ?? [],
        userId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('MediaAsset insert did not return a row');
    return toAsset(row);
  });
}

export interface ListMediaAssetsFilters {
  search?: string;
  tag?: string;
  status?: MediaAssetStatus;
}

export async function listMediaAssets(
  database: DatabaseRuntime,
  filters: ListMediaAssetsFilters = {},
): Promise<MediaAsset[]> {
  const agencyId = getAgencyId();
  const conditions: string[] = ['agency_id = $1'];
  const values: unknown[] = [agencyId];

  if (filters.status !== undefined) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  } else {
    conditions.push(`status = 'ACTIVE'`);
  }
  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`title ILIKE $${values.length}`);
  }
  if (filters.tag) {
    values.push(filters.tag);
    conditions.push(`$${values.length} = ANY(tags)`);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<MediaAssetRow>(
      `SELECT ${ASSET_COLUMNS} FROM media_assets
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC LIMIT 200`,
      values,
    );
    return result.rows.map(toAsset);
  });
}

export async function getMediaAssetById(database: DatabaseRuntime, id: string): Promise<MediaAsset | null> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<MediaAssetRow>(
      `SELECT ${ASSET_COLUMNS} FROM media_assets WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toAsset(row) : null;
  });
}

export interface UpdateMediaAssetInput {
  title?: string;
  description?: string;
  altText?: string;
  tags?: string[];
}

export async function updateMediaAsset(
  database: DatabaseRuntime,
  id: string,
  data: UpdateMediaAssetInput,
): Promise<MediaAsset | null> {
  const agencyId = getAgencyId();

  const fields: string[] = [];
  const values: unknown[] = [];
  let index = 1;
  if (data.title !== undefined) {
    if (data.title.trim().length === 0) throw new ValidationError('Field "title" must not be blank');
    fields.push(`title = $${++index}`);
    values.push(data.title);
  }
  if (data.description !== undefined) {
    fields.push(`description = $${++index}`);
    values.push(data.description);
  }
  if (data.altText !== undefined) {
    fields.push(`alt_text = $${++index}`);
    values.push(data.altText);
  }
  if (data.tags !== undefined) {
    fields.push(`tags = $${++index}`);
    values.push(data.tags);
  }
  if (fields.length === 0) {
    return getMediaAssetById(database, id);
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<MediaAssetRow>(
      `UPDATE media_assets SET ${fields.join(', ')}, updated_at = now()
       WHERE agency_id = $1 AND id = $${index + 1}
       RETURNING ${ASSET_COLUMNS}`,
      [agencyId, ...values, id],
    );
    const row = result.rows[0];
    return row ? toAsset(row) : null;
  });
}

export async function archiveMediaAsset(database: DatabaseRuntime, id: string): Promise<MediaAsset | null> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<MediaAssetRow>(
      `UPDATE media_assets SET status = 'ARCHIVED', archived_at = now(), updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${ASSET_COLUMNS}`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toAsset(row) : null;
  });
}

// Delete is only allowed when the asset has no links -- an asset in
// use must be archived instead (Fase 12). Returns false if the asset
// doesn't exist, throws ConflictError if it's in use.
export async function deleteMediaAsset(database: DatabaseRuntime, id: string): Promise<boolean> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const usage = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM media_asset_links WHERE agency_id = $1 AND media_asset_id = $2`,
      [agencyId, id],
    );
    if (Number(usage.rows[0]?.count ?? '0') > 0) {
      throw new ConflictError('Media asset is in use and cannot be deleted -- archive it instead');
    }
    const result = await client.query(`DELETE FROM media_assets WHERE agency_id = $1 AND id = $2`, [
      agencyId,
      id,
    ]);
    return (result.rowCount ?? 0) > 0;
  });
}

export interface MediaAssetUsageSummary {
  entityType: MediaAssetUsageContext;
  count: number;
}

export async function getMediaAssetUsage(
  database: DatabaseRuntime,
  mediaAssetId: string,
): Promise<MediaAssetUsageSummary[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{ entity_type: MediaAssetUsageContext; count: string }>(
      `SELECT entity_type, count(*)::text AS count FROM media_asset_links
       WHERE agency_id = $1 AND media_asset_id = $2
       GROUP BY entity_type`,
      [agencyId, mediaAssetId],
    );
    return result.rows.map((row) => ({ entityType: row.entity_type, count: Number(row.count) }));
  });
}

function toAsset(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    agencyId: row.agency_id,
    title: row.title,
    assetType: row.asset_type,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    secureFileKey: row.secure_file_key,
    tags: row.tags,
    status: row.status,
    source: row.source,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.width !== null ? { width: row.width } : {}),
    ...(row.height !== null ? { height: row.height } : {}),
    ...(row.alt_text !== null ? { altText: row.alt_text } : {}),
    ...(row.created_by !== null ? { createdBy: row.created_by } : {}),
    ...(row.archived_at !== null ? { archivedAt: new Date(row.archived_at) } : {}),
  };
}

// ============================================================
// MediaAssetLink -- ownership validation per entity type
// ============================================================

async function assertEntityOwnedByTenant(
  client: TenantTransactionClient,
  agencyId: string,
  entityType: MediaAssetUsageContext,
  entityId: string,
): Promise<void> {
  const table =
    entityType === MediaAssetUsageContext.OFFER
      ? 'offers'
      : entityType === MediaAssetUsageContext.PROPOSAL
        ? 'proposals'
        : 'agency_communications';
  const result = await client.query(`SELECT 1 FROM ${table} WHERE agency_id = $1 AND id = $2`, [
    agencyId,
    entityId,
  ]);
  if (result.rowCount === 0) {
    throw new NotFoundError(`${entityType} not found`);
  }
  if (entityType === MediaAssetUsageContext.PROPOSAL) {
    const status = await client.query<{ status: string }>(`SELECT status FROM proposals WHERE agency_id = $1 AND id = $2`, [
      agencyId,
      entityId,
    ]);
    const currentStatus = status.rows[0]?.status;
    if (currentStatus !== undefined) {
      assertProposalContentEditable(currentStatus as never);
    }
  }
}

interface MediaAssetLinkRow {
  id: string;
  agency_id: string;
  media_asset_id: string;
  entity_type: MediaAssetUsageContext;
  entity_id: string;
  usage: MediaAssetUsageKind;
  sort_order: number;
  created_at: string;
}

const LINK_COLUMNS = `id, agency_id, media_asset_id, entity_type, entity_id, usage, sort_order, created_at`;

export interface LinkMediaAssetInput {
  mediaAssetId: string;
  entityType: MediaAssetUsageContext;
  entityId: string;
  usage?: MediaAssetUsageKind;
  sortOrder?: number;
}

// Links an existing asset to an entity. If usage is COVER, any
// previous COVER link for the same entity is replaced (an entity has
// at most one cover) -- enforced here in application code, not via a
// DB constraint, to keep "change the cover" a simple two-statement
// operation.
export async function linkMediaAsset(database: DatabaseRuntime, data: LinkMediaAssetInput): Promise<MediaAssetLink> {
  const agencyId = getAgencyId();
  const usage = data.usage ?? MediaAssetUsageKind.GALLERY;

  return database.withTenantTransaction(async (client) => {
    await assertEntityOwnedByTenant(client, agencyId, data.entityType, data.entityId);

    const asset = await client.query(`SELECT 1 FROM media_assets WHERE agency_id = $1 AND id = $2`, [
      agencyId,
      data.mediaAssetId,
    ]);
    if (asset.rowCount === 0) {
      throw new NotFoundError('Media asset not found');
    }

    if (usage === MediaAssetUsageKind.COVER) {
      await client.query(
        `DELETE FROM media_asset_links
         WHERE agency_id = $1 AND entity_type = $2 AND entity_id = $3 AND usage = 'COVER'`,
        [agencyId, data.entityType, data.entityId],
      );
    }

    let sortOrder = data.sortOrder;
    if (sortOrder === undefined) {
      const next = await client.query<{ next: number }>(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM media_asset_links
         WHERE agency_id = $1 AND entity_type = $2 AND entity_id = $3`,
        [agencyId, data.entityType, data.entityId],
      );
      sortOrder = next.rows[0]?.next ?? 0;
    }

    const result = await client.query<MediaAssetLinkRow>(
      `INSERT INTO media_asset_links (agency_id, media_asset_id, entity_type, entity_id, usage, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (agency_id, entity_type, entity_id, media_asset_id, usage)
       DO UPDATE SET sort_order = EXCLUDED.sort_order
       RETURNING ${LINK_COLUMNS}`,
      [agencyId, data.mediaAssetId, data.entityType, data.entityId, usage, sortOrder],
    );
    const row = result.rows[0];
    if (!row) throw new Error('MediaAssetLink insert did not return a row');
    return toLink(row);
  });
}

export async function unlinkMediaAsset(database: DatabaseRuntime, linkId: string): Promise<boolean> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const existing = await client.query<{ entity_type: MediaAssetUsageContext; entity_id: string }>(
      `SELECT entity_type, entity_id FROM media_asset_links WHERE agency_id = $1 AND id = $2`,
      [agencyId, linkId],
    );
    const row = existing.rows[0];
    if (!row) return false;
    await assertEntityOwnedByTenant(client, agencyId, row.entity_type, row.entity_id);

    const result = await client.query(`DELETE FROM media_asset_links WHERE agency_id = $1 AND id = $2`, [
      agencyId,
      linkId,
    ]);
    return (result.rowCount ?? 0) > 0;
  });
}

export interface EntityMediaItem {
  linkId: string;
  mediaAssetId: string;
  title: string;
  altText?: string;
  usage: MediaAssetUsageKind;
  sortOrder: number;
  mimeType: string;
  fileSizeBytes: number;
}

export async function listEntityMedia(
  database: DatabaseRuntime,
  entityType: MediaAssetUsageContext,
  entityId: string,
): Promise<EntityMediaItem[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<{
      link_id: string;
      media_asset_id: string;
      title: string;
      alt_text: string | null;
      usage: MediaAssetUsageKind;
      sort_order: number;
      mime_type: string;
      file_size_bytes: string;
    }>(
      `SELECT l.id AS link_id, l.media_asset_id, a.title, a.alt_text, l.usage, l.sort_order,
              a.mime_type, a.file_size_bytes
       FROM media_asset_links l
       JOIN media_assets a ON a.agency_id = l.agency_id AND a.id = l.media_asset_id
       WHERE l.agency_id = $1 AND l.entity_type = $2 AND l.entity_id = $3
       ORDER BY l.usage DESC, l.sort_order ASC, l.created_at ASC`,
      [agencyId, entityType, entityId],
    );
    return result.rows.map((row) => ({
      linkId: row.link_id,
      mediaAssetId: row.media_asset_id,
      title: row.title,
      usage: row.usage,
      sortOrder: row.sort_order,
      mimeType: row.mime_type,
      fileSizeBytes: Number(row.file_size_bytes),
      ...(row.alt_text !== null ? { altText: row.alt_text } : {}),
    }));
  });
}

// Used by customer-facing download routes: confirms a media asset is
// actually linked to the given entity before streaming it, so a
// customer can never fetch an arbitrary asset id from the same tenant
// just because they know it exists -- only assets actually attached to
// something they're allowed to view (their own Proposal, a visible
// Offer/Communication) are ever served.
export async function isMediaAssetLinkedToEntity(
  database: DatabaseRuntime,
  mediaAssetId: string,
  entityType: MediaAssetUsageContext,
  entityId: string,
): Promise<boolean> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query(
      `SELECT 1 FROM media_asset_links
       WHERE agency_id = $1 AND media_asset_id = $2 AND entity_type = $3 AND entity_id = $4`,
      [agencyId, mediaAssetId, entityType, entityId],
    );
    return (result.rowCount ?? 0) > 0;
  });
}

function toLink(row: MediaAssetLinkRow): MediaAssetLink {
  return {
    id: row.id,
    agencyId: row.agency_id,
    mediaAssetId: row.media_asset_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    usage: row.usage,
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at),
  };
}
