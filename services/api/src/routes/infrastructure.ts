/**
 * Infrastructure -- unauthenticated health/version/metrics/readiness endpoints
 * plus authenticated /me and /tenant-proof tenant-identity verification.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { getAgencyId, getTenantContext } from '../../../../packages/domain/tenant-context';
import type { DatabaseRuntime } from '../database';
import { NotFoundError } from '../errors';
import type { MetricsCollector } from '../observability';
import { resolveVersionInfo, type VersionInfo } from '../version';

export interface InfrastructureRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
  versionInfo?: VersionInfo | undefined;
  readinessCheck?: (() => Promise<void>) | undefined;
  metrics: MetricsCollector;
  dbPoolStats?: (() => { total: number; idle: number; waiting: number } | undefined) | undefined;
}

interface AgencyProofRow {
  id: string;
  name: string;
}

export function registerInfrastructureRoutes(
  app: FastifyInstance,
  options: InfrastructureRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/health', () => ({
    status: 'ok',
    service: 'api',
  }));

  app.get('/version', () => options.versionInfo ?? resolveVersionInfo());

  app.get('/metrics', () => {
    const snapshot = options.metrics.snapshot();
    return {
      ...snapshot,
      dbPool: options.dbPoolStats?.() ?? null,
    };
  });

  app.get('/readiness', async (_request, reply) => {
    try {
      await options.readinessCheck?.();
      return {
        status: 'ready',
        service: 'api',
      };
    } catch (error: unknown) {
      app.log.error(
        { errorName: error instanceof Error ? error.name : 'UnknownError' },
        'Readiness check failed'
      );
      reply.code(503);
      return {
        status: 'not_ready',
        service: 'api',
      };
    }
  });

  app.get('/me', { preHandler: protectedHooks }, () => {
    const context = getTenantContext();

    return {
      userId: context.userId,
      agencyId: context.agencyId,
      role: context.userRole,
    };
  });

  app.get('/tenant-proof', { preHandler: protectedHooks }, async () => {
    const agencyId = getAgencyId();
    const agency = await database.withTenantTransaction(async (client) => {
      const result = await client.query<AgencyProofRow>(
        'SELECT id, name FROM agencies WHERE id = $1',
        [agencyId]
      );

      return result.rows[0];
    });

    if (!agency) {
      throw new NotFoundError('Agency not found');
    }

    return {
      agency: {
        id: agency.id,
        name: agency.name,
      },
    };
  });
}
