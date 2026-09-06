import { ValidationError } from './errors';

// Generic, domain-agnostic HTTP request body/param parsing helpers used
// across every route handler in app.ts. Extracted verbatim (no behavior
// change) as the first step of the app.ts decomposition documented in
// docs/refactoring/BATCH3B_EXTRACTION_PLAN.md -- every domain-specific
// parser depends on these, so they must be extracted first.

export function parseObjectBody(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('Request body must be an object');
  }
  return value as Record<string, unknown>;
}

export function assertAllowedFields(
  record: Record<string, unknown>,
  forbidden: readonly string[],
  allowed: readonly string[]
): void {
  for (const field of forbidden) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }
}

export function parseRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required and must be a non-empty string`);
  }
  return value;
}

export function requireStringField(body: unknown, field: string): string {
  const record = parseObjectBody(body);
  return parseRequiredString(record[field], field);
}

export function parseUuidParam(value: string, field: string): string {
  const trimmed = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    throw new ValidationError(`Param "${field}" must be a valid UUID`);
  }
  return trimmed;
}

export function parsePositiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`Field "${field}" must be a positive number`);
  }
  return value;
}

export function parseNonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ValidationError(`Field "${field}" must be a non-negative number`);
  }
  return value;
}

export function parseRequiredDate(value: unknown, field: string): Date {
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a date string`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Field "${field}" must be a valid date`);
  }
  return date;
}
