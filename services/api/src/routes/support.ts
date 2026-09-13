/**
 * Support -- HTTP surface for agency support tickets.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { getTenantContext } from '../../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import { createAgencySupportTicket } from '../platform-services';

export interface SupportRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerSupportRoutes(
  app: FastifyInstance,
  options: SupportRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.post<{
    Body: {
      title: string;
      description: string;
      priority?: string;
      route?: string;
      appVersion?: string;
      buildSha?: string;
      browser?: string;
    };
  }>('/support/tickets', { preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    const body = request.body ?? ({} as (typeof request)['body']);

    if (!body.title?.trim() || !body.description?.trim()) {
      throw new ValidationError('title and description are required');
    }

    const supportCase: unknown = await createAgencySupportTicket(database, {
      agencyId: context.agencyId,
      userId: context.userId,
      requestId: request.requestId ?? request.id,
      correlationId: request.correlationId ?? request.id,
      title: body.title,
      description: body.description,
      priority: body.priority,
      route: body.route,
      appVersion: body.appVersion,
      buildSha: body.buildSha,
      browser: body.browser,
    });

    reply.code(201);
    return { supportCase };
  });
}
