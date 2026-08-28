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
