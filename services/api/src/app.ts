import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import {
  createTenantContextHook,
  getAgencyId,
  getTenantContext,
  type ValidateUserAgencyAccess,
} from '../../../packages/domain/tenant-context';
import { createAuthenticateHook, type AuthProvider } from './auth';
import type { DatabaseRuntime } from './database';
import { NotFoundError, registerErrorHandler } from './errors';

export interface BuildAppOptions {
  authProvider: AuthProvider;
  validateUserAgencyAccess: ValidateUserAgencyAccess;
  database: DatabaseRuntime;
  exposeTestRoutes?: boolean;
}

interface AgencyProofRow {
  id: string;
  name: string;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  app.decorateRequest('auth', undefined);
  registerErrorHandler(app);

  const authenticate = createAuthenticateHook(options.authProvider);
  const establishTenant = createTenantContextHook({
    validateUserAgencyAccess: options.validateUserAgencyAccess,
  });
  const protectedHooks = [authenticate, establishTenant];

  app.get('/health', () => ({
    status: 'ok',
    service: 'api',
  }));

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
    const agency = await options.database.withTenantTransaction(async (client) => {
      const result = await client.query<AgencyProofRow>(
        'SELECT id, name FROM agencies WHERE id = $1',
        [agencyId],
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

  if (options.exposeTestRoutes === true) {
    app.post('/__test/rollback-proof', { preHandler: protectedHooks }, async () => {
      await options.database.withTenantTransaction(async (client) => {
        await client.query(
          'INSERT INTO offers (agency_id, name, price, status) VALUES ($1, $2, $3, $4)',
          [getAgencyId(), 'Rollback Probe', 1, 'ACTIVE'],
        );
        throw new Error('Synthetic rollback probe failure');
      });
    });
  }

  return app;
}
