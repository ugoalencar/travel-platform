/**
 * Wishes -- HTTP surface for wish CRUD.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import {
  createWish,
  getWishById,
  listWishes,
  updateWish,
  type CreateWishInput,
  type UpdateWishInput,
} from '../wishes';
import { NotFoundError, ValidationError } from '../errors';

export interface WishesRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerWishesRoutes(
  app: FastifyInstance,
  options: WishesRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/wishes', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const wishes = await listWishes(database);
    return { wishes };
  });

  app.get<{ Params: { id: string } }>(
    '/wishes/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const wish = await getWishById(database, request.params.id);

      if (!wish) {
        throw new NotFoundError('Wish not found');
      }

      return { wish };
    }
  );

  app.post('/wishes', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const { customerId, data } = parseCreateWishInput(request.body);
    const wish = await createWish(database, customerId, data);

    reply.code(201);
    return { wish };
  });

  app.patch<{ Params: { id: string } }>(
    '/wishes/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const data = parseUpdateWishInput(request.body);
      const wish = await updateWish(database, request.params.id, data);

      if (!wish) {
        throw new NotFoundError('Wish not found');
      }

      return { wish };
    }
  );
}

// ============================================================
// INPUT PARSERS
// ============================================================

const FORBIDDEN_WISH_CREATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'status',
] as const;

const ALLOWED_WISH_CREATE_FIELDS = [
  'customerId',
  'destination',
  'startDate',
  'endDate',
  'budget',
  'travelersCount',
  'notes',
] as const;

const FORBIDDEN_WISH_UPDATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'status',
  'customerId',
] as const;

const ALLOWED_WISH_UPDATE_FIELDS = [
  'destination',
  'startDate',
  'endDate',
  'budget',
  'travelersCount',
  'notes',
] as const;

function parseWishDate(value: unknown, field: string): Date {
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Field "${field}" must be a valid date`);
  }

  return date;
}

function parseCreateWishInput(body: unknown): { customerId: string; data: CreateWishInput } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_WISH_CREATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_WISH_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.customerId !== 'string' || record.customerId.trim().length === 0) {
    throw new ValidationError('Field "customerId" is required and must be a non-empty string');
  }

  const data: CreateWishInput = {};

  if (record.destination !== undefined) {
    if (typeof record.destination !== 'string') {
      throw new ValidationError('Field "destination" must be a string');
    }
    data.destination = record.destination;
  }
  if (record.startDate !== undefined) {
    data.startDate = parseWishDate(record.startDate, 'startDate');
  }
  if (record.endDate !== undefined) {
    data.endDate = parseWishDate(record.endDate, 'endDate');
  }
  if (record.budget !== undefined) {
    if (typeof record.budget !== 'number' || Number.isNaN(record.budget)) {
      throw new ValidationError('Field "budget" must be a number');
    }
    data.budget = record.budget;
  }
  if (record.travelersCount !== undefined) {
    if (typeof record.travelersCount !== 'number' || Number.isNaN(record.travelersCount)) {
      throw new ValidationError('Field "travelersCount" must be a number');
    }
    data.travelersCount = record.travelersCount;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  return { customerId: record.customerId, data };
}

function parseUpdateWishInput(body: unknown): UpdateWishInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_WISH_UPDATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_WISH_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  const data: UpdateWishInput = {};

  if (record.destination !== undefined) {
    if (typeof record.destination !== 'string') {
      throw new ValidationError('Field "destination" must be a string');
    }
    data.destination = record.destination;
  }
  if (record.startDate !== undefined) {
    data.startDate = parseWishDate(record.startDate, 'startDate');
  }
  if (record.endDate !== undefined) {
    data.endDate = parseWishDate(record.endDate, 'endDate');
  }
  if (record.budget !== undefined) {
    if (typeof record.budget !== 'number' || Number.isNaN(record.budget)) {
      throw new ValidationError('Field "budget" must be a number');
    }
    data.budget = record.budget;
  }
  if (record.travelersCount !== undefined) {
    if (typeof record.travelersCount !== 'number' || Number.isNaN(record.travelersCount)) {
      throw new ValidationError('Field "travelersCount" must be a number');
    }
    data.travelersCount = record.travelersCount;
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
