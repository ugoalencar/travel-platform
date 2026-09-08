/**
 * Operação -- HTTP surface for the three sidebar gaps that had no backend
 * domain at all: Ocorrências (trip incidents), Pós-viagem (completion
 * checklist), and the read-only Passageiros / Documentos aggregations.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { getUserId, requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { NotFoundError, ValidationError } from '../errors';
import {
  createTripOccurrence,
  getTripOccurrenceById,
  listTripOccurrences,
  updateTripOccurrence,
  type CreateTripOccurrenceInput,
  type TripOccurrenceSeverity,
  type TripOccurrenceStatus,
  type TripOccurrenceType,
  type UpdateTripOccurrenceInput,
} from '../trip-occurrences';
import {
  listCompletedTripsWithChecklist,
  setPostTripChecklistItem,
  POST_TRIP_CHECKLIST_ITEMS,
  type PostTripChecklistItemKey,
} from '../post-trip-checklist';
import { listDocumentAlerts, listOperationalPassengers } from '../operations-queries';

export interface OperationsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

const OCCURRENCE_TYPES: readonly TripOccurrenceType[] = [
  'ATRASO',
  'CANCELAMENTO',
  'PROBLEMA_DOCUMENTO',
  'RECLAMACAO',
  'OUTRO',
];
const OCCURRENCE_SEVERITIES: readonly TripOccurrenceSeverity[] = ['BAIXA', 'MEDIA', 'ALTA'];
const OCCURRENCE_STATUSES: readonly TripOccurrenceStatus[] = [
  'ABERTA',
  'EM_ANDAMENTO',
  'RESOLVIDA',
];

export function registerOperationsRoutes(
  app: FastifyInstance,
  options: OperationsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  // ============================================================
  // PASSAGEIROS (read-only aggregation)
  // ============================================================
  app.get('/operations/passengers', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const passengers = await listOperationalPassengers(database);
    return { passengers };
  });

  // ============================================================
  // DOCUMENTOS (read-only aggregation)
  // ============================================================
  app.get('/operations/document-alerts', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const alerts = await listDocumentAlerts(database);
    return { alerts };
  });

  // ============================================================
  // OCORRÊNCIAS
  // ============================================================
  app.get('/operations/occurrences', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const occurrences = await listTripOccurrences(database);
    return { occurrences };
  });

  app.post('/operations/occurrences', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateOccurrenceInput(request.body);
    // reportedBy defaults to the calling (dev-auth or authenticated) user
    // rather than trusting a client-supplied actor id for anything but an
    // explicit override.
    if (!data.reportedBy) {
      data.reportedBy = getUserId();
    }
    const occurrence = await createTripOccurrence(database, data);
    reply.code(201);
    return { occurrence };
  });

  app.patch<{ Params: { id: string } }>(
    '/operations/occurrences/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const existing = await getTripOccurrenceById(database, request.params.id);
      if (!existing) {
        throw new NotFoundError('Occurrence not found');
      }
      const data = parseUpdateOccurrenceInput(request.body);
      const occurrence = await updateTripOccurrence(database, request.params.id, data);
      if (!occurrence) {
        throw new NotFoundError('Occurrence not found');
      }
      return { occurrence };
    },
  );

  // ============================================================
  // PÓS-VIAGEM
  // ============================================================
  app.get('/operations/post-trip', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const trips = await listCompletedTripsWithChecklist(database);
    return { trips };
  });

  app.patch<{ Params: { tripId: string; itemKey: string } }>(
    '/operations/post-trip/:tripId/:itemKey',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const { tripId, itemKey } = request.params;
      if (!POST_TRIP_CHECKLIST_ITEMS.includes(itemKey as PostTripChecklistItemKey)) {
        throw new ValidationError(`Unknown checklist item "${itemKey}"`);
      }
      const body = asRecord(request.body);
      const done = requireBooleanField(body, 'done');
      const notes = optionalString(body, 'notes');
      const item = await setPostTripChecklistItem(
        database,
        tripId,
        itemKey as PostTripChecklistItemKey,
        done,
        notes,
      );
      return { item };
    },
  );
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  return body as Record<string, unknown>;
}

function requireStringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required and must be a non-empty string`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string`);
  }
  return value;
}

function requireBooleanField(record: Record<string, unknown>, field: string): boolean {
  const value = record[field];
  if (typeof value !== 'boolean') {
    throw new ValidationError(`Field "${field}" is required and must be a boolean`);
  }
  return value;
}

function requireEnum<T extends string>(
  record: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T {
  const value = record[field];
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`Field "${field}" must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function optionalEnum<T extends string>(
  record: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  return requireEnum(record, field, allowed);
}

function parseCreateOccurrenceInput(body: unknown): CreateTripOccurrenceInput {
  const record = asRecord(body);
  const data: CreateTripOccurrenceInput = {
    tripId: requireStringField(record, 'tripId'),
    type: requireEnum(record, 'type', OCCURRENCE_TYPES),
    description: requireStringField(record, 'description'),
    reportedBy: optionalString(record, 'reportedBy') ?? '',
  };
  const bookingId = optionalString(record, 'bookingId');
  if (bookingId !== undefined) data.bookingId = bookingId;
  const severity = optionalEnum(record, 'severity', OCCURRENCE_SEVERITIES);
  if (severity !== undefined) data.severity = severity;
  const notes = optionalString(record, 'notes');
  if (notes !== undefined) data.notes = notes;
  return data;
}

function parseUpdateOccurrenceInput(body: unknown): UpdateTripOccurrenceInput {
  const record = asRecord(body);
  const data: UpdateTripOccurrenceInput = {};
  const status = optionalEnum(record, 'status', OCCURRENCE_STATUSES);
  if (status !== undefined) data.status = status;
  const severity = optionalEnum(record, 'severity', OCCURRENCE_SEVERITIES);
  if (severity !== undefined) data.severity = severity;
  const description = optionalString(record, 'description');
  if (description !== undefined) data.description = description;
  const notes = optionalString(record, 'notes');
  if (notes !== undefined) data.notes = notes;
  return data;
}
