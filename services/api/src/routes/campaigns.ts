/**
 * Campaigns -- HTTP surface for campaign CRUD, offer linking, and status transitions.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { CampaignStatus, PlatformFeature, UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import {
  createCampaign,
  getCampaignById,
  linkOfferToCampaign,
  listCampaigns,
  transitionCampaignStatus,
  type CreateCampaignInput,
} from '../campaigns';
import { requireEntitlement } from '../entitlements';
import {
  parseObjectBody,
  parseRequiredDate,
  parseRequiredString,
  requireStringField,
} from '../request-parsing';

export interface CampaignsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerCampaignsRoutes(
  app: FastifyInstance,
  options: CampaignsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/campaigns', { preHandler: protectedHooks }, async () => {
    await requireEntitlement(database, PlatformFeature.CAMPAIGNS);
    requireRole(UserRole.VIEWER);
    const campaigns = await listCampaigns(database);
    return { campaigns };
  });

  app.get<{ Params: { id: string } }>(
    '/campaigns/:id',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(database, PlatformFeature.CAMPAIGNS);
      requireRole(UserRole.VIEWER);
      const campaign = await getCampaignById(database, request.params.id);
      return { campaign };
    }
  );

  app.post('/campaigns', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(database, PlatformFeature.CAMPAIGNS);
    requireRole(UserRole.AGENT);
    const data = parseCreateCampaignInput(request.body);
    const campaign = await createCampaign(database, data);
    reply.code(201);
    return { campaign };
  });

  app.post<{ Params: { id: string }; Body: { offerId: string } }>(
    '/campaigns/:id/offers',
    { preHandler: protectedHooks },
    async (request, reply) => {
      await requireEntitlement(database, PlatformFeature.CAMPAIGNS);
      requireRole(UserRole.AGENT);
      const offerId = requireStringField(request.body, 'offerId');
      await linkOfferToCampaign(database, request.params.id, offerId);
      reply.code(204);
    }
  );

  app.post<{ Params: { id: string }; Body: { status: string } }>(
    '/campaigns/:id/status',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(database, PlatformFeature.CAMPAIGNS);
      const status = parseCampaignStatus(request.body?.status);
      requireRole(status === CampaignStatus.ACTIVE ? UserRole.MANAGER : UserRole.AGENT);
      const campaign = await transitionCampaignStatus(database, request.params.id, status);
      return { campaign };
    }
  );
}

const VALID_CAMPAIGN_STATUSES = Object.values(CampaignStatus);

function parseCampaignStatus(value: unknown): CampaignStatus {
  if (typeof value !== 'string' || !(VALID_CAMPAIGN_STATUSES as string[]).includes(value)) {
    throw new ValidationError(
      `Field "status" must be one of: ${VALID_CAMPAIGN_STATUSES.join(', ')}`,
    );
  }
  return value as CampaignStatus;
}

function parseCreateCampaignInput(body: unknown): CreateCampaignInput {
  const record = parseObjectBody(body);
  const name = parseRequiredString(record.name, 'name');

  const data: CreateCampaignInput = { name };

  if (record.description !== undefined) {
    if (typeof record.description !== 'string') {
      throw new ValidationError('Field "description" must be a string');
    }
    data.description = record.description;
  }

  if (record.startsAt !== undefined) {
    data.startsAt = parseRequiredDate(record.startsAt, 'startsAt');
  }

  if (record.endsAt !== undefined) {
    data.endsAt = parseRequiredDate(record.endsAt, 'endsAt');
  }

  if (record.publicationStartsAt !== undefined) {
    data.publicationStartsAt = parseRequiredDate(record.publicationStartsAt, 'publicationStartsAt');
  }

  if (record.publicationEndsAt !== undefined) {
    data.publicationEndsAt = parseRequiredDate(record.publicationEndsAt, 'publicationEndsAt');
  }

  if (record.timezone !== undefined) {
    data.timezone = parseRequiredString(record.timezone, 'timezone');
  }

  if (record.offerIds !== undefined) {
    if (!Array.isArray(record.offerIds)) throw new ValidationError('Field "offerIds" must be an array');
    data.offerIds = record.offerIds as string[];
  }

  return data;
}
