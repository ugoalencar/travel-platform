import { PipelineStageColor, PipelineStageVisualLevel } from '../../../packages/domain/types';
import { ValidationError } from './errors';
import type {
  CreatePipelineInput,
  CreateStageInput,
  UpdatePipelineInput,
  UpdateStageInput,
} from './pipeline-config';

// Mass-assignment protection: mirrors commercial-cockpit-parsers.ts --
// every parser rejects a body naming a field outside its allow-list, and
// rejects agencyId/id/createdAt/updatedAt first so tenant scope and
// identity can never be set from client input.

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  return body as Record<string, unknown>;
}

function assertAllowList(
  record: Record<string, unknown>,
  forbidden: readonly string[],
  allowed: readonly string[],
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

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required and must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ValidationError(`Field "${field}" must be a string`);
  return value;
}

function optionalNullableString(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new ValidationError(`Field "${field}" must be a string or null`);
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new ValidationError(`Field "${field}" must be a boolean`);
  return value;
}

function requireInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ValidationError(`Field "${field}" is required and must be an integer`);
  }
  return value;
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  return requireInteger(value, field);
}

function isEnumValue<T extends Record<string, string>>(enumObj: T, value: unknown): value is T[keyof T] {
  return typeof value === 'string' && Object.values(enumObj).includes(value);
}

// ---- Pipelines ----

const FORBIDDEN_PIPELINE_CREATE_FIELDS = ['agencyId', 'tenantId', 'id', 'createdAt', 'updatedAt', 'active'] as const;
const ALLOWED_PIPELINE_CREATE_FIELDS = ['name', 'description', 'notificationsEnabled'] as const;

export function parseCreatePipelineInput(body: unknown): CreatePipelineInput {
  const record = asRecord(body);
  assertAllowList(record, FORBIDDEN_PIPELINE_CREATE_FIELDS, ALLOWED_PIPELINE_CREATE_FIELDS);

  const name = requireNonEmptyString(record.name, 'name');
  const input: CreatePipelineInput = { name };
  const description = optionalString(record.description, 'description');
  if (description !== undefined) input.description = description;
  const notificationsEnabled = optionalBoolean(record.notificationsEnabled, 'notificationsEnabled');
  if (notificationsEnabled !== undefined) input.notificationsEnabled = notificationsEnabled;

  return input;
}

const FORBIDDEN_PIPELINE_UPDATE_FIELDS = ['agencyId', 'tenantId', 'id', 'createdAt', 'updatedAt'] as const;
const ALLOWED_PIPELINE_UPDATE_FIELDS = ['name', 'description', 'active', 'notificationsEnabled'] as const;

export function parseUpdatePipelineInput(body: unknown): UpdatePipelineInput {
  const record = asRecord(body);
  assertAllowList(record, FORBIDDEN_PIPELINE_UPDATE_FIELDS, ALLOWED_PIPELINE_UPDATE_FIELDS);

  const input: UpdatePipelineInput = {};
  const name = optionalString(record.name, 'name');
  if (name !== undefined) input.name = name;
  const description = optionalNullableString(record.description, 'description');
  if (description !== undefined) input.description = description;
  const active = optionalBoolean(record.active, 'active');
  if (active !== undefined) input.active = active;
  const notificationsEnabled = optionalBoolean(record.notificationsEnabled, 'notificationsEnabled');
  if (notificationsEnabled !== undefined) input.notificationsEnabled = notificationsEnabled;

  return input;
}

// ---- Stages ----

const FORBIDDEN_STAGE_CREATE_FIELDS = ['agencyId', 'tenantId', 'id', 'pipelineId', 'createdAt', 'updatedAt', 'active'] as const;
const ALLOWED_STAGE_CREATE_FIELDS = [
  'name',
  'sequence',
  'colorToken',
  'visualLevel',
  'notificationsEnabled',
] as const;

export function parseCreateStageInput(body: unknown): CreateStageInput {
  const record = asRecord(body);
  assertAllowList(record, FORBIDDEN_STAGE_CREATE_FIELDS, ALLOWED_STAGE_CREATE_FIELDS);

  const name = requireNonEmptyString(record.name, 'name');
  const sequence = requireInteger(record.sequence, 'sequence');
  if (!isEnumValue(PipelineStageColor, record.colorToken)) {
    throw new ValidationError('Field "colorToken" must be a valid PipelineStageColor value');
  }

  const input: CreateStageInput = { name, sequence, colorToken: record.colorToken };
  if (record.visualLevel !== undefined) {
    if (!isEnumValue(PipelineStageVisualLevel, record.visualLevel)) {
      throw new ValidationError('Field "visualLevel" must be a valid PipelineStageVisualLevel value');
    }
    input.visualLevel = record.visualLevel;
  }
  const notificationsEnabled = optionalBoolean(record.notificationsEnabled, 'notificationsEnabled');
  if (notificationsEnabled !== undefined) input.notificationsEnabled = notificationsEnabled;

  return input;
}

const FORBIDDEN_STAGE_UPDATE_FIELDS = ['agencyId', 'tenantId', 'id', 'pipelineId', 'createdAt', 'updatedAt'] as const;
const ALLOWED_STAGE_UPDATE_FIELDS = [
  'name',
  'sequence',
  'colorToken',
  'visualLevel',
  'active',
  'notificationsEnabled',
] as const;

export function parseUpdateStageInput(body: unknown): UpdateStageInput {
  const record = asRecord(body);
  assertAllowList(record, FORBIDDEN_STAGE_UPDATE_FIELDS, ALLOWED_STAGE_UPDATE_FIELDS);

  const input: UpdateStageInput = {};
  const name = optionalString(record.name, 'name');
  if (name !== undefined) input.name = name;
  const sequence = optionalInteger(record.sequence, 'sequence');
  if (sequence !== undefined) input.sequence = sequence;
  if (record.colorToken !== undefined) {
    if (!isEnumValue(PipelineStageColor, record.colorToken)) {
      throw new ValidationError('Field "colorToken" must be a valid PipelineStageColor value');
    }
    input.colorToken = record.colorToken;
  }
  if (record.visualLevel !== undefined) {
    if (!isEnumValue(PipelineStageVisualLevel, record.visualLevel)) {
      throw new ValidationError('Field "visualLevel" must be a valid PipelineStageVisualLevel value');
    }
    input.visualLevel = record.visualLevel;
  }
  const active = optionalBoolean(record.active, 'active');
  if (active !== undefined) input.active = active;
  const notificationsEnabled = optionalBoolean(record.notificationsEnabled, 'notificationsEnabled');
  if (notificationsEnabled !== undefined) input.notificationsEnabled = notificationsEnabled;

  return input;
}

// ---- Access ----

const FORBIDDEN_ACCESS_CREATE_FIELDS = ['agencyId', 'tenantId', 'id', 'pipelineId', 'createdAt'] as const;
const ALLOWED_ACCESS_CREATE_FIELDS = ['userId'] as const;

export function parseGrantAccessInput(body: unknown): { userId: string } {
  const record = asRecord(body);
  assertAllowList(record, FORBIDDEN_ACCESS_CREATE_FIELDS, ALLOWED_ACCESS_CREATE_FIELDS);
  const userId = requireNonEmptyString(record.userId, 'userId');
  return { userId };
}
