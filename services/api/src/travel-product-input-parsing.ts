import { TravelProductCategory } from '../../../packages/domain/types';
import { ValidationError } from './errors';
import type { CreateTravelProductInput, UpdateTravelProductInput } from './travel-products';

const CATEGORY_VALUES = Object.values(TravelProductCategory) as readonly string[];

const FORBIDDEN_FIELDS = ['agencyId', 'tenantId', 'id', 'createdAt', 'updatedAt'] as const;

const ALLOWED_FIELDS = [
  'category',
  'supplierId',
  'partnerId',
  'title',
  'description',
  'destination',
  'durationText',
  'rules',
  'inclusions',
  'exclusions',
  'minAge',
  'maxAge',
  'capacity',
  'bookingDeadlineDays',
  'cancellationPolicy',
  'cost',
  'price',
  'currency',
  'markupPercent',
  'commissionPercent',
  'validFrom',
  'validUntil',
  'active',
  'standalone',
  'proposalEligible',
  'portalVisible',
] as const;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Travel product validity dates are stored as plain Postgres DATE columns
// (no time-of-day, no timezone). Accepting/returning a raw "YYYY-MM-DD"
// string end to end — instead of parsing into a JS Date, which carries an
// implicit UTC-midnight timestamp that can shift by a calendar day once
// re-serialized through a non-UTC timezone — keeps that DB coherence.
function parseIsoDateString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    throw new ValidationError(`Field "${field}" must be an ISO date string (YYYY-MM-DD)`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const asUtcDate = new Date(Date.UTC(year!, month! - 1, day));
  if (
    asUtcDate.getUTCFullYear() !== year ||
    asUtcDate.getUTCMonth() !== month! - 1 ||
    asUtcDate.getUTCDate() !== day
  ) {
    throw new ValidationError(`Field "${field}" must be a valid calendar date`);
  }
  return value;
}

function parseString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string`);
  }
  return value;
}

function parseNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ValidationError(`Field "${field}" must be a number`);
  }
  return value;
}

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`Field "${field}" must be a boolean`);
  }
  return value;
}

function assertShape(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(ALLOWED_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }
  return record;
}

// Shared mapping of scalar (non-date) fields to their parsers. Used by both
// create and update parsers to keep the two in sync.
function applyScalarFields(
  record: Record<string, unknown>,
  target: Record<string, unknown>,
): void {
  if (record.supplierId !== undefined) target.supplierId = parseString(record.supplierId, 'supplierId');
  if (record.partnerId !== undefined) target.partnerId = parseString(record.partnerId, 'partnerId');
  if (record.description !== undefined) target.description = parseString(record.description, 'description');
  if (record.destination !== undefined) target.destination = parseString(record.destination, 'destination');
  if (record.durationText !== undefined) target.durationText = parseString(record.durationText, 'durationText');
  if (record.rules !== undefined) target.rules = parseString(record.rules, 'rules');
  if (record.inclusions !== undefined) target.inclusions = parseString(record.inclusions, 'inclusions');
  if (record.exclusions !== undefined) target.exclusions = parseString(record.exclusions, 'exclusions');
  if (record.minAge !== undefined) target.minAge = parseNumber(record.minAge, 'minAge');
  if (record.maxAge !== undefined) target.maxAge = parseNumber(record.maxAge, 'maxAge');
  if (record.capacity !== undefined) target.capacity = parseNumber(record.capacity, 'capacity');
  if (record.bookingDeadlineDays !== undefined) {
    target.bookingDeadlineDays = parseNumber(record.bookingDeadlineDays, 'bookingDeadlineDays');
  }
  if (record.cancellationPolicy !== undefined) {
    target.cancellationPolicy = parseString(record.cancellationPolicy, 'cancellationPolicy');
  }
  if (record.cost !== undefined) target.cost = parseNumber(record.cost, 'cost');
  if (record.price !== undefined) target.price = parseNumber(record.price, 'price');
  if (record.currency !== undefined) target.currency = parseString(record.currency, 'currency');
  if (record.markupPercent !== undefined) target.markupPercent = parseNumber(record.markupPercent, 'markupPercent');
  if (record.commissionPercent !== undefined) {
    target.commissionPercent = parseNumber(record.commissionPercent, 'commissionPercent');
  }
  if (record.validFrom !== undefined) target.validFrom = parseIsoDateString(record.validFrom, 'validFrom');
  if (record.validUntil !== undefined) target.validUntil = parseIsoDateString(record.validUntil, 'validUntil');
  if (record.active !== undefined) target.active = parseBoolean(record.active, 'active');
  if (record.standalone !== undefined) target.standalone = parseBoolean(record.standalone, 'standalone');
  if (record.proposalEligible !== undefined) {
    target.proposalEligible = parseBoolean(record.proposalEligible, 'proposalEligible');
  }
  if (record.portalVisible !== undefined) target.portalVisible = parseBoolean(record.portalVisible, 'portalVisible');
}

export function parseCreateTravelProductInput(body: unknown): CreateTravelProductInput {
  const record = assertShape(body);

  if (typeof record.category !== 'string' || !CATEGORY_VALUES.includes(record.category)) {
    throw new ValidationError(`Field "category" must be one of: ${CATEGORY_VALUES.join(', ')}`);
  }
  if (typeof record.title !== 'string' || record.title.trim().length === 0) {
    throw new ValidationError('Field "title" is required and must be a non-empty string');
  }

  const data: Record<string, unknown> = {
    category: record.category,
    title: record.title,
  };
  applyScalarFields(record, data);

  return data as unknown as CreateTravelProductInput;
}

export function parseUpdateTravelProductInput(body: unknown): UpdateTravelProductInput {
  const record = assertShape(body);

  const data: Record<string, unknown> = {};

  if (record.category !== undefined) {
    if (typeof record.category !== 'string' || !CATEGORY_VALUES.includes(record.category)) {
      throw new ValidationError(`Field "category" must be one of: ${CATEGORY_VALUES.join(', ')}`);
    }
    data.category = record.category;
  }
  if (record.title !== undefined) {
    if (typeof record.title !== 'string' || record.title.trim().length === 0) {
      throw new ValidationError('Field "title" must be a non-empty string');
    }
    data.title = record.title;
  }
  applyScalarFields(record, data);

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}
