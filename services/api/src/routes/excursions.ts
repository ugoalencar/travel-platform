/**
 * Excursões (group trips) -- HTTP surface. See excursions.ts for the
 * fan-out design rationale.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { NotFoundError, ValidationError } from '../errors';
import {
  addCustomersToExcursion,
  createExcursion,
  deleteExcursion,
  getExcursionById,
  listExcursions,
  removeCustomerFromExcursion,
  type CreateExcursionInput,
} from '../excursions';

export interface ExcursionRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

function parseCreateExcursionInput(body: unknown): CreateExcursionInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  const name = record.name;
  const destination = record.destination;
  const transportType = record.transportType;
  const startDate = record.startDate;
  const endDate = record.endDate;
  if (typeof name !== 'string' || !name.trim()) {
    throw new ValidationError('Field "name" is required and must be a non-empty string');
  }
  if (typeof destination !== 'string' || !destination.trim()) {
    throw new ValidationError('Field "destination" is required and must be a non-empty string');
  }
  if (transportType !== 'AEREO' && transportType !== 'TERRESTRE') {
    throw new ValidationError('Field "transportType" must be AEREO or TERRESTRE');
  }
  if (typeof startDate !== 'string' || typeof endDate !== 'string') {
    throw new ValidationError('Fields "startDate" and "endDate" are required');
  }

  const input: CreateExcursionInput = {
    name,
    destination,
    transportType,
    startDate,
    endDate,
  };

  const stringFields = [
    'notes', 'airline', 'origin', 'flightNumber', 'cabinClass',
    'landDescription', 'landServiceType', 'currency',
  ] as const;
  for (const field of stringFields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) input[field] = value;
  }
  const numberFields = ['saleValue', 'cost'] as const;
  for (const field of numberFields) {
    const value = record[field];
    if (typeof value === 'number' && !Number.isNaN(value)) input[field] = value;
  }
  if (Array.isArray(record.customerIds)) {
    input.customerIds = record.customerIds.filter((v): v is string => typeof v === 'string');
  }

  return input;
}

export function registerExcursionRoutes(app: FastifyInstance, options: ExcursionRoutesOptions): void {
  const { database, protectedHooks } = options;

  app.get('/excursions', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const excursions = await listExcursions(database);
    return { excursions };
  });

  app.get<{ Params: { id: string } }>(
    '/excursions/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const found = await getExcursionById(database, request.params.id);
      if (!found) throw new NotFoundError('Excursion not found');
      return found;
    },
  );

  app.post('/excursions', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateExcursionInput(request.body);
    const result = await createExcursion(database, data);
    reply.code(201);
    return result;
  });

  app.post<{ Params: { id: string } }>(
    '/excursions/:id/customers',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      const body = request.body as { customerIds?: unknown };
      const customerIds = Array.isArray(body.customerIds)
        ? body.customerIds.filter((v): v is string => typeof v === 'string')
        : [];
      if (customerIds.length === 0) {
        throw new ValidationError('Field "customerIds" must be a non-empty array of strings');
      }
      const result = await addCustomersToExcursion(database, request.params.id, customerIds);
      reply.code(201);
      return result;
    },
  );

  app.delete<{ Params: { id: string; customerId: string } }>(
    '/excursions/:id/customers/:customerId',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      const removed = await removeCustomerFromExcursion(database, request.params.id, request.params.customerId);
      if (!removed) throw new NotFoundError('Customer is not assigned to this excursion');
      reply.code(204);
      return null;
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/excursions/:id',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      const deleted = await deleteExcursion(database, request.params.id);
      if (!deleted) throw new NotFoundError('Excursion not found');
      reply.code(204);
      return null;
    },
  );
}
