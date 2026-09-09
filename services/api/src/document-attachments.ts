/**
 * Customer 360 -- document attachment metadata.
 *
 * The database stores metadata only: no blobs, and no filesystem paths. Bytes
 * live in whatever object store the deployment configures, addressed
 * exclusively by a `secureFileKey` this module mints. The original filename is
 * retained for display and is never used to build a storage location, so a
 * caller cannot traverse or overwrite anything by naming a file `../../x`.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { DocumentAttachment } from '../../../packages/domain/types';
import {
  DocumentAttachmentType,
  DocumentAuditEventType,
} from '../../../packages/domain/types';
import { getAgencyId } from '../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from './database';
import { ValidationError } from './errors';
import { recordDocumentAuditEvent } from './document-audit';

/** Hard ceiling for a single attachment. Enforced here, not in the database. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/**
 * Allowlist, not a blocklist: anything absent is rejected. Scanned document
 * pages are images or PDFs; nothing else has a legitimate reason to be here.
 */
const ALLOWED_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff',
  'image/heic',
  'application/pdf',
];

/**
 * Extensions rejected outright regardless of the declared MIME type, since a
 * client controls both and can claim `image/png` for a `.exe`.
 */
const BLOCKED_EXTENSIONS: readonly string[] = [
  'exe', 'bat', 'cmd', 'com', 'sh', 'bash', 'ps1', 'psm1', 'msi', 'scr',
  'dll', 'so', 'dylib', 'jar', 'app', 'deb', 'rpm', 'vbs', 'js', 'mjs',
  'cjs', 'py', 'rb', 'php', 'pl', 'html', 'htm', 'svg', 'lnk', 'reg',
];

const ATTACHMENT_COLUMNS = `id, agency_id, document_id, attachment_type, file_name,
              file_size_bytes, file_mime_type, secure_file_key, file_hash,
              created_at, deleted_at`;

interface DocumentAttachmentRow {
  id: string;
  agency_id: string;
  document_id: string;
  attachment_type: DocumentAttachmentType;
  file_name: string;
  file_size_bytes: number;
  file_mime_type: string;
  secure_file_key: string;
  file_hash: string | null;
  created_at: string;
  deleted_at: string | null;
}

/** True when the MIME type is on the attachment allowlist. */
export function validateFileType(mimeType: string | null | undefined): boolean {
  if (typeof mimeType !== 'string') {
    return false;
  }
  // Strip any `; charset=` parameter before comparing.
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return ALLOWED_MIME_TYPES.includes(normalized);
}

/** True when the filename's extension is on the executable blocklist. */
export function isBlockedFileName(fileName: string | null | undefined): boolean {
  if (typeof fileName !== 'string') {
    return true;
  }

  const extension = fileName.split('.').pop()?.trim().toLowerCase() ?? '';
  if (extension.length === 0 || extension === fileName.trim().toLowerCase()) {
    // No extension at all -- refuse rather than guess.
    return true;
  }

  return BLOCKED_EXTENSIONS.includes(extension);
}

/** True when the byte count is within the per-attachment ceiling. */
export function validateFileSize(fileSizeBytes: number): boolean {
  return (
    Number.isInteger(fileSizeBytes) &&
    fileSizeBytes > 0 &&
    fileSizeBytes <= MAX_ATTACHMENT_BYTES
  );
}

/**
 * Mint an opaque storage key for a document attachment.
 *
 * The key is derived from a fresh UUID and the document id -- never from the
 * caller-supplied filename -- so it is unguessable, collision-free, and cannot
 * carry path separators. The original extension is appended (only after it has
 * passed the blocklist) purely so object stores serve a sensible content type.
 */
export function generateSecureFileKey(documentId: string, fileName: string): string {
  const safeDocumentId = documentId.replace(/[^A-Za-z0-9-]/g, '');
  const extension = fileName.split('.').pop()?.trim().toLowerCase() ?? '';
  const safeExtension = /^[a-z0-9]{1,8}$/.test(extension) ? `.${extension}` : '';

  return `documents/${safeDocumentId}/${randomUUID()}${safeExtension}`;
}

/** SHA-256 of the file's bytes, for integrity checks and duplicate detection. */
export function calculateFileHash(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

export interface CreateAttachmentOptions {
  fileHash?: string;
}

export async function createAttachment(
  database: DatabaseRuntime,
  documentId: string,
  attachmentType: DocumentAttachmentType,
  fileName: string,
  fileSizeBytes: number,
  fileMimeType: string,
  secureFileKey: string,
  options: CreateAttachmentOptions = {},
): Promise<DocumentAttachment> {
  const agencyId = getAgencyId();

  requireNonBlank(documentId, 'documentId');
  requireNonBlank(fileName, 'fileName');
  requireNonBlank(secureFileKey, 'secureFileKey');

  if (!Object.values(DocumentAttachmentType).includes(attachmentType)) {
    throw new ValidationError(
      `Field "attachmentType" must be one of: ${Object.values(DocumentAttachmentType).join(', ')}`,
    );
  }
  if (isBlockedFileName(fileName)) {
    throw new ValidationError('File type is not permitted');
  }
  if (!validateFileType(fileMimeType)) {
    throw new ValidationError(
      `Unsupported file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
    );
  }
  if (!validateFileSize(fileSizeBytes)) {
    throw new ValidationError(
      `File size must be between 1 byte and ${MAX_ATTACHMENT_BYTES} bytes`,
    );
  }

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentAttachmentRow>(
      `INSERT INTO document_attachments
         (agency_id, document_id, attachment_type, file_name, file_size_bytes,
          file_mime_type, secure_file_key, file_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${ATTACHMENT_COLUMNS}`,
      [
        agencyId,
        documentId,
        attachmentType,
        fileName,
        fileSizeBytes,
        fileMimeType,
        secureFileKey,
        options.fileHash ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Document attachment insert did not return a row');
    }

    const attachment = toDocumentAttachment(row);
    await recordDocumentAuditEvent(client, DocumentAuditEventType.ATTACHMENT_UPLOADED, {
      documentId,
      attachmentId: attachment.id,
      // The secure key is itself a capability to fetch the file: keep it out.
      metadata: {
        attachmentType: attachment.attachmentType,
        fileMimeType: attachment.fileMimeType,
        fileSizeBytes: attachment.fileSizeBytes,
      },
    });

    return attachment;
  });
}

export async function listAttachments(
  database: DatabaseRuntime,
  documentId: string,
): Promise<DocumentAttachment[]> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentAttachmentRow>(
      `SELECT ${ATTACHMENT_COLUMNS}
       FROM document_attachments
       WHERE agency_id = $1 AND document_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [agencyId, documentId],
    );

    return result.rows.map(toDocumentAttachment);
  });
}

export async function getAttachmentById(
  database: DatabaseRuntime,
  id: string,
): Promise<DocumentAttachment | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentAttachmentRow>(
      `SELECT ${ATTACHMENT_COLUMNS}
       FROM document_attachments
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [agencyId, id],
    );

    const row = result.rows[0];
    return row ? toDocumentAttachment(row) : null;
  });
}

/** Soft delete. The metadata row is retained for the audit trail. */
export async function deleteAttachment(
  database: DatabaseRuntime,
  id: string,
): Promise<DocumentAttachment | null> {
  const agencyId = getAgencyId();

  return database.withTenantTransaction(async (client) => {
    const result = await client.query<DocumentAttachmentRow>(
      `UPDATE document_attachments
       SET deleted_at = now()
       WHERE agency_id = $1 AND id = $2 AND deleted_at IS NULL
       RETURNING ${ATTACHMENT_COLUMNS}`,
      [agencyId, id],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const attachment = toDocumentAttachment(row);
    await recordDocumentAuditEvent(client, DocumentAuditEventType.ATTACHMENT_DELETED, {
      documentId: attachment.documentId,
      attachmentId: attachment.id,
    });

    return attachment;
  });
}

function requireNonBlank(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required and must be a non-empty string`);
  }
}

function toDocumentAttachment(row: DocumentAttachmentRow): DocumentAttachment {
  return {
    id: row.id,
    agencyId: row.agency_id,
    documentId: row.document_id,
    attachmentType: row.attachment_type,
    fileName: row.file_name,
    fileSizeBytes: Number(row.file_size_bytes),
    fileMimeType: row.file_mime_type,
    secureFileKey: row.secure_file_key,
    createdAt: new Date(row.created_at),
    ...(row.file_hash !== null ? { fileHash: row.file_hash } : {}),
    ...(row.deleted_at !== null ? { deletedAt: new Date(row.deleted_at) } : {}),
  };
}

export { ALLOWED_MIME_TYPES, BLOCKED_EXTENSIONS };
export type { DocumentAttachmentRow };
