/**
 * Plan capabilities (Lite / Pro / Full): static, informative matrix of
 * what each plan offers — never an entitlement. Any authenticated user
 * may read it; it grants no permission and never bypasses
 * requirePermission (PX5 contract, PLAN-CAPABILITIES.md).
 */
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { buildPlanCapabilities } from '../capabilities';

export function registerPlanRoutes(app: FastifyInstance, protectedHooks: preHandlerHookHandler[]) {
  app.get('/plan/capabilities', { preHandler: protectedHooks }, () => buildPlanCapabilities());
}
