import {
  ExternalOfferCaptureStatus,
  type ExternalOfferCapture,
  type Offer,
} from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface CaptureRow {
  id: string;
  agency_id: string;
  source_url: string;
  source_name: string;
  captured_at: string;
  raw_content: string;
  normalized_title: string | null;
  normalized_description: string | null;
  found_price: string | null;
  currency: string | null;
  valid_until: string | null;
  status: ExternalOfferCaptureStatus;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  published_offer_id: string | null;
  created_at: string;
  updated_at: string;
}

interface OfferRow {
  id: string;
  agency_id: string;
  name: string;
  description: string | null;
  price: string;
  valid_from: string | null;
  valid_until: string | null;
  status: Offer['status'];
  created_at: string;
  updated_at: string;
}

export interface CreateExternalOfferCaptureInput {
  sourceUrl: string;
  sourceName: string;
  rawContent: string;
  normalizedTitle?: string;
  normalizedDescription?: string;
  foundPrice?: number;
  currency?: string;
  validUntil?: Date;
}

export interface PublishCaptureResult {
  capture: ExternalOfferCapture;
  offer: Offer;
}

export interface UpdateExternalOfferCaptureInput {
  normalizedTitle?: string;
  normalizedDescription?: string;
  foundPrice?: number;
  currency?: string;
  validUntil?: Date | null;
}

export interface ExtractedOfferDraft {
  sourceUrl: string;
  sourceName: string;
  rawContent: string;
  normalizedTitle?: string;
  normalizedDescription?: string;
  foundPrice?: number;
  currency?: string;
  fetchError?: string;
}

const EXTRACTION_TIMEOUT_MS = 8000;
const MAX_RAW_CONTENT_LENGTH = 20000;

/**
 * Actually performs an HTTP fetch of the given URL and extracts structured
 * offer data from whatever comes back (HTML meta tags / JSON-LD when
 * present, or a JSON body if the source returns JSON). This is a genuine
 * network call, not a fixture — a URL that does not resolve or that times
 * out returns a result with `fetchError` set and no fabricated fields, so
 * the reviewer sees an honest failure instead of a silently faked success.
 */
export async function extractOfferFromUrl(url: string): Promise<ExtractedOfferDraft> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError('Field "url" must be a valid absolute URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError('Field "url" must use http or https');
  }
  const sourceName = parsed.hostname.replace(/^www\./, '');

  let response: Response;
  let bodyText: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);
    try {
      response = await fetch(parsed.toString(), {
        signal: controller.signal,
        redirect: 'follow',
        headers: { Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
      });
    } finally {
      clearTimeout(timeout);
    }
    bodyText = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown fetch error';
    return {
      sourceUrl: parsed.toString(),
      sourceName,
      rawContent: JSON.stringify({ url: parsed.toString(), fetchError: message }),
      fetchError: `Não foi possível buscar a URL: ${message}`,
    };
  }

  const truncated = bodyText.slice(0, MAX_RAW_CONTENT_LENGTH);

  if (!response.ok) {
    return {
      sourceUrl: parsed.toString(),
      sourceName,
      rawContent: truncated,
      fetchError: `A origem retornou HTTP ${response.status}`,
    };
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return extractFromJson(parsed.toString(), sourceName, truncated);
  }
  return extractFromHtml(parsed.toString(), sourceName, truncated);
}

function extractFromJson(sourceUrl: string, sourceName: string, body: string): ExtractedOfferDraft {
  try {
    const data: unknown = JSON.parse(body);
    const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
    const title = firstString(record, ['title', 'name', 'offerName']);
    const description = firstString(record, ['description', 'summary']);
    const price = firstNumber(record, ['price', 'foundPrice', 'amount']);
    const currency = firstString(record, ['currency']) ?? 'BRL';
    return {
      sourceUrl,
      sourceName,
      rawContent: body,
      ...(title ? { normalizedTitle: title } : {}),
      ...(description ? { normalizedDescription: description } : {}),
      ...(price !== undefined ? { foundPrice: price } : {}),
      currency,
    };
  } catch {
    return {
      sourceUrl,
      sourceName,
      rawContent: body,
      fetchError: 'Resposta JSON inválida recebida da origem',
    };
  }
}

function extractFromHtml(sourceUrl: string, sourceName: string, html: string): ExtractedOfferDraft {
  const title =
    matchMetaContent(html, 'og:title') ??
    matchTag(html, 'title');
  const description = matchMetaContent(html, 'og:description') ?? matchMetaContent(html, 'description');
  const price = matchPrice(html);

  return {
    sourceUrl,
    sourceName,
    rawContent: html,
    ...(title ? { normalizedTitle: title.trim() } : {}),
    ...(description ? { normalizedDescription: description.trim() } : {}),
    ...(price !== undefined ? { foundPrice: price, currency: 'BRL' } : {}),
  };
}

function matchMetaContent(html: string, name: string): string | undefined {
  const regex = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`,
    'i',
  );
  const match = regex.exec(html);
  return match?.[1];
}

function matchTag(html: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
  const match = regex.exec(html);
  return match?.[1];
}

function matchPrice(html: string): number | undefined {
  const match = /R\$\s?([\d.,]+)/.exec(html);
  if (!match?.[1]) return undefined;
  const normalized = match[1].replace(/\./g, '').replace(',', '.');
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : undefined;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return undefined;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

const CAPTURE_COLUMNS = `id, agency_id, source_url, source_name, captured_at, raw_content,
  normalized_title, normalized_description, found_price, currency, valid_until, status,
  reviewed_at, reviewed_by_user_id, published_offer_id, created_at, updated_at`;

const OFFER_COLUMNS = `id, agency_id, name, description, price, valid_from, valid_until,
  status, created_at, updated_at`;

export async function listExternalOfferCaptures(
  database: DatabaseRuntime,
): Promise<ExternalOfferCapture[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CaptureRow>(
      `SELECT ${CAPTURE_COLUMNS}
       FROM external_offer_captures
       WHERE agency_id = $1
       ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toCapture);
  });
}

export async function createExternalOfferCapture(
  database: DatabaseRuntime,
  data: CreateExternalOfferCaptureInput,
): Promise<ExternalOfferCapture> {
  const agencyId = getAgencyId();
  validateCaptureInput(data);

  return database.withTenantTransaction(async (client) => {
    try {
      const result = await client.query<CaptureRow>(
        `INSERT INTO external_offer_captures
           (agency_id, source_url, source_name, raw_content, normalized_title,
            normalized_description, found_price, currency, valid_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${CAPTURE_COLUMNS}`,
        [
          agencyId,
          data.sourceUrl,
          data.sourceName,
          data.rawContent,
          data.normalizedTitle ?? null,
          data.normalizedDescription ?? null,
          data.foundPrice ?? null,
          data.currency ?? null,
          data.validUntil ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('ExternalOfferCapture insert did not return a row');
      return toCapture(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('An external offer capture already exists for this sourceUrl');
      }
      throw error;
    }
  });
}

const EDITABLE_STATUSES = [
  ExternalOfferCaptureStatus.CAPTURED,
  ExternalOfferCaptureStatus.NORMALIZED,
  ExternalOfferCaptureStatus.UNDER_REVIEW,
];

/**
 * Manual edit of a capture's normalized fields during the review stage --
 * lets a reviewer fix/complete data the automated extraction could not
 * find (or found incorrectly) before the capture is approved. Only allowed
 * while the capture has not yet been approved/published, since those
 * states represent a decision already made on the reviewed data.
 */
export async function updateExternalOfferCapture(
  database: DatabaseRuntime,
  id: string,
  patch: UpdateExternalOfferCaptureInput,
): Promise<ExternalOfferCapture> {
  const agencyId = getAgencyId();
  if (patch.foundPrice !== undefined && patch.foundPrice < 0) {
    throw new ValidationError('Field "foundPrice" must not be negative');
  }
  return database.withTenantTransaction(async (client) => {
    const current = await lockCapture(client, agencyId, id);
    if (!EDITABLE_STATUSES.includes(current.status)) {
      throw new ConflictError(`Capture in status ${current.status} can no longer be edited manually`);
    }
    const result = await client.query<CaptureRow>(
      `UPDATE external_offer_captures
       SET normalized_title = COALESCE($3, normalized_title),
           normalized_description = COALESCE($4, normalized_description),
           found_price = COALESCE($5, found_price),
           currency = COALESCE($6, currency),
           valid_until = CASE WHEN $8 THEN $7 ELSE valid_until END,
           updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${CAPTURE_COLUMNS}`,
      [
        agencyId,
        id,
        patch.normalizedTitle ?? null,
        patch.normalizedDescription ?? null,
        patch.foundPrice ?? null,
        patch.currency ?? null,
        patch.validUntil ?? null,
        patch.validUntil !== undefined,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Capture update did not return a row');
    return toCapture(row);
  });
}

export async function moveCaptureToReview(
  database: DatabaseRuntime,
  id: string,
  reviewedByUserId: string,
): Promise<ExternalOfferCapture> {
  return transitionCapture(database, id, reviewedByUserId, [ExternalOfferCaptureStatus.CAPTURED, ExternalOfferCaptureStatus.NORMALIZED], ExternalOfferCaptureStatus.UNDER_REVIEW);
}

export async function approveCapture(
  database: DatabaseRuntime,
  id: string,
  reviewedByUserId: string,
): Promise<ExternalOfferCapture> {
  return transitionCapture(database, id, reviewedByUserId, [ExternalOfferCaptureStatus.UNDER_REVIEW], ExternalOfferCaptureStatus.APPROVED);
}

export async function rejectCapture(
  database: DatabaseRuntime,
  id: string,
  reviewedByUserId: string,
): Promise<ExternalOfferCapture> {
  return transitionCapture(database, id, reviewedByUserId, [ExternalOfferCaptureStatus.CAPTURED, ExternalOfferCaptureStatus.NORMALIZED, ExternalOfferCaptureStatus.UNDER_REVIEW], ExternalOfferCaptureStatus.REJECTED);
}

export async function publishCapture(
  database: DatabaseRuntime,
  id: string,
  reviewedByUserId: string,
): Promise<PublishCaptureResult> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const capture = await lockCapture(client, agencyId, id);
    if (capture.status === ExternalOfferCaptureStatus.PUBLISHED) {
      if (!capture.publishedOfferId) {
        throw new ConflictError('Published capture has no offer reference');
      }
      const offer = await loadOffer(client, agencyId, capture.publishedOfferId);
      return { capture, offer };
    }
    if (capture.status !== ExternalOfferCaptureStatus.APPROVED) {
      throw new ConflictError('Only APPROVED captures can be published');
    }
    if (!capture.normalizedTitle) {
      throw new ValidationError('Capture requires normalizedTitle before publish');
    }
    if (capture.foundPrice === undefined) {
      throw new ValidationError('Capture requires foundPrice before publish');
    }

    const offerResult = await client.query<OfferRow>(
      `INSERT INTO offers (agency_id, name, description, price, valid_until)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${OFFER_COLUMNS}`,
      [
        agencyId,
        capture.normalizedTitle,
        capture.normalizedDescription ?? null,
        capture.foundPrice,
        capture.validUntil ?? null,
      ],
    );
    const offerRow = offerResult.rows[0];
    if (!offerRow) throw new Error('Offer insert did not return a row');

    const updated = await client.query<CaptureRow>(
      `UPDATE external_offer_captures
       SET status = 'PUBLISHED',
           reviewed_at = COALESCE(reviewed_at, now()),
           reviewed_by_user_id = COALESCE(reviewed_by_user_id, $3),
           published_offer_id = $4,
           updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${CAPTURE_COLUMNS}`,
      [agencyId, id, reviewedByUserId, offerRow.id],
    );
    const updatedRow = updated.rows[0];
    if (!updatedRow) throw new Error('Capture publish did not return a row');

    return { capture: toCapture(updatedRow), offer: toOffer(offerRow) };
  });
}

async function transitionCapture(
  database: DatabaseRuntime,
  id: string,
  reviewedByUserId: string,
  from: ExternalOfferCaptureStatus[],
  to: ExternalOfferCaptureStatus,
): Promise<ExternalOfferCapture> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const current = await lockCapture(client, agencyId, id);
    if (current.status === to) {
      return current;
    }
    if (!from.includes(current.status)) {
      throw new ConflictError(`Capture cannot transition from ${current.status} to ${to}`);
    }
    const result = await client.query<CaptureRow>(
      `UPDATE external_offer_captures
       SET status = $3,
           reviewed_at = now(),
           reviewed_by_user_id = $4,
           updated_at = now()
       WHERE agency_id = $1 AND id = $2
       RETURNING ${CAPTURE_COLUMNS}`,
      [agencyId, id, to, reviewedByUserId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Capture transition did not return a row');
    return toCapture(row);
  });
}

async function lockCapture(
  client: TenantTransactionClient,
  agencyId: string,
  id: string,
): Promise<ExternalOfferCapture> {
  const result = await client.query<CaptureRow>(
    `SELECT ${CAPTURE_COLUMNS}
     FROM external_offer_captures
     WHERE agency_id = $1 AND id = $2
     FOR UPDATE`,
    [agencyId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('External offer capture not found');
  return toCapture(row);
}

async function loadOffer(
  client: TenantTransactionClient,
  agencyId: string,
  id: string,
): Promise<Offer> {
  const result = await client.query<OfferRow>(
    `SELECT ${OFFER_COLUMNS} FROM offers WHERE agency_id = $1 AND id = $2`,
    [agencyId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Offer not found');
  return toOffer(row);
}

function validateCaptureInput(data: CreateExternalOfferCaptureInput): void {
  if (data.sourceUrl.trim().length === 0) {
    throw new ValidationError('Field "sourceUrl" is required and must be non-empty');
  }
  if (data.sourceName.trim().length === 0) {
    throw new ValidationError('Field "sourceName" is required and must be non-empty');
  }
  if (data.rawContent.trim().length === 0) {
    throw new ValidationError('Field "rawContent" is required and must be non-empty');
  }
  if (data.foundPrice !== undefined && data.foundPrice < 0) {
    throw new ValidationError('Field "foundPrice" must not be negative');
  }
}

function toCapture(row: CaptureRow): ExternalOfferCapture {
  return {
    id: row.id,
    agencyId: row.agency_id,
    sourceUrl: row.source_url,
    sourceName: row.source_name,
    capturedAt: new Date(row.captured_at),
    rawContent: row.raw_content,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.normalized_title !== null ? { normalizedTitle: row.normalized_title } : {}),
    ...(row.normalized_description !== null ? { normalizedDescription: row.normalized_description } : {}),
    ...(row.found_price !== null ? { foundPrice: Number(row.found_price) } : {}),
    ...(row.currency !== null ? { currency: row.currency } : {}),
    ...(row.valid_until !== null ? { validUntil: new Date(row.valid_until) } : {}),
    ...(row.reviewed_at !== null ? { reviewedAt: new Date(row.reviewed_at) } : {}),
    ...(row.reviewed_by_user_id !== null ? { reviewedByUserId: row.reviewed_by_user_id } : {}),
    ...(row.published_offer_id !== null ? { publishedOfferId: row.published_offer_id } : {}),
  };
}

function toOffer(row: OfferRow): Offer {
  return {
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    price: Number(row.price),
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.valid_from !== null ? { validFrom: new Date(row.valid_from) } : {}),
    ...(row.valid_until !== null ? { validUntil: new Date(row.valid_until) } : {}),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}
