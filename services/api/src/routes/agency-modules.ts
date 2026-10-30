import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import {
  AGENCY_MODULE_CATALOG,
  getAgencyModules,
  setAgencyModuleEnabled,
} from '../agency-modules';

export function registerAgencyModuleRoutes(
  app: FastifyInstance,
  options: { database: DatabaseRuntime; protectedHooks: preHandlerHookHandler[] },
): void {
  const { database, protectedHooks } = options;

  app.get('/settings/modules', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    return { modules: await getAgencyModules(database) };
  });

  app.patch<{ Params: { key: string } }>(
    '/settings/modules/:key',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const module = AGENCY_MODULE_CATALOG.find((entry) => entry.key === request.params.key);
      if (!module || module.essential) throw new ValidationError('Módulo inválido ou essencial.');
      const body = request.body;
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new ValidationError('Informe enabled como booleano.');
      }
      const record = body as Record<string, unknown>;
      if (Object.keys(record).length !== 1 || typeof record.enabled !== 'boolean') {
        throw new ValidationError('O corpo deve conter somente enabled como booleano.');
      }
      await setAgencyModuleEnabled(database, module.key, record.enabled);
      const updated = (await getAgencyModules(database)).find((entry) => entry.key === module.key);
      return { module: updated };
    },
  );
}
