import { FormFieldError, ValidationError } from './errors';
import { SALE_RULE_KEYS, getSaleFormField } from './sale-form-fields';
import type { CreateOfferInput, UpdateOfferInput } from './offers';
import type { CreateProposalInput, UpdateProposalInput } from './proposals';
import type { CreateSaleInput, UpdateSaleInput } from './sales';
import { computeLineTotal, parseCreateSaleItemInput, saleItemAmountsError } from './sale-items';

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
  'featured',
  'showOnCustomerApp',
  'targetSegmentId',
  'displayPriority',
  'imageUrl',
  'coverMediaAssetId',
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
  'featured',
  'showOnCustomerApp',
  'targetSegmentId',
  'displayPriority',
  'imageUrl',
  'coverMediaAssetId',
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
  if (record.featured !== undefined) {
    if (typeof record.featured !== 'boolean') {
      throw new ValidationError('Field "featured" must be a boolean');
    }
    data.featured = record.featured;
  }
  if (record.showOnCustomerApp !== undefined) {
    if (typeof record.showOnCustomerApp !== 'boolean') {
      throw new ValidationError('Field "showOnCustomerApp" must be a boolean');
    }
    data.showOnCustomerApp = record.showOnCustomerApp;
  }
  if (record.targetSegmentId !== undefined) {
    if (record.targetSegmentId !== null && typeof record.targetSegmentId !== 'string') {
      throw new ValidationError('Field "targetSegmentId" must be a string or null');
    }
    data.targetSegmentId = record.targetSegmentId;
  }
  if (record.displayPriority !== undefined) {
    if (typeof record.displayPriority !== 'number' || !Number.isInteger(record.displayPriority)) {
      throw new ValidationError('Field "displayPriority" must be an integer');
    }
    data.displayPriority = record.displayPriority;
  }
  if (record.imageUrl !== undefined) {
    if (record.imageUrl !== null && typeof record.imageUrl !== 'string') {
      throw new ValidationError('Field "imageUrl" must be a string or null');
    }
    data.imageUrl = record.imageUrl;
  }
  if (record.coverMediaAssetId !== undefined) {
    if (record.coverMediaAssetId !== null && typeof record.coverMediaAssetId !== 'string') {
      throw new ValidationError('Field "coverMediaAssetId" must be a string or null');
    }
    data.coverMediaAssetId = record.coverMediaAssetId;
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
  if (record.featured !== undefined) {
    if (typeof record.featured !== 'boolean') {
      throw new ValidationError('Field "featured" must be a boolean');
    }
    data.featured = record.featured;
  }
  if (record.showOnCustomerApp !== undefined) {
    if (typeof record.showOnCustomerApp !== 'boolean') {
      throw new ValidationError('Field "showOnCustomerApp" must be a boolean');
    }
    data.showOnCustomerApp = record.showOnCustomerApp;
  }
  if (record.targetSegmentId !== undefined) {
    if (record.targetSegmentId !== null && typeof record.targetSegmentId !== 'string') {
      throw new ValidationError('Field "targetSegmentId" must be a string or null');
    }
    data.targetSegmentId = record.targetSegmentId;
  }
  if (record.displayPriority !== undefined) {
    if (typeof record.displayPriority !== 'number' || !Number.isInteger(record.displayPriority)) {
      throw new ValidationError('Field "displayPriority" must be an integer');
    }
    data.displayPriority = record.displayPriority;
  }
  if (record.imageUrl !== undefined) {
    if (record.imageUrl !== null && typeof record.imageUrl !== 'string') {
      throw new ValidationError('Field "imageUrl" must be a string or null');
    }
    data.imageUrl = record.imageUrl;
  }
  if (record.coverMediaAssetId !== undefined) {
    if (record.coverMediaAssetId !== null && typeof record.coverMediaAssetId !== 'string') {
      throw new ValidationError('Field "coverMediaAssetId" must be a string or null');
    }
    data.coverMediaAssetId = record.coverMediaAssetId;
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
  'title',
  'subtitle',
  'destinationSummary',
  'travelPeriod',
  'travelerSummary',
  'introText',
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
  'title',
  'subtitle',
  'destinationSummary',
  'travelPeriod',
  'travelerSummary',
  'introText',
] as const;

const PROPOSAL_COVER_STRING_FIELDS = [
  'title',
  'subtitle',
  'destinationSummary',
  'travelPeriod',
  'travelerSummary',
  'introText',
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
  for (const field of PROPOSAL_COVER_STRING_FIELDS) {
    if (record[field] !== undefined) {
      if (typeof record[field] !== 'string') {
        throw new ValidationError(`Field "${field}" must be a string`);
      }
      data[field] = record[field];
    }
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
  for (const field of PROPOSAL_COVER_STRING_FIELDS) {
    if (record[field] !== undefined) {
      if (typeof record[field] !== 'string') {
        throw new ValidationError(`Field "${field}" must be a string`);
      }
      data[field] = record[field];
    }
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

// Sale form fields (ADR-008): camelCase body property -> registry field_key. Modality
// fields travel inside `modalityData`, keyed by field_key.
const SALE_FORM_COLUMN_PROPS: Record<string, string> = {
  saleDate: 'sale_date',
  travelStartDate: 'travel_start_date',
  travelEndDate: 'travel_end_date',
  originText: 'origin_text',
  destinationText: 'destination_text',
  passengerCount: 'passenger_count',
};
const SALE_FORM_BODY_FIELDS = [...Object.keys(SALE_FORM_COLUMN_PROPS), 'modalityData'] as const;

/**
 * Collects the configurable form values of a sale body into a field_key map.
 * Rule data (rate/base/deadline/commission) is never a form value -> 422.
 */
function parseSaleFormValues(record: Record<string, unknown>): Record<string, unknown> | undefined {
  for (const key of SALE_RULE_KEYS) {
    if (key in record) {
      throw new FormFieldError('FIELD_NOT_ALLOWED', key, `Field "${key}" cannot be set on a sale`);
    }
  }

  const values: Record<string, unknown> = {};
  for (const [prop, fieldKey] of Object.entries(SALE_FORM_COLUMN_PROPS)) {
    if (record[prop] !== undefined) values[fieldKey] = record[prop];
  }
  if (record.modalityData !== undefined) {
    if (typeof record.modalityData !== 'object' || record.modalityData === null || Array.isArray(record.modalityData)) {
      throw new ValidationError('Field "modalityData" must be an object');
    }
    for (const [key, value] of Object.entries(record.modalityData as Record<string, unknown>)) {
      if (getSaleFormField(key)?.storage !== 'modality') {
        throw new FormFieldError('FIELD_UNKNOWN', key, `Unknown modality field "${key}"`);
      }
      values[key] = value;
    }
  }
  return Object.keys(values).length > 0 ? values : undefined;
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
  'categoryId',
  'items',
  ...SALE_FORM_BODY_FIELDS,
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

const ALLOWED_SALE_UPDATE_FIELDS = ['amount', 'discount', 'notes', 'categoryId', ...SALE_FORM_BODY_FIELDS] as const;

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

  const formValues = parseSaleFormValues(record);

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_SALE_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.customerId !== 'string' || record.customerId.trim().length === 0) {
    throw new ValidationError('Field "customerId" is required and must be a non-empty string');
  }
  let items: CreateSaleInput['items'];
  let itemTotal: number | undefined;
  if (record.items !== undefined) {
    if (!Array.isArray(record.items) || record.items.length === 0) {
      throw new ValidationError('Field "items" must contain at least one item');
    }
    items = record.items.map((item, index) => {
      const parsed = parseCreateSaleItemInput('', item);
      const amountError = saleItemAmountsError({
        qty: parsed.qty ?? 1,
        unitPrice: parsed.unitPrice,
        ...(parsed.unitCost !== undefined ? { unitCost: parsed.unitCost } : {}),
        taxes: parsed.taxes ?? 0,
        fees: parsed.fees ?? 0,
        discount: parsed.discount ?? 0,
        ...(parsed.commission !== undefined ? { commission: parsed.commission } : {}),
      });
      if (amountError) throw new ValidationError(`Field "items[${index}]": ${amountError}`);
      return parsed;
    });
    itemTotal = Math.round(items.reduce((sum, item) => sum + computeLineTotal(
      item.qty ?? 1,
      item.unitPrice,
      item.discount ?? 0,
      item.taxes ?? 0,
      item.fees ?? 0,
    ), 0) * 100) / 100;
  }
  if (record.amount === undefined && itemTotal === undefined) {
    throw new ValidationError('Field "amount" is required when no items are provided');
  }
  if (record.amount !== undefined && itemTotal !== undefined && parseSaleMoney(record.amount, 'amount') !== itemTotal) {
    throw new ValidationError('Field "amount" must equal the sum of item totals');
  }

  const data: CreateSaleInput = {
    customerId: record.customerId,
    amount: itemTotal ?? parseSaleMoney(record.amount, 'amount'),
    ...(items ? { items } : {}),
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
  if (record.categoryId !== undefined) {
    if (typeof record.categoryId !== 'string' || record.categoryId.trim().length === 0) {
      throw new ValidationError('Field "categoryId" must be a non-empty string');
    }
    data.categoryId = record.categoryId;
  }
  if (formValues !== undefined) data.formValues = formValues;

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

  const formValues = parseSaleFormValues(record);

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
  if (record.categoryId !== undefined) {
    if (typeof record.categoryId !== 'string' || record.categoryId.trim().length === 0) {
      throw new ValidationError('Field "categoryId" must be a non-empty string');
    }
    data.categoryId = record.categoryId;
  }
  if (formValues !== undefined) data.formValues = formValues;

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}
