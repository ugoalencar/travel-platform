/**
 * Enrollment -- staff-facing enrollment link and submission management,
 * plus public token-only enrollment submission flow.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import type { DatabaseRuntime } from '../database';
import { NotFoundError, ValidationError } from '../errors';
import {
  createEnrollmentLink,
  listEnrollmentLinks,
  revokeEnrollmentLink,
  resolvePublicEnrollmentToken,
  submitEnrollment,
  listEnrollmentSubmissions,
  getEnrollmentSubmissionById,
  requestEnrollmentChanges,
  approveEnrollmentSubmission,
  type SubmitEnrollmentInput,
} from '../enrollment';

export interface EnrollmentRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerEnrollmentRoutes(
  app: FastifyInstance,
  options: EnrollmentRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  // Staff-facing enrollment link management
  app.post('/enrollment-links', { preHandler: protectedHooks }, async (request, reply) => {
    const body = parseCreateEnrollmentLinkInput(request.body);
    const { link, token } = await createEnrollmentLink(database, body);
    reply.code(201);
    return { link, token };
  });

  app.get('/enrollment-links', { preHandler: protectedHooks }, async () => {
    const links = await listEnrollmentLinks(database);
    return { links };
  });

  app.post<{ Params: { id: string } }>(
    '/enrollment-links/:id/revoke',
    { preHandler: protectedHooks },
    async (request) => {
      const link = await revokeEnrollmentLink(database, request.params.id);
      if (!link) {
        throw new NotFoundError('Enrollment link not found');
      }
      return { link };
    }
  );

  // Staff-facing enrollment submission management
  app.get('/enrollment-submissions', { preHandler: protectedHooks }, async () => {
    const submissions = await listEnrollmentSubmissions(database);
    return { submissions };
  });

  app.get<{ Params: { id: string } }>(
    '/enrollment-submissions/:id',
    { preHandler: protectedHooks },
    async (request) => {
      const submission = await getEnrollmentSubmissionById(database, request.params.id);
      if (!submission) {
        throw new NotFoundError('Enrollment submission not found');
      }
      return { submission };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/enrollment-submissions/:id/request-changes',
    { preHandler: protectedHooks },
    async (request) => {
      const notes = parseRequestChangesInput(request.body);
      const submission = await requestEnrollmentChanges(database, request.params.id, {
        notes,
      });
      if (!submission) {
        throw new NotFoundError('Enrollment submission not found or not awaiting review');
      }
      return { submission };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/enrollment-submissions/:id/approve',
    { preHandler: protectedHooks },
    async (request) => {
      const notes = parseOptionalReviewNotes(request.body);
      const result = await approveEnrollmentSubmission(database, request.params.id, notes);
      return result;
    }
  );

  // Public enrollment (unauthenticated, token-only)
  app.get<{ Params: { token: string } }>('/enrollment-api/:token', async (request, reply) => {
    const resolved = await resolvePublicEnrollmentToken(database, request.params.token);
    if (!resolved) {
      return reply.code(404).send({ error: 'Link not found', code: 'NOT_FOUND' });
    }
    return { valid: true };
  });

  app.post<{ Params: { token: string } }>(
    '/enrollment-api/:token/submit',
    async (request, reply) => {
      const resolved = await resolvePublicEnrollmentToken(database, request.params.token);
      if (!resolved) {
        return reply.code(404).send({ error: 'Link not found', code: 'NOT_FOUND' });
      }

      const input = parseSubmitEnrollmentInput(request.body, request.ip);
      const submission = await submitEnrollment(
        database,
        resolved,
        request.params.token,
        input
      );
      reply.code(201);
      return {
        submission: {
          id: submission.id,
          status: submission.status,
          protocolNumber: submission.protocolNumber,
        },
      };
    }
  );
}

// ============================================================
// Parsers
// ============================================================

function parseCreateEnrollmentLinkInput(body: unknown): {
  ownerUserId?: string;
  label?: string;
  ttlDays?: number;
} {
  if (body === undefined || body === null) {
    return {};
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;
  const data: { ownerUserId?: string; label?: string; ttlDays?: number } = {};

  if (record.ownerUserId !== undefined) {
    if (typeof record.ownerUserId !== 'string' || record.ownerUserId.trim().length === 0) {
      throw new ValidationError('Field "ownerUserId" must be a non-empty string');
    }
    data.ownerUserId = record.ownerUserId;
  }
  if (record.label !== undefined) {
    if (typeof record.label !== 'string') {
      throw new ValidationError('Field "label" must be a string');
    }
    data.label = record.label;
  }
  if (record.ttlDays !== undefined) {
    if (typeof record.ttlDays !== 'number' || !Number.isInteger(record.ttlDays)) {
      throw new ValidationError('Field "ttlDays" must be an integer');
    }
    data.ttlDays = record.ttlDays;
  }

  return data;
}

function parseRequestChangesInput(body: unknown): string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;
  if (typeof record.notes !== 'string' || record.notes.trim().length === 0) {
    throw new ValidationError('Field "notes" is required and must be a non-empty string');
  }
  return record.notes;
}

function parseOptionalReviewNotes(body: unknown): string | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;
  if (record.notes === undefined) {
    return undefined;
  }
  if (typeof record.notes !== 'string') {
    throw new ValidationError('Field "notes" must be a string');
  }
  return record.notes;
}

const ALLOWED_ENROLLMENT_SUBMIT_FIELDS = [
  'fullName',
  'email',
  'phone',
  'cpf',
  'birthDate',
  'dependents',
  'wishDestination',
  'wishNotes',
  'consentGiven',
  'consentTextVersion',
] as const;

function parseSubmitEnrollmentInput(body: unknown, requestIp: string): SubmitEnrollmentInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_ENROLLMENT_SUBMIT_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.fullName !== 'string' || record.fullName.trim().length === 0) {
    throw new ValidationError('Field "fullName" is required and must be a non-empty string');
  }
  if (typeof record.consentGiven !== 'boolean' || record.consentGiven !== true) {
    throw new ValidationError('Consentimento (LGPD) e obrigatorio para enviar o cadastro');
  }

  const data: SubmitEnrollmentInput = {
    fullName: record.fullName,
    consentGiven: true,
    consentIp: requestIp,
  };

  for (const field of ['email', 'phone', 'cpf', 'birthDate', 'wishDestination', 'wishNotes', 'consentTextVersion'] as const) {
    const value = record[field];
    if (value !== undefined) {
      if (typeof value !== 'string') {
        throw new ValidationError(`Field "${field}" must be a string`);
      }
      data[field] = value;
    }
  }

  if (record.dependents !== undefined) {
    if (!Array.isArray(record.dependents)) {
      throw new ValidationError('Field "dependents" must be an array');
    }
    data.dependents = record.dependents.map((entry, index) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new ValidationError(`dependents[${index}] must be an object`);
      }
      const dependentRecord = entry as Record<string, unknown>;
      if (typeof dependentRecord.name !== 'string' || dependentRecord.name.trim().length === 0) {
        throw new ValidationError(`dependents[${index}].name is required`);
      }
      return {
        name: dependentRecord.name,
        ...(typeof dependentRecord.birthDate === 'string' ? { birthDate: dependentRecord.birthDate } : {}),
        ...(typeof dependentRecord.relationship === 'string'
          ? { relationship: dependentRecord.relationship }
          : {}),
      };
    });
  }

  return data;
}
