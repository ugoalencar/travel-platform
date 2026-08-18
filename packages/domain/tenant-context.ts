import { AsyncLocalStorage } from 'node:async_hooks';
import type { HookHandlerDoneFunction } from 'fastify';
import type { TenantContext } from './types';
import { UserRole } from './types';

export class TenantError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'TenantError';
  }
}

export class UnauthorizedError extends TenantError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends TenantError {
  constructor(message = 'Forbidden: No access to this agency') {
    super(message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export interface AuthPayload {
  sub: string;
  agency_id: string;
  role: UserRole;
  email: string;
  iat?: number;
  exp?: number;
}

export type ValidateUserAgencyAccess = (
  userId: string,
  agencyId: string,
) => Promise<boolean>;

export interface TenantContextHookOptions {
  validateUserAgencyAccess: ValidateUserAgencyAccess;
}

export type TenantFastifyRequest = {
  auth?: AuthPayload;
  body?: unknown;
};

export interface TenantFastifyReply {
  code(statusCode: number): TenantFastifyReply;
  send(payload: unknown): unknown;
}

export interface TenantAwareClient {
  query<T = unknown>(query: string, params: readonly unknown[]): Promise<T>;
}

const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function runWithTenantContext<T>(
  context: TenantContext,
  callback: () => T,
): T {
  assertValidTenantContext(context);
  return tenantStorage.run(context, callback);
}

export function getOptionalTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

export function getTenantContext(): TenantContext {
  const context = getOptionalTenantContext();

  if (!context) {
    throw new TenantError(
      'No tenant context available. Ensure Fastify tenant hook is applied.',
      'NO_TENANT_CONTEXT',
    );
  }

  assertValidTenantContext(context);
  return context;
}

export function getAgencyId(): string {
  return getTenantContext().agencyId;
}

export function getUserId(): string {
  return getTenantContext().userId;
}

export function createTenantContextHook(options: TenantContextHookOptions) {
  return (
    request: TenantFastifyRequest,
    reply: TenantFastifyReply,
    done: HookHandlerDoneFunction,
  ): void => {
    establishTenantContext(request, options)
      .then((context) => {
        runWithTenantContext(context, done);
      })
      .catch((error: unknown) => {
        sendTenantError(reply, error);
      });
  };
}

export function tenantMiddleware(options: TenantContextHookOptions) {
  return createTenantContextHook(options);
}

export function createTenantClient() {
  const context = getTenantContext();

  return {
    agencyId: context.agencyId,
    userId: context.userId,

    async setContext(client: TenantAwareClient): Promise<void> {
      await client.query('SELECT set_tenant_context($1, $2)', [
        context.agencyId,
        context.userId,
      ]);
    },
  };
}

export function validateResourceOwnership(
  resourceAgencyId: string,
  resourceLabel = 'Resource',
): void {
  const currentAgencyId = getAgencyId();

  if (resourceAgencyId !== currentAgencyId) {
    throw new ForbiddenError(`${resourceLabel} does not belong to your agency`);
  }
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.OWNER]: 100,
  [UserRole.ADMIN]: 80,
  [UserRole.MANAGER]: 60,
  [UserRole.AGENT]: 40,
  [UserRole.VIEWER]: 20,
};

export function requireRole(minRole: UserRole): void {
  const context = getTenantContext();
  const currentLevel = ROLE_HIERARCHY[context.userRole] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;

  if (currentLevel < requiredLevel) {
    throw new ForbiddenError(`Requires ${minRole} role or higher`);
  }
}

export function requireExactRole(...roles: UserRole[]): void {
  const context = getTenantContext();

  if (!roles.includes(context.userRole)) {
    throw new ForbiddenError(`Requires one of: ${roles.join(', ')}`);
  }
}

async function establishTenantContext(
  request: TenantFastifyRequest,
  options: TenantContextHookOptions,
): Promise<TenantContext> {
  const authPayload = request.auth;

  if (!authPayload) {
    throw new UnauthorizedError('Authentication required');
  }

  const context: TenantContext = {
    agencyId: authPayload.agency_id,
    userId: authPayload.sub,
    userRole: authPayload.role,
    email: authPayload.email,
  };

  assertValidTenantContext(context);

  const hasAccess = await options.validateUserAgencyAccess(
    context.userId,
    context.agencyId,
  );

  if (!hasAccess) {
    throw new ForbiddenError('User does not belong to this agency');
  }

  return context;
}

function assertValidTenantContext(context: TenantContext): void {
  if (!isNonEmptyString(context.agencyId)) {
    throw new TenantError('Tenant context requires agencyId', 'INVALID_TENANT_CONTEXT');
  }

  if (!isNonEmptyString(context.userId)) {
    throw new TenantError('Tenant context requires userId', 'INVALID_TENANT_CONTEXT');
  }
}

function sendTenantError(reply: TenantFastifyReply, error: unknown): void {
  if (error instanceof UnauthorizedError) {
    reply.code(401).send({ error: error.message, code: error.code });
    return;
  }

  if (error instanceof TenantError) {
    reply.code(403).send({ error: error.message, code: error.code });
    return;
  }

  reply.code(500).send({ error: 'Internal server error' });
}

function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0;
}
