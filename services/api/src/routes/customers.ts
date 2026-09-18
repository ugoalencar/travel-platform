/**
 * Customer CRM -- HTTP surface for customer CRUD and sub-resource queries
 * (wishes, trips scoped by customerId).
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
  createCustomer,
  getCustomerById,
  listCustomers,
  updateCustomer,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from '../customers';
import { listWishesByCustomer } from '../wishes';
import { listTripsByCustomer } from '../trips';
import { NotFoundError, ValidationError } from '../errors';
import { grantCustomerPortalAccess, sendCustomerPortalActivationEmail } from '../customer-portal-access';

export interface CustomerRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerCustomerRoutes(
  app: FastifyInstance,
  options: CustomerRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/customers', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const customers = await listCustomers(database);
    return { customers };
  });

  app.get<{ Params: { id: string } }>(
    '/customers/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const customer = await getCustomerById(database, request.params.id);

      if (!customer) {
        throw new NotFoundError('Customer not found');
      }

      return { customer };
    }
  );

  app.post('/customers', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateCustomerInput(request.body);
    const customer = await createCustomer(database, data);

    reply.code(201);
    return { customer };
  });

  app.patch<{ Params: { id: string } }>(
    '/customers/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const data = parseUpdateCustomerInput(request.body);
      const customer = await updateCustomer(database, request.params.id, data);

      if (!customer) {
        throw new NotFoundError('Customer not found');
      }

      return { customer };
    }
  );

  // CORE-A gap fill: the frontend customer-detail view needs a customer's
  // wishes/trips scoped by customerId, not the full tenant-wide list. Both
  // routes 404 (rather than returning an empty array) when the customer
  // doesn't exist or belongs to another tenant -- same
  // not-found-vs-empty distinction used by every other :id lookup in this
  // file, and it keeps this from being usable as a cross-tenant existence
  // oracle beyond what getCustomerById already exposes.
  app.get<{ Params: { id: string } }>(
    '/customers/:id/wishes',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const customer = await getCustomerById(database, request.params.id);
      if (!customer) {
        throw new NotFoundError('Customer not found');
      }
      const wishes = await listWishesByCustomer(database, request.params.id);
      return { wishes };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/customers/:id/trips',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const customer = await getCustomerById(database, request.params.id);
      if (!customer) {
        throw new NotFoundError('Customer not found');
      }
      const trips = await listTripsByCustomer(database, request.params.id);
      return { trips };
    }
  );

  // Navigable Pilot Flow track: staff-granted Customer Portal access.
  // Sends a real activation email (services/api/src/email) now that a
  // provider is wired. Still returns the raw activationToken in the
  // response too -- unchanged contract, so the existing UI fallback
  // (CustomerPortalAccessCard showing the link) keeps working as a
  // manual-copy backup if delivery fails or in development, matching
  // the same posture as the employee invitation flow.
  app.post<{ Params: { id: string }; Body: { email?: string } }>(
    '/customers/:id/portal-access',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      const email = request.body?.email;
      if (typeof email !== 'string' || email.trim().length === 0) {
        throw new ValidationError('Field "email" is required');
      }
      const result = await grantCustomerPortalAccess(database, request.params.id, email.trim());
      await sendCustomerPortalActivationEmail(result);
      reply.code(201);
      return {
        activationToken: result.activationToken,
        expiresAt: result.expiresAt,
        email: result.email,
      };
    },
  );
}

// ============================================================
// INPUT PARSERS
// ============================================================

const FORBIDDEN_CREATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdBy',
  'deletedAt',
  'createdAt',
  'updatedAt',
  'status',
] as const;

const CUSTOMER_OPTIONAL_STRING_FIELDS = [
  'email',
  'phone',
  'cpf',
  'passport',
  'rg',
  'nationalIdType',
  'birthDate',
  'nationality',
  'whatsapp',
  'socialName',
  'maritalStatus',
  'profession',
  'idIssuingAuthority',
  'idIssuedDate',
  'emergencyContactName',
  'emergencyContactRelationship',
  'emergencyContactPhone',
  'emergencyContactWhatsapp',
  'emergencyContactEmail',
  'emergencyContactNotes',
  'notes',
] as const;

const ALLOWED_CREATE_FIELDS = [
  'name',
  ...CUSTOMER_OPTIONAL_STRING_FIELDS,
  'address',
] as const;

const ALLOWED_UPDATE_FIELDS = [
  'name',
  ...CUSTOMER_OPTIONAL_STRING_FIELDS,
  'address',
] as const;

function parseCreateCustomerInput(body: unknown): CreateCustomerInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_CREATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    throw new ValidationError('Field "name" is required and must be a non-empty string');
  }

  const data: CreateCustomerInput = { name: record.name };

  for (const field of CUSTOMER_OPTIONAL_STRING_FIELDS) {
    const value = record[field];
    if (value !== undefined) {
      if (typeof value !== 'string') {
        throw new ValidationError(`Field "${field}" must be a string`);
      }
      data[field] = value;
    }
  }
  if (record.address !== undefined) {
    if (
      typeof record.address !== 'object' ||
      record.address === null ||
      Array.isArray(record.address)
    ) {
      throw new ValidationError('Field "address" must be an object');
    }
    data.address = record.address as Record<string, unknown>;
  }

  return data;
}

function parseUpdateCustomerInput(body: unknown): UpdateCustomerInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Field "${key}" is not allowed in the request body`);
    }
  }

  const data: UpdateCustomerInput = {};

  if (record.name !== undefined) {
    if (typeof record.name !== 'string' || record.name.trim().length === 0) {
      throw new ValidationError('Field "name" must be a non-empty string');
    }
    data.name = record.name;
  }
  for (const field of CUSTOMER_OPTIONAL_STRING_FIELDS) {
    const value = record[field];
    if (value !== undefined) {
      if (typeof value !== 'string') {
        throw new ValidationError(`Field "${field}" must be a string`);
      }
      data[field] = value;
    }
  }
  if (record.address !== undefined) {
    if (
      typeof record.address !== 'object' ||
      record.address === null ||
      Array.isArray(record.address)
    ) {
      throw new ValidationError('Field "address" must be an object');
    }
    data.address = record.address as Record<string, unknown>;
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}
