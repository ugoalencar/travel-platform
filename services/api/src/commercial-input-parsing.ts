import { ValidationError } from './errors';
import type { CreateOfferInput, UpdateOfferInput } from './offers';
import type { CreateProposalInput, UpdateProposalInput } from './proposals';
import type { CreateSaleInput, UpdateSaleInput } from './sales';

// Offer, Proposal, and Sale input-parsing/validation helpers. Extracted
// verbatim (no logic change) from app.ts as part of the app.ts
// decomposition documented in docs/refactoring/BATCH3B_EXTRACTION_PLAN.md.
// These three domains form the commercial funnel (offer -> proposal ->
// sale) and were extracted together as one cohesive unit rather than three
// separate files, since they are small, closely related, and splitting
// them further would not meaningfully reduce complexity.

const FORBIDDEN_OFFER_CREATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'status',
] as const;

const ALLOWED_OFFER_CREATE_FIELDS = [
  'name',
  'description',
  'price',
  'validFrom',
  'validUntil',
] as const;

const FORBIDDEN_OFFER_UPDATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
] as const;

const ALLOWED_OFFER_UPDATE_FIELDS = [
  'name',
  'description',
  'price',
  'validFrom',
  'validUntil',
  'status',
] as const;

const VALID_OFFER_STATUS_VALUES = ['ACTIVE', 'INACTIVE', 'EXPIRED'] as const;

export function parseOfferDate(value: unknown, field: string): Date {
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Field "${field}" must be a valid date`);
  }

  return date;
}

export function parseOfferPrice(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ValidationError('Field "price" must be a number');
  }
  if (value < 0) {
    throw new ValidationError('Field "price" must not be negative');
  }
  return value;
}

export function parseCreateOfferInput(body: unknown): CreateOfferInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_OFFER_CREATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_OFFER_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    throw new ValidationError('Field "name" is required and must be a non-empty string');
  }
  if (record.price === undefined) {
    throw new ValidationError('Field "price" is required');
  }

  const data: CreateOfferInput = {
    name: record.name,
    price: parseOfferPrice(record.price),
  };

  if (record.description !== undefined) {
    if (typeof record.description !== 'string') {
      throw new ValidationError('Field "description" must be a string');
    }
    data.description = record.description;
  }
  if (record.validFrom !== undefined) {
    data.validFrom = parseOfferDate(record.validFrom, 'validFrom');
  }
  if (record.validUntil !== undefined) {
    data.validUntil = parseOfferDate(record.validUntil, 'validUntil');
  }

  return data;
}

export function parseUpdateOfferInput(body: unknown): UpdateOfferInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_OFFER_UPDATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_OFFER_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  const data: UpdateOfferInput = {};

  if (record.name !== undefined) {
    if (typeof record.name !== 'string' || record.name.trim().length === 0) {
      throw new ValidationError('Field "name" must be a non-empty string');
    }
    data.name = record.name;
  }
  if (record.description !== undefined) {
    if (typeof record.description !== 'string') {
      throw new ValidationError('Field "description" must be a string');
    }
    data.description = record.description;
  }
  if (record.price !== undefined) {
    data.price = parseOfferPrice(record.price);
  }
  if (record.validFrom !== undefined) {
    data.validFrom = parseOfferDate(record.validFrom, 'validFrom');
  }
  if (record.validUntil !== undefined) {
    data.validUntil = parseOfferDate(record.validUntil, 'validUntil');
  }
  if (record.status !== undefined) {
    if (
      typeof record.status !== 'string' ||
      !(VALID_OFFER_STATUS_VALUES as readonly string[]).includes(record.status)
    ) {
      throw new ValidationError('Field "status" must be one of ACTIVE, INACTIVE, EXPIRED');
    }
    data.status = record.status as NonNullable<UpdateOfferInput['status']>;
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}

const FORBIDDEN_PROPOSAL_CREATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'total',
  'status',
  'userId',
] as const;

const ALLOWED_PROPOSAL_CREATE_FIELDS = [
  'customerId',
  'offerId',
  'wishId',
  'proposedPrice',
  'discount',
  'validUntil',
  'conditions',
  'notes',
] as const;

const FORBIDDEN_PROPOSAL_UPDATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'total',
  'status',
  'userId',
  'customerId',
  'offerId',
  'wishId',
] as const;

const ALLOWED_PROPOSAL_UPDATE_FIELDS = [
  'proposedPrice',
  'discount',
  'validUntil',
  'conditions',
  'notes',
] as const;

export function parseProposalDate(value: unknown, field: string): Date {
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Field "${field}" must be a valid date`);
  }

  return date;
}

export function parseProposalMoney(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ValidationError(`Field "${field}" must be a number`);
  }
  if (value < 0) {
    throw new ValidationError(`Field "${field}" must not be negative`);
  }
  return value;
}

export function parseCreateProposalInput(body: unknown): {
  customerId: string;
  data: CreateProposalInput;
} {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_PROPOSAL_CREATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_PROPOSAL_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.customerId !== 'string' || record.customerId.trim().length === 0) {
    throw new ValidationError('Field "customerId" is required and must be a non-empty string');
  }
  if (record.proposedPrice === undefined) {
    throw new ValidationError('Field "proposedPrice" is required');
  }

  const data: CreateProposalInput = {
    proposedPrice: parseProposalMoney(record.proposedPrice, 'proposedPrice'),
  };

  if (record.offerId !== undefined) {
    if (typeof record.offerId !== 'string' || record.offerId.trim().length === 0) {
      throw new ValidationError('Field "offerId" must be a non-empty string');
    }
    data.offerId = record.offerId;
  }
  if (record.wishId !== undefined) {
    if (typeof record.wishId !== 'string' || record.wishId.trim().length === 0) {
      throw new ValidationError('Field "wishId" must be a non-empty string');
    }
    data.wishId = record.wishId;
  }
  if (record.discount !== undefined) {
    data.discount = parseProposalMoney(record.discount, 'discount');
  }
  if (record.validUntil !== undefined) {
    data.validUntil = parseProposalDate(record.validUntil, 'validUntil');
  }
  if (record.conditions !== undefined) {
    if (typeof record.conditions !== 'string') {
      throw new ValidationError('Field "conditions" must be a string');
    }
    data.conditions = record.conditions;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  if (data.discount !== undefined && data.discount > data.proposedPrice) {
    throw new ValidationError('Field "discount" must not exceed "proposedPrice"');
  }

  return { customerId: record.customerId, data };
}

export function parseUpdateProposalInput(body: unknown): UpdateProposalInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_PROPOSAL_UPDATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_PROPOSAL_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  const data: UpdateProposalInput = {};

  if (record.proposedPrice !== undefined) {
    data.proposedPrice = parseProposalMoney(record.proposedPrice, 'proposedPrice');
  }
  if (record.discount !== undefined) {
    data.discount = parseProposalMoney(record.discount, 'discount');
  }
  if (record.validUntil !== undefined) {
    data.validUntil = parseProposalDate(record.validUntil, 'validUntil');
  }
  if (record.conditions !== undefined) {
    if (typeof record.conditions !== 'string') {
      throw new ValidationError('Field "conditions" must be a string');
    }
    data.conditions = record.conditions;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  if (
    data.proposedPrice !== undefined &&
    data.discount !== undefined &&
    data.discount > data.proposedPrice
  ) {
    throw new ValidationError('Field "discount" must not exceed "proposedPrice"');
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}

const FORBIDDEN_SALE_CREATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'total',
  'status',
  'userId',
  'paidAt',
] as const;

const ALLOWED_SALE_CREATE_FIELDS = [
  'customerId',
  'proposalId',
  'brokerId',
  'amount',
  'discount',
  'notes',
] as const;

const FORBIDDEN_SALE_UPDATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'total',
  'status',
  'userId',
  'paidAt',
  'customerId',
  'proposalId',
  'brokerId',
] as const;

const ALLOWED_SALE_UPDATE_FIELDS = ['amount', 'discount', 'notes'] as const;

export function parseSaleMoney(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ValidationError(`Field "${field}" must be a number`);
  }
  if (value < 0) {
    throw new ValidationError(`Field "${field}" must not be negative`);
  }
  return value;
}

export function parseCreateSaleInput(body: unknown): CreateSaleInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_SALE_CREATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_SALE_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.customerId !== 'string' || record.customerId.trim().length === 0) {
    throw new ValidationError('Field "customerId" is required and must be a non-empty string');
  }
  if (record.amount === undefined) {
    throw new ValidationError('Field "amount" is required');
  }

  const data: CreateSaleInput = {
    customerId: record.customerId,
    amount: parseSaleMoney(record.amount, 'amount'),
  };

  if (record.proposalId !== undefined) {
    if (typeof record.proposalId !== 'string' || record.proposalId.trim().length === 0) {
      throw new ValidationError('Field "proposalId" must be a non-empty string');
    }
    data.proposalId = record.proposalId;
  }
  if (record.brokerId !== undefined) {
    if (typeof record.brokerId !== 'string' || record.brokerId.trim().length === 0) {
      throw new ValidationError('Field "brokerId" must be a non-empty string');
    }
    data.brokerId = record.brokerId;
  }
  if (record.discount !== undefined) {
    data.discount = parseSaleMoney(record.discount, 'discount');
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  return data;
}

export function parseUpdateSaleInput(body: unknown): UpdateSaleInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_SALE_UPDATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_SALE_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  const data: UpdateSaleInput = {};

  if (record.amount !== undefined) {
    data.amount = parseSaleMoney(record.amount, 'amount');
  }
  if (record.discount !== undefined) {
    data.discount = parseSaleMoney(record.discount, 'discount');
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}
