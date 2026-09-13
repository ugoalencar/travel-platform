/**
 * Commercial Partners (Agent 04) -- three distinct surfaces:
 *  1. Staff-facing (protectedHooks) CRUD for CommercialPartner /
 *     PartnerContract / PartnerLink / PartnerCommission.
 *  2. Partner portal (partnerHooks, self-scope read-only) -- a partner only
 *     ever sees rows filtered by their own resolved partnerId, never a
 *     staff/admin data-access function.
 *  3. Public partner link resolve/convert (unauthenticated, token-only) --
 *     mirrors the enrollment-api pattern exactly.
 *
 * Registered as one unit from app.ts, same convention as routes/offers.ts
 * and routes/customer-portal.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { getUserId } from '../../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from '../database';
import { NotFoundError, ValidationError } from '../errors';
import {
  parseNonNegativeNumber,
  parseObjectBody,
  parseRequiredString,
} from '../request-parsing';
import {
  createPartner,
  createPartnerContract,
  getPartnerById,
  listPartnerContracts,
  listPartners,
  updatePartner,
  type CreatePartnerContractInput,
  type CreatePartnerInput,
  type UpdatePartnerInput,
} from '../partners';
import {
  attachSaleToAttribution,
  convertPartnerLink,
  createPartnerLink,
  listPartnerLinks,
  resolvePublicPartnerLink,
  revokePartnerLink,
  type ConvertPartnerLinkInput,
  type CreatePartnerLinkInput,
} from '../partner-links';
import {
  approvePartnerCommission,
  createPayableFromPartnerCommission,
  generatePartnerCommission,
  listPartnerCommissions,
  type GeneratePartnerCommissionInput,
} from '../partner-commissions';
import {
  getMyPartnerAttributions,
  getMyPartnerCommissions,
  getMyPartnerContracts,
  getMyPartnerLinks,
  getMyPartnerProfile,
} from '../partner-portal';

export interface PartnersRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
  partnerHooks: preHandlerHookHandler[];
}

export function registerPartnersRoutes(
  app: FastifyInstance,
  options: PartnersRoutesOptions,
): void {
  const { database, protectedHooks, partnerHooks } = options;

  // ============================================================
  // Partner portal (self-scope, read-only).
  // ============================================================
  app.get('/partner-api/me', { preHandler: partnerHooks }, async () => {
    const profile = await getMyPartnerProfile(database);
    if (!profile) {
      throw new NotFoundError('Partner profile not found');
    }
    return { profile };
  });

  app.get('/partner-api/contracts', { preHandler: partnerHooks }, async () => {
    const contracts = await getMyPartnerContracts(database);
    return { contracts };
  });

  app.get('/partner-api/attributions', { preHandler: partnerHooks }, async () => {
    const attributions = await getMyPartnerAttributions(database);
    return { attributions };
  });

  app.get('/partner-api/commissions', { preHandler: partnerHooks }, async () => {
    const commissions = await getMyPartnerCommissions(database);
    return { commissions };
  });

  app.get('/partner-api/links', { preHandler: partnerHooks }, async () => {
    const links = await getMyPartnerLinks(database);
    return { links };
  });

  // ============================================================
  // Public partner link resolve/convert (unauthenticated, token-only).
  // ============================================================
  app.get<{ Params: { token: string } }>('/partner-link-api/:token', async (request, reply) => {
    const resolved = await resolvePublicPartnerLink(database, request.params.token);
    if (!resolved) {
      return reply.code(404).send({ error: 'Link not found', code: 'NOT_FOUND' });
    }
    return { valid: true };
  });

  app.post<{ Params: { token: string } }>(
    '/partner-link-api/:token/convert',
    async (request, reply) => {
      const resolved = await resolvePublicPartnerLink(database, request.params.token);
      if (!resolved) {
        return reply.code(404).send({ error: 'Link not found', code: 'NOT_FOUND' });
      }

      const input = parseConvertPartnerLinkInput(request.body);
      const result = await convertPartnerLink(database, resolved, request.params.token, input);
      reply.code(201);
      return result;
    }
  );

  // ============================================================
  // Commercial Partners (Agent 04): staff-facing CRUD.
  // ============================================================
  app.post('/partners', { preHandler: protectedHooks }, async (request, reply) => {
    const input = parseCreatePartnerInput(request.body);
    const partner = await createPartner(database, input);
    reply.code(201);
    return { partner };
  });

  app.get('/partners', { preHandler: protectedHooks }, async () => {
    const partners = await listPartners(database);
    return { partners };
  });

  app.get<{ Params: { id: string } }>(
    '/partners/:id',
    { preHandler: protectedHooks },
    async (request) => {
      const partner = await getPartnerById(database, request.params.id);
      if (!partner) {
        throw new NotFoundError('Partner not found');
      }
      return { partner };
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/partners/:id',
    { preHandler: protectedHooks },
    async (request) => {
      const input = parseUpdatePartnerInput(request.body);
      const partner = await updatePartner(database, request.params.id, input);
      if (!partner) {
        throw new NotFoundError('Partner not found');
      }
      return { partner };
    }
  );

  app.post('/partner-contracts', { preHandler: protectedHooks }, async (request, reply) => {
    const input = parseCreatePartnerContractInput(request.body);
    const contract = await createPartnerContract(database, input);
    reply.code(201);
    return { contract };
  });

  app.get<{ Querystring: { partnerId?: string } }>(
    '/partner-contracts',
    { preHandler: protectedHooks },
    async (request) => {
      const contracts = await listPartnerContracts(database, request.query.partnerId);
      return { contracts };
    }
  );

  app.post('/partner-links', { preHandler: protectedHooks }, async (request, reply) => {
    const input = parseCreatePartnerLinkInput(request.body);
    const { link, token } = await createPartnerLink(database, input);
    reply.code(201);
    // The raw token is returned exactly once, here, at creation time --
    // never persisted, never returned by any other endpoint.
    return { link, token };
  });

  app.get<{ Querystring: { partnerId?: string } }>(
    '/partner-links',
    { preHandler: protectedHooks },
    async (request) => {
      const links = await listPartnerLinks(database, request.query.partnerId);
      return { links };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/partner-links/:id/revoke',
    { preHandler: protectedHooks },
    async (request) => {
      const link = await revokePartnerLink(database, request.params.id);
      if (!link) {
        throw new NotFoundError('Partner link not found or already revoked');
      }
      return { link };
    }
  );

  app.post<{ Params: { customerId: string; saleId: string } }>(
    '/partner-attributions/:customerId/attach-sale/:saleId',
    { preHandler: protectedHooks },
    async (request) => {
      const result = await attachSaleToAttribution(
        database,
        request.params.customerId,
        request.params.saleId
      );
      if (!result) {
        throw new NotFoundError('No open partner attribution found for this customer');
      }
      return result;
    }
  );

  app.post('/partner-commissions', { preHandler: protectedHooks }, async (request, reply) => {
    const input = parseGeneratePartnerCommissionInput(request.body);
    const commission = await generatePartnerCommission(database, input);
    reply.code(201);
    return { commission };
  });

  app.get<{ Querystring: { partnerId?: string; saleId?: string; status?: string } }>(
    '/partner-commissions',
    { preHandler: protectedHooks },
    async (request) => {
      const commissions = await listPartnerCommissions(database, {
        ...(request.query.partnerId ? { partnerId: request.query.partnerId } : {}),
        ...(request.query.saleId ? { saleId: request.query.saleId } : {}),
        ...(request.query.status ? { status: request.query.status } : {}),
      });
      return { commissions };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/partner-commissions/:id/approve',
    { preHandler: protectedHooks },
    async (request) => {
      const approvedBy = getUserId();
      const commission = await approvePartnerCommission(database, request.params.id, approvedBy);
      if (!commission) {
        throw new NotFoundError('Partner commission not found');
      }
      return { commission };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/partner-commissions/:id/create-payable',
    { preHandler: protectedHooks },
    async (request) => {
      const result = await createPayableFromPartnerCommission(database, request.params.id);
      return result;
    }
  );
}

// ============================================================
// Commercial Partners (Agent 04): request parsing.
// ============================================================
function parseCreatePartnerInput(body: unknown): CreatePartnerInput {
  const record = parseObjectBody(body);
  const partnerType = record.partnerType;
  if (partnerType !== 'PF' && partnerType !== 'PJ') {
    throw new ValidationError('Field "partnerType" must be "PF" or "PJ"');
  }
  const name = parseRequiredString(record.name, 'name');

  const input: CreatePartnerInput = { partnerType, name };
  for (const field of [
    'document',
    'email',
    'phone',
    'managerUserId',
    'bankName',
    'bankBranch',
    'bankAccount',
    'bankPixKey',
    'notes',
  ] as const) {
    if (record[field] !== undefined) {
      if (typeof record[field] !== 'string') {
        throw new ValidationError(`Field "${field}" must be a string`);
      }
      (input as unknown as Record<string, unknown>)[field] = record[field];
    }
  }
  return input;
}

function parseUpdatePartnerInput(body: unknown): UpdatePartnerInput {
  const record = parseObjectBody(body);
  const input: UpdatePartnerInput = {};

  if (record.status !== undefined) {
    if (record.status !== 'ACTIVE' && record.status !== 'INACTIVE') {
      throw new ValidationError('Field "status" must be "ACTIVE" or "INACTIVE"');
    }
    input.status = record.status;
  }
  for (const field of [
    'name',
    'document',
    'email',
    'phone',
    'managerUserId',
    'bankName',
    'bankBranch',
    'bankAccount',
    'bankPixKey',
    'notes',
  ] as const) {
    if (record[field] !== undefined) {
      if (typeof record[field] !== 'string') {
        throw new ValidationError(`Field "${field}" must be a string`);
      }
      (input as unknown as Record<string, unknown>)[field] = record[field];
    }
  }
  return input;
}

function parseCreatePartnerContractInput(body: unknown): CreatePartnerContractInput {
  const record = parseObjectBody(body);
  const partnerId = parseRequiredString(record.partnerId, 'partnerId');
  const commissionPercentage = parseNonNegativeNumber(record.commissionPercentage, 'commissionPercentage');

  const input: CreatePartnerContractInput = { partnerId, commissionPercentage };
  for (const field of ['terms', 'startsAt', 'endsAt'] as const) {
    if (record[field] !== undefined) {
      if (typeof record[field] !== 'string') {
        throw new ValidationError(`Field "${field}" must be a string`);
      }
      (input as unknown as Record<string, unknown>)[field] = record[field];
    }
  }
  return input;
}

function parseCreatePartnerLinkInput(body: unknown): CreatePartnerLinkInput {
  const record = parseObjectBody(body);
  const partnerId = parseRequiredString(record.partnerId, 'partnerId');

  const input: CreatePartnerLinkInput = { partnerId };
  if (record.label !== undefined) {
    if (typeof record.label !== 'string') {
      throw new ValidationError('Field "label" must be a string');
    }
    input.label = record.label;
  }
  if (record.targetPath !== undefined) {
    if (typeof record.targetPath !== 'string') {
      throw new ValidationError('Field "targetPath" must be a string');
    }
    input.targetPath = record.targetPath;
  }
  if (record.ttlDays !== undefined) {
    if (typeof record.ttlDays !== 'number' || !Number.isInteger(record.ttlDays)) {
      throw new ValidationError('Field "ttlDays" must be an integer');
    }
    input.ttlDays = record.ttlDays;
  }
  return input;
}

function parseConvertPartnerLinkInput(body: unknown): ConvertPartnerLinkInput {
  const record = parseObjectBody(body);
  const fullName = parseRequiredString(record.fullName, 'fullName');

  const input: ConvertPartnerLinkInput = { fullName };
  for (const field of ['email', 'phone', 'cpf', 'wishDestination', 'wishNotes'] as const) {
    if (record[field] !== undefined) {
      if (typeof record[field] !== 'string') {
        throw new ValidationError(`Field "${field}" must be a string`);
      }
      (input as unknown as Record<string, unknown>)[field] = record[field];
    }
  }
  return input;
}

function parseGeneratePartnerCommissionInput(body: unknown): GeneratePartnerCommissionInput {
  const record = parseObjectBody(body);
  const saleId = parseRequiredString(record.saleId, 'saleId');
  const partnerId = parseRequiredString(record.partnerId, 'partnerId');

  const input: GeneratePartnerCommissionInput = { saleId, partnerId };
  if (record.manualAmount !== undefined) {
    input.manualAmount = parseNonNegativeNumber(record.manualAmount, 'manualAmount');
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    input.notes = record.notes;
  }
  return input;
}
