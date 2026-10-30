import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requirePermission } from '../access';
import type { CepLookup } from '../cep';
import { getTenantContext } from '../tenant-context';
import { HttpError } from '../errors';

export function registerCepRoutes(app: FastifyInstance, lookup: CepLookup, protectedHooks: preHandlerHookHandler[]): void {
  app.get('/cep/lookup', { logLevel: 'silent', preHandler: protectedHooks }, async (request, reply) => {
    const context = getTenantContext();
    requirePermission(context, 'customers.create', 'customers.update_all', 'customers.update_own');
    const { cep } = request.query as { cep?: unknown };
    reply.header('cache-control', 'no-store');
    try {
      return await lookup.lookup(cep, `${context.tenantId}:${context.userId}`);
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 429) reply.header('retry-after', '60');
      throw error;
    }
  });
}
