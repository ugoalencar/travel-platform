import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import { AssetSourceType, AssetType } from '../../../packages/domain/types';
import type { Asset } from '../../../packages/domain/types';
import type { DatabaseRuntime } from './database';
import { NotFoundError, ValidationError } from './errors';
import { recordAuditLog } from './offer-growth-audit';

// SSRF mitigation (docs/offer-growth/security.md): this module NEVER
// fetches sourceOriginalUrl/storageUrl itself. Assets are created from a
// URL string the caller supplies (or that pescador.ts already captured
// server-side); the API only validates the URL's *shape* here -- it
// never performs a synchronous outbound fetch of a user/agency-supplied
// URL as part of asset creation. Allowed schemes are restricted to
// http/https, and common SSRF targets (localhost, loopback, link-local,
// and RFC1918 private ranges given as literal hostnames) are rejected up
// front. This is allowlist-shaped validation, not a full SSRF-proof
// resolver (a real implementation would also need to resolve DNS and
// reject on the resolved IP at fetch time if a fetch is ever added) --
// documented here because no fetch is performed at all in this batch.
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
]);

const PRIVATE_HOST_PATTERNS = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
];

interface AssetRow {
  id: string;
  agency_id: string;
  type: AssetType;
  source: AssetSourceType;
  source_connector: string | null;
  source_supplier: string | null;
  source_original_url: string | null;
  source_license: string | null;
  source_author: string | null;
  source_dedupe_hash: string | null;
  source_usage_restrictions: string | null;
  source_capture_id: string | null;
  meta_width: number | null;
  meta_height: number | null;
  meta_duration_seconds: string | null;
  meta_mime_type: string | null;
  meta_size_bytes: string | null;
  meta_language: string | null;
  meta_tags: string[];
  meta_safe_area: unknown;
  meta_variants: unknown[];
  storage_url: string | null;
  local_reference: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAssetInput {
  type: AssetType;
  source: AssetSourceType;
  storageUrl?: string;
  localReference?: string;
  sourceConnector?: string;
  sourceSupplier?: string;
  sourceOriginalUrl?: string;
  sourceLicense?: string;
  sourceAuthor?: string;
  sourceDedupeHash?: string;
  sourceUsageRestrictions?: string;
  sourceCaptureId?: string;
  metaWidth?: number;
  metaHeight?: number;
  metaDurationSeconds?: number;
  metaMimeType?: string;
  metaSizeBytes?: number;
  metaLanguage?: string;
  metaTags?: string[];
  metaSafeArea?: unknown;
  metaVariants?: unknown[];
}

const COLUMNS = `id, agency_id, type, source, source_connector, source_supplier, source_original_url,
  source_license, source_author, source_dedupe_hash, source_usage_restrictions, source_capture_id,
  meta_width, meta_height, meta_duration_seconds, meta_mime_type, meta_size_bytes, meta_language,
  meta_tags, meta_safe_area, meta_variants, storage_url, local_reference, created_by_user_id,
  created_at, updated_at`;

export async function listAssets(database: DatabaseRuntime): Promise<Asset[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<AssetRow>(
      `SELECT ${COLUMNS} FROM assets WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toAsset);
  });
}

export async function createAsset(database: DatabaseRuntime, data: CreateAssetInput): Promise<Asset> {
  const agencyId = getAgencyId();
  const userId = getUserId();
  validateCreateAssetInput(data);

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<AssetRow>(
      `INSERT INTO assets
         (agency_id, type, source, source_connector, source_supplier, source_original_url, source_license,
          source_author, source_dedupe_hash, source_usage_restrictions, source_capture_id, meta_width,
          meta_height, meta_duration_seconds, meta_mime_type, meta_size_bytes, meta_language, meta_tags,
          meta_safe_area, meta_variants, storage_url, local_reference, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
       RETURNING ${COLUMNS}`,
      [
        agencyId,
        data.type,
        data.source,
        data.sourceConnector ?? null,
        data.sourceSupplier ?? null,
        data.sourceOriginalUrl ?? null,
        data.sourceLicense ?? null,
        data.sourceAuthor ?? null,
        data.sourceDedupeHash ?? null,
        data.sourceUsageRestrictions ?? null,
        data.sourceCaptureId ?? null,
        data.metaWidth ?? null,
        data.metaHeight ?? null,
        data.metaDurationSeconds ?? null,
        data.metaMimeType ?? null,
        data.metaSizeBytes ?? null,
        data.metaLanguage ?? null,
        JSON.stringify(data.metaTags ?? []),
        data.metaSafeArea !== undefined ? JSON.stringify(data.metaSafeArea) : null,
        JSON.stringify(data.metaVariants ?? []),
        data.storageUrl ?? null,
        data.localReference ?? null,
        userId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Asset insert did not return a row');

    await recordAuditLog(client, {
      actorUserId: userId,
      action: 'asset.created',
      entityType: 'Asset',
      entityId: row.id,
      metadata: { type: row.type, source: row.source },
    });

    return toAsset(row);
  });
}

// Wires a Pescador capture's raw image URL into a real Asset row with
// source=PESCADOR and provenance preserved (sourceCaptureId + the
// original URL), used by pescador.ts when a capture is approved/
// published. Same SSRF-safe path: no synchronous fetch of the URL.
export async function createAssetFromPescadorCapture(
  database: DatabaseRuntime,
  captureId: string,
  originalUrl: string,
  extra: Partial<CreateAssetInput> = {},
): Promise<Asset> {
  return createAsset(database, {
    type: extra.type ?? AssetType.IMAGE,
    source: AssetSourceType.PESCADOR,
    sourceCaptureId: captureId,
    sourceOriginalUrl: originalUrl,
    storageUrl: originalUrl,
    ...extra,
  });
}

export async function getAssetById(database: DatabaseRuntime, id: string): Promise<Asset> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<AssetRow>(
      `SELECT ${COLUMNS} FROM assets WHERE agency_id = $1 AND id = $2`,
      [agencyId, id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundError('Asset not found');
    return toAsset(row);
  });
}

export function validateAssetUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError('Field "storageUrl"/"sourceOriginalUrl" must be a valid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError('Asset URL must use http or https');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new ValidationError('Asset URL host is not allowed');
  }
}

function validateCreateAssetInput(data: CreateAssetInput): void {
  if (!Object.values(AssetType).includes(data.type)) {
    throw new ValidationError('Field "type" must be a valid AssetType');
  }
  if (!Object.values(AssetSourceType).includes(data.source)) {
    throw new ValidationError('Field "source" must be a valid AssetSourceType');
  }
  if (!data.storageUrl && !data.localReference) {
    throw new ValidationError('Asset requires storageUrl or localReference');
  }
  if (data.source === AssetSourceType.PESCADOR && !data.sourceCaptureId) {
    throw new ValidationError('Assets with source=PESCADOR require sourceCaptureId');
  }
  if (data.storageUrl) {
    validateAssetUrl(data.storageUrl);
  }
  if (data.sourceOriginalUrl) {
    validateAssetUrl(data.sourceOriginalUrl);
  }
}

function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    agencyId: row.agency_id,
    type: row.type,
    source: row.source,
    metaTags: row.meta_tags ?? [],
    metaVariants: row.meta_variants ?? [],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.source_connector !== null ? { sourceConnector: row.source_connector } : {}),
    ...(row.source_supplier !== null ? { sourceSupplier: row.source_supplier } : {}),
    ...(row.source_original_url !== null ? { sourceOriginalUrl: row.source_original_url } : {}),
    ...(row.source_license !== null ? { sourceLicense: row.source_license } : {}),
    ...(row.source_author !== null ? { sourceAuthor: row.source_author } : {}),
    ...(row.source_dedupe_hash !== null ? { sourceDedupeHash: row.source_dedupe_hash } : {}),
    ...(row.source_usage_restrictions !== null
      ? { sourceUsageRestrictions: row.source_usage_restrictions }
      : {}),
    ...(row.source_capture_id !== null ? { sourceCaptureId: row.source_capture_id } : {}),
    ...(row.meta_width !== null ? { metaWidth: row.meta_width } : {}),
    ...(row.meta_height !== null ? { metaHeight: row.meta_height } : {}),
    ...(row.meta_duration_seconds !== null
      ? { metaDurationSeconds: Number(row.meta_duration_seconds) }
      : {}),
    ...(row.meta_mime_type !== null ? { metaMimeType: row.meta_mime_type } : {}),
    ...(row.meta_size_bytes !== null ? { metaSizeBytes: Number(row.meta_size_bytes) } : {}),
    ...(row.meta_language !== null ? { metaLanguage: row.meta_language } : {}),
    ...(row.meta_safe_area !== null ? { metaSafeArea: row.meta_safe_area } : {}),
    ...(row.storage_url !== null ? { storageUrl: row.storage_url } : {}),
    ...(row.local_reference !== null ? { localReference: row.local_reference } : {}),
    ...(row.created_by_user_id !== null ? { createdByUserId: row.created_by_user_id } : {}),
  };
}
