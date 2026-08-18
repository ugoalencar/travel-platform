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

// Fire-and-forget work started inside a request handler (a Promise that is
// not awaited before the handler returns) is NOT a supported way to reach
// this tenant context. run() bounds the store to this one request's causal
// chain; work that outlives the request (a background job, a queue
// producer, anything scheduled to run after the response is sent) must
// receive its tenant/user ids explicitly as data, not rely on reading them
// back out of an ambient AsyncLocalStorage store. Treat any code that calls
// getAgencyId()/getTenantContext() from outside a request's own causal
// chain as a bug, not a feature to build job/queue infrastructure on.
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
        // run(context, done) -- not enterWith(). `done` here is Fastify's
        // own hook continuation (lib/hooks.js `next`): hookRunnerGenerator
        // drives every subsequent onRequest/preParsing/preValidation/
        // preHandler hook, the route handler, serialization, onSend,
        // onResponse, and error handling as ONE causal chain rooted at
        // this call -- each step is reached either by calling `next()`
        // synchronously (callback-style hooks) or via `.then()`/`.catch()`
        // on the promise a hook returned (async hooks), and that
        // continuation is tracked correctly by AsyncLocalStorage
        // regardless of where `.then()` is textually attached, because
        // the promise itself originates from inside this run() call
        // (verified against fastify/lib/hooks.js and route.js: the same
        // `cb` threading connects onRequestHookRunner -> runPreParsing ->
        // preParsingHookRunner -> handleRequest, all the way through the
        // handler and reply). run() therefore scopes the *entire*
        // remaining lifecycle of exactly this one request and nothing
        // else, and the store reverts automatically once that chain
        // settles -- a stronger, explicitly bounded guarantee than
        // enterWith(), which has no defined end and depends entirely on
        // no other code sharing this async execution context. See
        // tests/security/tenant-fastify-lifecycle.test.ts.
        tenantStorage.run(context, done);
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
