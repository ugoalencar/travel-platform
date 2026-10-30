import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import {
  getAgencyId,
  getUserId,
  requireRole,
} from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import { CepError, type CepLookup } from '../cep';

export interface CepRouteOptions {
  lookup: Pick<CepLookup, 'lookup'>;
  protectedHooks: preHandlerHookHandler[];
}

export function registerCepRoutes(
  app: FastifyInstance,
  options: CepRouteOptions,
): void {
  app.get<{ Querystring: { cep?: string } }>(
    '/cep/lookup',
    {
      logLevel: 'silent',
      onRequest: (_request, reply, done) => {
        reply.header('cache-control', 'no-store');
        done();
      },
      onSend: (_request, reply, payload, done) => {
        reply.header('cache-control', 'no-store');
        done(null, payload);
      },
      preHandler: options.protectedHooks,
    },
    async (request, reply) => {
      requireRole(UserRole.AGENT);
      try {
        return await options.lookup.lookup(
          request.query.cep,
          `${getAgencyId()}:${getUserId()}`,
        );
      } catch (error) {
        if (error instanceof CepError) {
          if (error.statusCode === 429) reply.header('retry-after', '60');
          request.observedErrorCode = error.code;
          return reply
            .code(error.statusCode)
            .send({ error: error.message, code: error.code });
        }
        throw error;
      }
    },
  );
}
