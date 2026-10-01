/**
 * Input parsing helpers — allowlist style, mirroring
 * services/api/src/request-parsing.ts (no runtime schema library in this
 * codebase; validation is explicit per route).
 */
import { ValidationError } from './errors';

export function parseObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  return body as Record<string, unknown>;
}

export function requiredString(
  source: Record<string, unknown>,
  field: string,
  options: { max?: number; trim?: boolean } = {},
): string {
  const value = source[field];
  if (typeof value !== 'string') {
    throw new ValidationError(`Field ${field} is required and must be a string`);
  }
  const trimmed = options.trim === false ? value : value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`Field ${field} is required`);
  }
  if (options.max && trimmed.length > options.max) {
    throw new ValidationError(`Field ${field} must be at most ${options.max} characters`);
  }
  return trimmed;
}

export function optionalString(
  source: Record<string, unknown>,
  field: string,
  options: { max?: number; trim?: boolean } = {},
): string | null {
  const value = source[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new ValidationError(`Field ${field} must be a string`);
  }
  const trimmed = options.trim === false ? value : value.trim();
  if (trimmed.length === 0) return null;
  if (options.max && trimmed.length > options.max) {
    throw new ValidationError(`Field ${field} must be at most ${options.max} characters`);
  }
  return trimmed;
}

export function optionalEnum<T extends string>(
  source: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T | null {
  const value = optionalString(source, field);
  if (value === null) return null;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`Field ${field} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

export function requiredEnum<T extends string>(
  source: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T {
  const value = optionalEnum(source, field, allowed);
  if (value === null) {
    throw new ValidationError(`Field ${field} is required and must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

/** Positive money amount with at most 2 decimals. */
export function requiredAmount(source: Record<string, unknown>, field: string): number {
  const value = source[field];
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(num)) {
    throw new ValidationError(`Field ${field} must be a number`);
  }
  if (num < 0) {
    throw new ValidationError(`Field ${field} must not be negative`);
  }
  if (Math.round(num * 100) !== num * 100) {
    throw new ValidationError(`Field ${field} must have at most 2 decimal places`);
  }
  return num;
}

/** Strictly positive money amount with at most 2 decimals. */
export function requiredPositiveAmount(source: Record<string, unknown>, field: string): number {
  const num = requiredAmount(source, field);
  if (num === 0) {
    throw new ValidationError(`Field ${field} must be greater than zero`);
  }
  return num;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function requiredDate(source: Record<string, unknown>, field: string): string {
  const value = requiredString(source, field, { max: 10 });
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`Field ${field} must be a date in YYYY-MM-DD format`);
  }
  return value;
}

export function optionalDate(source: Record<string, unknown>, field: string): string | null {
  const value = optionalString(source, field, { max: 10 });
  if (value === null) return null;
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`Field ${field} must be a date in YYYY-MM-DD format`);
  }
  return value;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requiredUuid(source: Record<string, unknown>, field: string): string {
  const value = requiredString(source, field, { max: 36 });
  if (!UUID_RE.test(value)) {
    throw new ValidationError(`Field ${field} must be a valid UUID`);
  }
  return value;
}

export function optionalUuid(source: Record<string, unknown>, field: string): string | null {
  const value = optionalString(source, field, { max: 36 });
  if (value === null) return null;
  if (!UUID_RE.test(value)) {
    throw new ValidationError(`Field ${field} must be a valid UUID`);
  }
  return value;
}

export function optionalInteger(
  source: Record<string, unknown>,
  field: string,
  options: { min?: number; max?: number } = {},
): number | null {
  const value = source[field];
  if (value === undefined || value === null) return null;
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(num)) {
    throw new ValidationError(`Field ${field} must be an integer`);
  }
  if (options.min !== undefined && num < options.min) {
    throw new ValidationError(`Field ${field} must be at least ${options.min}`);
  }
  if (options.max !== undefined && num > options.max) {
    throw new ValidationError(`Field ${field} must be at most ${options.max}`);
  }
  return num;
}
