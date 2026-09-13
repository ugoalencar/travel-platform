/**
 * PARTNER CAMPAIGNS (Agent 10) -- external-partner advertising campaigns --
 * placements across staff dashboard, proposal, trip, customer portal,
 * catalog. Distinct from the internal "offer growth" /campaigns routes
 * (different table, different module -- see routes/campaigns.ts). RBAC
 * floor: read = VIEWER+, create/write = AGENT+, status transitions
 * (activate/pause/complete) = MANAGER+.
 *
 * Registered as one unit from app.ts, same convention as routes/offers.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { getTenantContext, requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import { requireStringField } from '../request-parsing';
import {
  createCampaignPartnerStub,
  createCampaignPlacement,
  createPartnerCampaign,
  getCampaignAttributionSummary,
  getPartnerCampaignById,
  listCampaignPartnerStubs,
  listCampaignPlacements,
  listCampaignProducts,
  listActiveCampaignsForLocation,
  listPartnerCampaigns,
  recordCampaignAttribution,
  transitionPartnerCampaignStatus,
  CampaignPlacementLocation,
  type CampaignAttributionEventType,
  type CreatePartnerCampaignInput,
  type PartnerCampaignStatus,
} from '../partner-campaigns';

export interface PartnerCampaignsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerPartnerCampaignsRoutes(
  app: FastifyInstance,
  options: PartnerCampaignsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/partner-campaign-partners', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const partners = await database.withTenantTransaction((client) =>
      listCampaignPartnerStubs(client),
    );
    return { partners };
  });

  app.post('/partner-campaign-partners', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const name = requireStringField(request.body, 'name');
    const partner = await database.withTenantTransaction((client) =>
      createCampaignPartnerStub(client, name),
    );
    reply.code(201);
    return { partner };
  });

  app.get('/partner-campaigns', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const campaigns = await database.withTenantTransaction((client) =>
      listPartnerCampaigns(client),
    );
    return { campaigns };
  });

  app.get<{ Querystring: { location: string } }>(
    '/partner-campaigns/active',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const location = request.query.location;
      if (!Object.values(CampaignPlacementLocation).includes(location as CampaignPlacementLocation)) {
        throw new ValidationError('Query param "location" must be a valid CampaignPlacementLocation');
      }
      const campaigns = await database.withTenantTransaction((client) =>
        listActiveCampaignsForLocation(client, location as CampaignPlacementLocation),
      );
      return { campaigns };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/partner-campaigns/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const campaign = await database.withTenantTransaction((client) =>
        getPartnerCampaignById(client, request.params.id),
      );
      return { campaign };
    }
  );

  app.post('/partner-campaigns', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = request.body as CreatePartnerCampaignInput;
    const campaign = await database.withTenantTransaction((client) =>
      createPartnerCampaign(client, data),
    );
    reply.code(201);
    return { campaign };
  });

  app.post<{ Params: { id: string }; Body: { status: string } }>(
    '/partner-campaigns/:id/status',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const status = requireStringField(request.body, 'status') as PartnerCampaignStatus;
      const campaign = await database.withTenantTransaction((client) =>
        transitionPartnerCampaignStatus(client, request.params.id, status),
      );
      return { campaign };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/partner-campaigns/:id/products',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const products = await database.withTenantTransaction((client) =>
        listCampaignProducts(client, request.params.id),
      );
      return { products };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/partner-campaigns/:id/placements',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const placements = await database.withTenantTransaction((client) =>
        listCampaignPlacements(client, request.params.id),
      );
      return { placements };
    }
  );

  app.post<{ Params: { id: string }; Body: { location: string } }>(
    '/partner-campaigns/:id/placements',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      const location = requireStringField(request.body, 'location') as CampaignPlacementLocation;
      const placement = await database.withTenantTransaction((client) =>
        createCampaignPlacement(client, request.params.id, location),
      );
      reply.code(201);
      return { placement };
    }
  );

  app.post<{
    Params: { id: string };
    Body: { placementId: string; eventType: string; customerId?: string; metadata?: Record<string, unknown> };
  }>(
    '/partner-campaigns/:id/attributions',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.VIEWER);
      const placementId = requireStringField(request.body, 'placementId');
      const eventType = requireStringField(request.body, 'eventType') as CampaignAttributionEventType;
      const tenantContext = getTenantContext();
      const attributionInput: Parameters<typeof recordCampaignAttribution>[1] = {
        campaignId: request.params.id,
        placementId,
        eventType,
        userId: tenantContext.userId,
        ...(request.body.customerId !== undefined ? { customerId: request.body.customerId } : {}),
        ...(request.body.metadata !== undefined ? { metadata: request.body.metadata } : {}),
      };
      await database.withTenantTransaction((client) =>
        recordCampaignAttribution(client, attributionInput),
      );
      reply.code(204);
    }
  );

  app.get<{ Params: { id: string } }>(
    '/partner-campaigns/:id/attributions/summary',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const summary = await database.withTenantTransaction((client) =>
        getCampaignAttributionSummary(client, request.params.id),
      );
      return { summary };
    }
  );
}
