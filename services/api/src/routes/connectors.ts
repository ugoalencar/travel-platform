/**
 * Connectors -- HTTP surface for internal mock connector simulation.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { getAgencyId, requireRole } from '../../../../packages/domain/tenant-context';
import { PlatformFeature, UserRole } from '../../../../packages/domain/types';
import type { ConnectorEvent } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { processConnectorEvent } from '../automations';
import { requireEntitlement } from '../entitlements';
import type { InternalMockConnector } from '../connectors/mock-connector';

export interface ConnectorsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
  mockConnector: InternalMockConnector;
}

export function registerConnectorsRoutes(
  app: FastifyInstance,
  options: ConnectorsRoutesOptions,
): void {
  const { database, protectedHooks, mockConnector } = options;

  app.post<{
    Body: {
      kind: 'comment' | 'message';
      externalUserId: string;
      content: string;
      campaignId?: string;
      publicationId?: string;
      offerId?: string;
    };
  }>('/connectors/internal-mock/simulate', { preHandler: protectedHooks }, async (request) => {
    await requireEntitlement(database, PlatformFeature.SOCIAL_AUTOMATION);
    requireRole(UserRole.AGENT);
    const agencyId = getAgencyId();
    const body = request.body ?? ({} as never);
    const event: ConnectorEvent =
      body.kind === 'message'
        ? mockConnector.simulateMessage({
            agencyId,
            externalUserId: body.externalUserId,
            content: body.content,
          })
        : mockConnector.simulateComment({
            agencyId,
            externalUserId: body.externalUserId,
            content: body.content,
          });

    const result = await processConnectorEvent(database, mockConnector, event, {
      ...(body.campaignId !== undefined ? { campaignId: body.campaignId } : {}),
      ...(body.publicationId !== undefined ? { publicationId: body.publicationId } : {}),
      ...(body.offerId !== undefined ? { offerId: body.offerId } : {}),
    });
    return result;
  });
}
