/**
 * Operations Staff -- field operations (TransportOperation / OperationCheckpoint),
 * operational staff management, and operation assignments.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { getUserId, requireRole } from '../../../../packages/domain/tenant-context';
import {
  OperationAssignmentRole,
  OperationalStaffCapability,
  UserRole,
} from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { NotFoundError, ValidationError } from '../errors';
import {
  confirmArrival,
  confirmDeparture,
  createOperationAssignment,
  createOperationalStaff,
  createOperation,
  getOperationById,
  listOperations,
  type CreateOperationAssignmentInput,
  type CreateOperationInput,
  type CreateOperationalStaffInput,
} from '../transport-operations';

export interface OperationsStaffRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerOperationsStaffRoutes(
  app: FastifyInstance,
  options: OperationsStaffRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/operations', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const operations = await listOperations(database);
    return { operations };
  });

  app.post('/operational-staff', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = parseCreateOperationalStaffInput(request.body);
    const staff = await createOperationalStaff(database, data);
    reply.code(201);
    return { staff };
  });

  app.get<{ Params: { id: string } }>(
    '/operations/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const result = await getOperationById(database, request.params.id);
      if (!result) {
        throw new NotFoundError('Operation not found');
      }
      return result;
    }
  );

  app.post('/operations', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateOperationInput(request.body);
    const result = await createOperation(database, data);
    reply.code(201);
    return result;
  });

  app.post<{ Params: { id: string } }>(
    '/operations/:id/assignments',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const data = parseCreateOperationAssignmentInput(request.params.id, request.body);
      const assignment = await createOperationAssignment(database, {
        ...data,
        createdByUserId: getUserId(),
      });
      reply.code(201);
      return { assignment };
    }
  );

  app.post<{ Params: { id: string; checkpointId: string } }>(
    '/operations/:id/checkpoints/:checkpointId/arrival',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const checkpoint = await confirmArrival(
        database,
        request.params.id,
        request.params.checkpointId
      );
      return { checkpoint };
    }
  );

  app.post<{ Params: { id: string; checkpointId: string } }>(
    '/operations/:id/checkpoints/:checkpointId/departure',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const checkpoint = await confirmDeparture(
        database,
        request.params.id,
        request.params.checkpointId
      );
      return { checkpoint };
    }
  );
}

// ============================================================
// Parsers
// ============================================================

function parseCreateOperationInput(body: unknown): CreateOperationInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const field of ['agencyId', 'tenantId', 'id', 'createdAt', 'updatedAt'] as const) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (key !== 'departureId') {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.departureId !== 'string' || record.departureId.trim().length === 0) {
    throw new ValidationError('Field "departureId" is required and must be a non-empty string');
  }

  return { departureId: record.departureId };
}

function parseCreateOperationalStaffInput(body: unknown): CreateOperationalStaffInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;
  const allowed = ['userId', 'name', 'phone', 'email', 'capabilities'] as const;

  for (const field of ['agencyId', 'tenantId', 'id', 'active', 'createdAt', 'updatedAt'] as const) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(allowed as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }
  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    throw new ValidationError('Field "name" is required and must be a non-empty string');
  }
  if (!Array.isArray(record.capabilities) || record.capabilities.length === 0) {
    throw new ValidationError('Field "capabilities" is required and must be a non-empty array');
  }

  const capabilities = record.capabilities.map((capability) => {
    if (
      typeof capability !== 'string' ||
      !(Object.values(OperationalStaffCapability) as string[]).includes(capability)
    ) {
      throw new ValidationError('Field "capabilities" must contain only DRIVER or GUIDE');
    }
    return capability as OperationalStaffCapability;
  });

  const data: CreateOperationalStaffInput = {
    name: record.name,
    capabilities,
  };

  if (record.userId !== undefined) {
    if (typeof record.userId !== 'string' || record.userId.trim().length === 0) {
      throw new ValidationError('Field "userId" must be a non-empty string');
    }
    data.userId = record.userId;
  }
  if (record.phone !== undefined) {
    if (typeof record.phone !== 'string') {
      throw new ValidationError('Field "phone" must be a string');
    }
    data.phone = record.phone;
  }
  if (record.email !== undefined) {
    if (typeof record.email !== 'string') {
      throw new ValidationError('Field "email" must be a string');
    }
    data.email = record.email;
  }

  return data;
}

function parseCreateOperationAssignmentInput(
  operationId: string,
  body: unknown
): Omit<CreateOperationAssignmentInput, 'createdByUserId'> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;
  const allowed = ['operationalStaffId', 'role'] as const;

  for (const field of [
    'agencyId',
    'tenantId',
    'id',
    'operationId',
    'createdByUserId',
    'createdAt',
  ] as const) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(allowed as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }
  if (
    typeof record.operationalStaffId !== 'string' ||
    record.operationalStaffId.trim().length === 0
  ) {
    throw new ValidationError(
      'Field "operationalStaffId" is required and must be a non-empty string'
    );
  }
  if (
    typeof record.role !== 'string' ||
    !(Object.values(OperationAssignmentRole) as string[]).includes(record.role)
  ) {
    throw new ValidationError('Field "role" must be one of DRIVER, GUIDE');
  }

  return {
    operationId,
    operationalStaffId: record.operationalStaffId,
    role: record.role as OperationAssignmentRole,
  };
}
