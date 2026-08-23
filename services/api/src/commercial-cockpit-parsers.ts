import {
  CommercialStage,
  CommercialTaskType,
  InteractionChannel,
  InteractionDirection,
} from '../../../packages/domain/types';
import { ValidationError } from './errors';
import type {
  CreateInteractionInput,
  CreateOpportunityInput,
  CreateTaskInput,
  InteractionFilters,
  OpportunityFilters,
  TaskFilters,
  UpdateOpportunityInput,
  UpdateTaskInput,
} from './commercial-cockpit';

// ============================================================
// Mass-assignment protection: every parser below rejects a request body
// that names a field outside its explicit allow-list, and additionally
// rejects a fixed forbidden-field list first (agencyId/tenantId/id/
// createdAt/updatedAt/customerId-on-update, etc) so tenant scope and
// identity can never be set or escaped from client input. Mirrors the
// wish/proposal/offer parsers already in app.ts.
// ============================================================

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  return body as Record<string, unknown>;
}

function assertAllowList(record: Record<string, unknown>, forbidden: readonly string[], allowed: readonly string[]): void {
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

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required and must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string`);
  }
  return value;
}

function optionalNullableString(value: unknown, field: string): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string or null`);
  }
  return value;
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ValidationError(`Field "${field}" must be a number`);
  }
  return value;
}

function optionalNullableNumber(value: unknown, field: string): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ValidationError(`Field "${field}" must be a number or null`);
  }
  return value;
}

function isEnumValue<T extends Record<string, string>>(enumObj: T, value: unknown): value is T[keyof T] {
  return typeof value === 'string' && Object.values(enumObj).includes(value);
}

// ---- Opportunities ----

const FORBIDDEN_OPPORTUNITY_CREATE_FIELDS = ['agencyId', 'tenantId', 'id', 'createdAt', 'updatedAt'] as const;
const ALLOWED_OPPORTUNITY_CREATE_FIELDS = [
  'customerId',
  'wishId',
  'proposalId',
  'saleId',
  'responsibleUserId',
  'destination',
  'tripDateFrom',
  'tripDateTo',
  'expectedValue',
  'stage',
  'nextActionAt',
] as const;

export function parseCreateOpportunityInput(body: unknown): CreateOpportunityInput {
  const record = asRecord(body);
  assertAllowList(record, FORBIDDEN_OPPORTUNITY_CREATE_FIELDS, ALLOWED_OPPORTUNITY_CREATE_FIELDS);

  const customerId = requireNonEmptyString(record.customerId, 'customerId');

  const input: CreateOpportunityInput = { customerId };
  const wishId = optionalString(record.wishId, 'wishId');
  if (wishId !== undefined) input.wishId = wishId;
  const proposalId = optionalString(record.proposalId, 'proposalId');
  if (proposalId !== undefined) input.proposalId = proposalId;
  const saleId = optionalString(record.saleId, 'saleId');
  if (saleId !== undefined) input.saleId = saleId;
  const responsibleUserId = optionalString(record.responsibleUserId, 'responsibleUserId');
  if (responsibleUserId !== undefined) input.responsibleUserId = responsibleUserId;
  const destination = optionalString(record.destination, 'destination');
  if (destination !== undefined) input.destination = destination;
  const tripDateFrom = optionalString(record.tripDateFrom, 'tripDateFrom');
  if (tripDateFrom !== undefined) input.tripDateFrom = tripDateFrom;
  const tripDateTo = optionalString(record.tripDateTo, 'tripDateTo');
  if (tripDateTo !== undefined) input.tripDateTo = tripDateTo;
  const expectedValue = optionalNumber(record.expectedValue, 'expectedValue');
  if (expectedValue !== undefined) input.expectedValue = expectedValue;
  const nextActionAt = optionalString(record.nextActionAt, 'nextActionAt');
  if (nextActionAt !== undefined) input.nextActionAt = nextActionAt;

  if (record.stage !== undefined) {
    if (!isEnumValue(CommercialStage, record.stage)) {
      throw new ValidationError('Field "stage" must be a valid CommercialStage value');
    }
    input.stage = record.stage;
  }

  return input;
}

// PATCH allow-list: stage, responsibleUserId, nextActionAt, lostReason,
// expectedValue, destination, tripDateFrom/tripDateTo -- exactly the set
// the brief specifies. Never proposalId/saleId/wishId/customerId
// (relationship changes are out of scope for this PATCH), never
// agencyId/id/createdAt/updatedAt.
const FORBIDDEN_OPPORTUNITY_UPDATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'customerId',
  'wishId',
  'proposalId',
  'saleId',
] as const;
const ALLOWED_OPPORTUNITY_UPDATE_FIELDS = [
  'stage',
  'responsibleUserId',
  'nextActionAt',
  'lostReason',
  'expectedValue',
  'destination',
  'tripDateFrom',
  'tripDateTo',
] as const;

export function parseUpdateOpportunityInput(body: unknown): UpdateOpportunityInput {
  const record = asRecord(body);
  assertAllowList(record, FORBIDDEN_OPPORTUNITY_UPDATE_FIELDS, ALLOWED_OPPORTUNITY_UPDATE_FIELDS);

  const input: UpdateOpportunityInput = {};

  if (record.stage !== undefined) {
    if (!isEnumValue(CommercialStage, record.stage)) {
      throw new ValidationError('Field "stage" must be a valid CommercialStage value');
    }
    input.stage = record.stage;
  }
  const responsibleUserId = optionalNullableString(record.responsibleUserId, 'responsibleUserId');
  if (responsibleUserId !== undefined) input.responsibleUserId = responsibleUserId;
  const nextActionAt = optionalNullableString(record.nextActionAt, 'nextActionAt');
  if (nextActionAt !== undefined) input.nextActionAt = nextActionAt;
  const lostReason = optionalNullableString(record.lostReason, 'lostReason');
  if (lostReason !== undefined) input.lostReason = lostReason;
  const expectedValue = optionalNullableNumber(record.expectedValue, 'expectedValue');
  if (expectedValue !== undefined) input.expectedValue = expectedValue;
  const destination = optionalNullableString(record.destination, 'destination');
  if (destination !== undefined) input.destination = destination;
  const tripDateFrom = optionalNullableString(record.tripDateFrom, 'tripDateFrom');
  if (tripDateFrom !== undefined) input.tripDateFrom = tripDateFrom;
  const tripDateTo = optionalNullableString(record.tripDateTo, 'tripDateTo');
  if (tripDateTo !== undefined) input.tripDateTo = tripDateTo;

  return input;
}

export function parseOpportunityFilters(query: Record<string, unknown>): OpportunityFilters {
  const filters: OpportunityFilters = {};

  if (typeof query.stage === 'string') {
    if (!isEnumValue(CommercialStage, query.stage)) {
      throw new ValidationError('Query parameter "stage" must be a valid CommercialStage value');
    }
    filters.stage = query.stage;
  }
  if (typeof query.responsibleUserId === 'string') filters.responsibleUserId = query.responsibleUserId;
  if (typeof query.customerId === 'string') filters.customerId = query.customerId;
  if (typeof query.destination === 'string') filters.destination = query.destination;
  if (typeof query.tripDateFrom === 'string') filters.tripDateFrom = query.tripDateFrom;
  if (typeof query.tripDateTo === 'string') filters.tripDateTo = query.tripDateTo;
  if (typeof query.hasProposal === 'string') filters.hasProposal = query.hasProposal === 'true';
  if (typeof query.hasSale === 'string') filters.hasSale = query.hasSale === 'true';
  if (typeof query.hasNextAction === 'string') filters.hasNextAction = query.hasNextAction === 'true';
  if (typeof query.nextActionFrom === 'string') filters.nextActionFrom = query.nextActionFrom;
  if (typeof query.nextActionTo === 'string') filters.nextActionTo = query.nextActionTo;
  if (typeof query.overdue === 'string') filters.overdue = query.overdue === 'true';

  return filters;
}

// ---- Tasks ----

const FORBIDDEN_TASK_CREATE_FIELDS = ['agencyId', 'tenantId', 'id', 'createdAt', 'createdBy', 'completedAt'] as const;
const ALLOWED_TASK_CREATE_FIELDS = [
  'customerId',
  'opportunityId',
  'assignedUserId',
  'type',
  'title',
  'dueAt',
  'notes',
] as const;

export function parseCreateTaskInput(body: unknown): CreateTaskInput {
  const record = asRecord(body);
  assertAllowList(record, FORBIDDEN_TASK_CREATE_FIELDS, ALLOWED_TASK_CREATE_FIELDS);

  const customerId = requireNonEmptyString(record.customerId, 'customerId');
  const assignedUserId = requireNonEmptyString(record.assignedUserId, 'assignedUserId');
  const title = requireNonEmptyString(record.title, 'title');
  const dueAt = requireNonEmptyString(record.dueAt, 'dueAt');

  const input: CreateTaskInput = { customerId, assignedUserId, title, dueAt };

  const opportunityId = optionalString(record.opportunityId, 'opportunityId');
  if (opportunityId !== undefined) input.opportunityId = opportunityId;
  const notes = optionalString(record.notes, 'notes');
  if (notes !== undefined) input.notes = notes;

  if (record.type !== undefined) {
    if (!isEnumValue(CommercialTaskType, record.type)) {
      throw new ValidationError('Field "type" must be a valid CommercialTaskType value');
    }
    input.type = record.type;
  }

  return input;
}

const FORBIDDEN_TASK_UPDATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'createdBy',
  'customerId',
  'opportunityId',
  'type',
] as const;
const ALLOWED_TASK_UPDATE_FIELDS = ['assignedUserId', 'title', 'dueAt', 'completedAt', 'notes'] as const;

export function parseUpdateTaskInput(body: unknown): UpdateTaskInput {
  const record = asRecord(body);
  assertAllowList(record, FORBIDDEN_TASK_UPDATE_FIELDS, ALLOWED_TASK_UPDATE_FIELDS);

  const input: UpdateTaskInput = {};

  const assignedUserId = optionalString(record.assignedUserId, 'assignedUserId');
  if (assignedUserId !== undefined) input.assignedUserId = assignedUserId;
  const title = optionalString(record.title, 'title');
  if (title !== undefined) input.title = title;
  const dueAt = optionalString(record.dueAt, 'dueAt');
  if (dueAt !== undefined) input.dueAt = dueAt;
  const completedAt = optionalNullableString(record.completedAt, 'completedAt');
  if (completedAt !== undefined) input.completedAt = completedAt;
  const notes = optionalNullableString(record.notes, 'notes');
  if (notes !== undefined) input.notes = notes;

  return input;
}

export function parseTaskFilters(query: Record<string, unknown>): TaskFilters {
  const filters: TaskFilters = {};

  if (typeof query.customerId === 'string') filters.customerId = query.customerId;
  if (typeof query.assignedUserId === 'string') filters.assignedUserId = query.assignedUserId;
  if (typeof query.opportunityId === 'string') filters.opportunityId = query.opportunityId;
  if (typeof query.pending === 'string') filters.pending = query.pending === 'true';
  if (typeof query.dueFrom === 'string') filters.dueFrom = query.dueFrom;
  if (typeof query.dueTo === 'string') filters.dueTo = query.dueTo;
  if (typeof query.overdue === 'string') filters.overdue = query.overdue === 'true';

  return filters;
}

// ---- Interactions ----

const FORBIDDEN_INTERACTION_CREATE_FIELDS = ['agencyId', 'tenantId', 'id', 'createdAt', 'userId'] as const;
const ALLOWED_INTERACTION_CREATE_FIELDS = [
  'customerId',
  'opportunityId',
  'proposalId',
  'saleId',
  'channel',
  'direction',
  'occurredAt',
  'summary',
  'nextActionAt',
] as const;

export function parseCreateInteractionInput(body: unknown): CreateInteractionInput {
  const record = asRecord(body);
  assertAllowList(record, FORBIDDEN_INTERACTION_CREATE_FIELDS, ALLOWED_INTERACTION_CREATE_FIELDS);

  const customerId = requireNonEmptyString(record.customerId, 'customerId');
  const summary = requireNonEmptyString(record.summary, 'summary');

  if (!isEnumValue(InteractionChannel, record.channel)) {
    throw new ValidationError('Field "channel" must be a valid InteractionChannel value');
  }
  if (!isEnumValue(InteractionDirection, record.direction)) {
    throw new ValidationError('Field "direction" must be a valid InteractionDirection value');
  }

  const input: CreateInteractionInput = {
    customerId,
    summary,
    channel: record.channel,
    direction: record.direction,
  };

  const opportunityId = optionalString(record.opportunityId, 'opportunityId');
  if (opportunityId !== undefined) input.opportunityId = opportunityId;
  const proposalId = optionalString(record.proposalId, 'proposalId');
  if (proposalId !== undefined) input.proposalId = proposalId;
  const saleId = optionalString(record.saleId, 'saleId');
  if (saleId !== undefined) input.saleId = saleId;
  const occurredAt = optionalString(record.occurredAt, 'occurredAt');
  if (occurredAt !== undefined) input.occurredAt = occurredAt;
  const nextActionAt = optionalString(record.nextActionAt, 'nextActionAt');
  if (nextActionAt !== undefined) input.nextActionAt = nextActionAt;

  return input;
}

export function parseInteractionFilters(query: Record<string, unknown>): InteractionFilters {
  const filters: InteractionFilters = {};
  if (typeof query.customerId === 'string') filters.customerId = query.customerId;
  if (typeof query.opportunityId === 'string') filters.opportunityId = query.opportunityId;
  return filters;
}

export function parseTravelSearchRange(query: Record<string, unknown>): 'today' | 'week' | '30d' {
  const range = query.range;
  if (range === 'today' || range === 'week' || range === '30d') {
    return range;
  }
  throw new ValidationError('Query parameter "range" must be one of: today, week, 30d');
}
