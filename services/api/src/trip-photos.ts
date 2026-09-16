/**
 * Trip photo gallery -- metadata only, same object-store contract as
 * document-attachments.ts (bytes live under a server-minted
 * secure_file_key, saved/read via file-storage.ts). Staff upload photos
 * onto a trip; the customer portal renders them as a carousel on that
 * trip's page. See migration 074 for the schema/RLS.
 */

import { randomUUID } from 'node:crypto';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';
import { validateFileSize, validateFileType, isBlockedFileName, MAX_ATTACHMENT_BYTES } from './document-attachments';

export interface TripPhoto {
  id: string;
  agencyId: string;
  tripId: string;
  secureFileKey: string;
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number;
  caption?: string;
  sortOrder: number;
  createdAt: Date;
}

interface TripPhotoRow {
  id: string;
  agency_id: string;
  trip_id: string;
  secure_file_key: string;
  file_name: string;
  file_mime_type: string;
  file_size_bytes: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

const TRIP_PHOTO_COLUMNS = `id, agency_id, trip_id, secure_file_key, file_name, file_mime_type,
  file_size_bytes, caption, sort_order, created_at`;

/** Only real photo formats -- unlike document attachments, PDFs make no sense in a photo carousel. */
const ALLOWED_PHOTO_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];

export function validatePhotoFileType(mimeType: string | null | undefined): boolean {
  if (typeof mimeType !== 'string') return false;
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return ALLOWED_PHOTO_MIME_TYPES.includes(normalized);
}

export function generateTripPhotoSecureFileKey(tripId: string, fileName: string): string {
  const safeTripId = tripId.replace(/[^A-Za-z0-9-]/g, '');
  const extension = fileName.split('.').pop()?.trim().toLowerCase() ?? '';
  const safeExtension = /^[a-z0-9]{1,8}$/.test(extension) ? `.${extension}` : '';
  return `trip-photos/${safeTripId}/${randomUUID()}${safeExtension}`;
}

export interface CreateTripPhotoInput {
  tripId: string;
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number;
  secureFileKey: string;
  caption?: string;
}

export async function createTripPhoto(
  database: DatabaseRuntime,
  data: CreateTripPhotoInput,
): Promise<TripPhoto> {
  const agencyId = getAgencyId();

  if (isBlockedFileName(data.fileName)) {
    throw new ValidationError('File type is not permitted');
  }
  if (!validatePhotoFileType(data.fileMimeType) || !validateFileType(data.fileMimeType)) {
    throw new ValidationError(`Unsupported file type. Allowed types: ${ALLOWED_PHOTO_MIME_TYPES.join(', ')}`);
  }
  if (!validateFileSize(data.fileSizeBytes)) {
    throw new ValidationError(`File size must be between 1 byte and ${MAX_ATTACHMENT_BYTES} bytes`);
  }

  return database.withTenantTransaction(async (client) => {
    const nextOrder = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM trip_photos
       WHERE agency_id = $1 AND trip_id = $2 AND deleted_at IS NULL`,
      [agencyId, data.tripId],
    );
    const sortOrder = nextOrder.rows[0]?.next ?? 0;

    const result = await client.query<TripPhotoRow>(
      `INSERT INTO trip_photos
         (agency_id, trip_id, secure_file_key, file_name, file_mime_type, file_size_bytes, caption, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${TRIP_PHOTO_COLUMNS}`,
      [
        agencyId,
        data.tripId,
        data.secureFileKey,
        data.fileName,
        data.fileMimeType,
        data.fileSizeBytes,
        data.caption ?? null,
        sortOrder,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('TripPhoto insert did not return a row');
    return toTripPhoto(row);
  });
}

export async function listTripPhotos(database: DatabaseRuntime, tripId: string): Promise<TripPhoto[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TripPhotoRow>(
      `SELECT ${TRIP_PHOTO_COLUMNS} FROM trip_photos
       WHERE agency_id = $1 AND trip_id = $2 AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC`,
      [agencyId, tripId],
    );
    return result.rows.map(toTripPhoto);
  });
}

export async function getTripPhotoById(database: DatabaseRuntime, id: string): Promise<TripPhoto | null> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TripPhotoRow>(
      `SELECT ${TRIP_PHOTO_COLUMNS} FROM trip_photos
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toTripPhoto(row) : null;
  });
}

export async function deleteTripPhoto(database: DatabaseRuntime, id: string): Promise<TripPhoto | null> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<TripPhotoRow>(
      `UPDATE trip_photos SET deleted_at = now()
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING ${TRIP_PHOTO_COLUMNS}`,
      [agencyId, id],
    );
    const row = result.rows[0];
    return row ? toTripPhoto(row) : null;
  });
}

function toTripPhoto(row: TripPhotoRow): TripPhoto {
  return {
    id: row.id,
    agencyId: row.agency_id,
    tripId: row.trip_id,
    secureFileKey: row.secure_file_key,
    fileName: row.file_name,
    fileMimeType: row.file_mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at),
    ...(row.caption !== null ? { caption: row.caption } : {}),
  };
}
