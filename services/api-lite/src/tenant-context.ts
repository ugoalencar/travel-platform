import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';
import type { AccessContext } from './access';
import { HttpError } from './errors';

export interface TenantContext extends AccessContext {
  tenantId: string;
  userId: string;
  sessionId: string;
  email: string;
}

const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function runWithTenantContext<T>(context: TenantContext, fn: () => T): T {
  return tenantStorage.run(context, fn);
}

export function getOptionalTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

export function getTenantContext(): TenantContext {
  const context = tenantStorage.getStore();
  if (!context) {
    // Programming error: a protected handler ran without establishTenant.
    throw new HttpError(500, 'NO_TENANT_CONTEXT', 'Tenant context is not established');
  }
  return context;
}

export function getTenantId(): string {
  return getTenantContext().tenantId;
}

export function getUserId(): string {
  return getTenantContext().userId;
}

export type TenantPrincipal = TenantContext;

/**
 * Establishes the tenant context for the rest of the request lifecycle.
 * Mirrors packages/domain/tenant-context.ts createTenantContextHook:
 * `storage.run(context, done)` so every downstream callback (handler,
 * service, transaction) sees the same context.
 */
export function createTenantContextHook() {
  return function establishTenant(
    request: FastifyRequest,
    _reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void {
    const principal = request.liteAuth;
    if (!principal) {
      done(new HttpError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }
    tenantStorage.run({ ...principal }, done);
  };
}
