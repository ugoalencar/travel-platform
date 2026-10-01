import Fastify, { type FastifyInstance, type preHandlerHookHandler } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { createAuthenticateHook } from './auth';
import type { LiteDatabase } from './database';
import { HttpError } from './errors';
import { registerAuthRoutes } from './routes/auth';
import { registerCashFlowRoutes } from './routes/cash-flow';
import { registerCategoryRoutes } from './routes/categories';
import { registerCommissionRoutes } from './routes/commissions';
import { registerCustomerRoutes } from './routes/customers';
import { registerFinancialCatalogRoutes } from './routes/financial-catalog';
import { registerDashboardRoutes } from './routes/dashboard';
import { registerReportRoutes } from './routes/reports';
import { registerUserRoutes } from './routes/users';
import { registerSaleRoutes } from './routes/sales';
import { registerSellerRoutes } from './routes/sellers';
import { createTenantContextHook } from './tenant-context';
import { createStaticHandler } from './static';

export interface BuildAppOptions {
  logger?: boolean;
  database?: LiteDatabase;
  staticDir?: string | undefined;
}

/**
 * Travel Lite HTTP shell. Route modules are registered twice: with and
 * without the `/api` prefix — the Vite dev proxy strips `/api`, while the
 * production install (API serving the built frontend, single origin) calls
 * `/api/*` directly.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: true, credentials: false });

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, request, reply) => {
    if (error instanceof HttpError) {
      reply.code(error.statusCode).send({ error: error.message, code: error.code });
      return;
    }
    const status =
      typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    if (status < 500) {
      reply.code(status).send({ error: error.message, code: error.code ?? 'BAD_REQUEST' });
      return;
    }
    request.log.error(error);
    reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  });

  const staticHandler = options.staticDir ? await createStaticHandler(options.staticDir) : null;

  app.setNotFoundHandler(async (request, reply) => {
    if (staticHandler && (await staticHandler(request, reply))) return;
    reply.code(404).send({ error: 'Not found', code: 'NOT_FOUND' });
  });

  app.get('/health', () => ({ status: 'ok', service: 'api-lite' }));
  app.get('/api/health', () => ({ status: 'ok', service: 'api-lite' }));

  const database = options.database;
  if (database) {
    const authenticate = createAuthenticateHook(database);
    const establishTenant = createTenantContextHook();
    const protectedHooks: preHandlerHookHandler[] = [authenticate, establishTenant];

    const registrars: Array<(scope: FastifyInstance) => void> = [
      (scope) => registerAuthRoutes(scope, database, protectedHooks),
      (scope) => registerCustomerRoutes(scope, database, protectedHooks),
      (scope) => registerSellerRoutes(scope, database, protectedHooks),
      (scope) => registerCategoryRoutes(scope, database, protectedHooks),
      (scope) => registerSaleRoutes(scope, database, protectedHooks),
      (scope) => registerFinancialCatalogRoutes(scope, database, protectedHooks),
      (scope) => registerCashFlowRoutes(scope, database, protectedHooks),
      (scope) => registerCommissionRoutes(scope, database, protectedHooks),
      (scope) => registerReportRoutes(scope, database, protectedHooks),
      (scope) => registerDashboardRoutes(scope, database, protectedHooks),
      (scope) => registerUserRoutes(scope, database, protectedHooks),
    ];

    await app.register(
      (scope, _opts, done) => {
        for (const register of registrars) register(scope);
        done();
      },
      { prefix: '/api' },
    );
    await app.register((scope, _opts, done) => {
      for (const register of registrars) register(scope);
      done();
    });
  }

  return app;
}
