/**
 * Customer 360 -- PII masking utilities.
 *
 * Document numbers and CPFs are personally identifying. They must never reach
 * logs, audit metadata, or error messages in full. Every service in the
 * Customer 360 surface routes such values through the helpers below before
 * they are handed to a logger or persisted as audit metadata.
 */

import { DocumentType } from '../../../packages/domain/types';

/**
 * Field names whose values must be masked before being logged or stored as
 * audit metadata. Compared case-insensitively against both camelCase and
 * snake_case spellings.
 */
const MASKED_LOG_FIELDS: readonly string[] = [
  'cpf',
  'rg',
  'passport',
  'documentnumber',
  'document_number',
  'holderbirthdate',
  'holder_birth_date',
  'birthdate',
  'birth_date',
  'nationalid',
  'national_id',
  'securefilekey',
  'secure_file_key',
  'filehash',
  'file_hash',
  'password',
  'token',
];

/** Number of leading characters left visible by {@link maskDocumentNumber}. */
const DEFAULT_VISIBLE_PREFIX = 3;

/**
 * Mask a document number, leaving a short identifying prefix visible.
 *
 * CPF values are delegated to {@link maskCPF} so they keep their familiar
 * Brazilian formatting. Every other document type keeps its first three
 * characters (or more for long numbers such as passports) and has the
 * remainder replaced with `*`.
 *
 * Values short enough that a prefix would leak most of the number are masked
 * completely.
 */
export function maskDocumentNumber(
  documentNumber: string | null | undefined,
  docType?: DocumentType,
): string {
  if (documentNumber === null || documentNumber === undefined) {
    return '';
  }

  const value = documentNumber.trim();
  if (value.length === 0) {
    return '';
  }

  if (docType === DocumentType.CPF) {
    return maskCPF(value);
  }

  // Anything this short would be effectively readable with a prefix shown.
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }

  // Longer identifiers (passports, CNH) can afford a slightly larger prefix
  // while still hiding the majority of the number.
  const visible = value.length >= 10 ? DEFAULT_VISIBLE_PREFIX + 5 : DEFAULT_VISIBLE_PREFIX;
  const prefixLength = Math.min(visible, value.length - 1);

  return value.slice(0, prefixLength) + '*'.repeat(value.length - prefixLength);
}

/**
 * Mask a Brazilian CPF into the canonical `123.***.***-**` shape.
 *
 * Accepts both formatted (`123.456.789-09`) and bare (`12345678909`) input.
 * Anything that is not an 11-digit CPF is masked conservatively rather than
 * partially revealed.
 */
export function maskCPF(cpf: string | null | undefined): string {
  if (cpf === null || cpf === undefined) {
    return '';
  }

  const digits = cpf.replace(/\D/g, '');
  if (digits.length === 0) {
    return '';
  }

  if (digits.length !== 11) {
    // Not a well-formed CPF -- do not guess at which portion is safe.
    return '*'.repeat(digits.length);
  }

  return `${digits.slice(0, 3)}.***.***-**`;
}

/**
 * Whether a field name identifies a value that must be masked before it is
 * written to a log line or audit metadata payload.
 */
export function shouldMaskInLogs(field: string | null | undefined): boolean {
  if (field === null || field === undefined) {
    return false;
  }

  const normalized = field.trim().toLowerCase();
  if (normalized.length === 0) {
    return false;
  }

  return MASKED_LOG_FIELDS.includes(normalized);
}

/**
 * Produce a log/audit-safe shallow copy of an arbitrary payload, replacing the
 * value of every sensitive field with a masked placeholder.
 *
 * This is the single funnel every service uses when attaching contextual
 * metadata to an audit event, so a newly added sensitive field only has to be
 * declared once in {@link MASKED_LOG_FIELDS}.
 */
export function maskSensitiveFields(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (payload === null || payload === undefined) {
    return {};
  }

  const masked: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (!shouldMaskInLogs(key)) {
      masked[key] = value;
      continue;
    }

    if (typeof value === 'string') {
      masked[key] = key.trim().toLowerCase() === 'cpf' ? maskCPF(value) : maskDocumentNumber(value);
      continue;
    }

    if (value === null || value === undefined) {
      masked[key] = null;
      continue;
    }

    masked[key] = '***';
  }

  return masked;
}
