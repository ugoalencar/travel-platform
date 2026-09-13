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

// ============================================================
// CUSTOMER PORTAL TENANT CONTEXT
// Fully separate from the staff auth/context flow above. Never merged
// with AuthPayload/establishTenantContext -- a customer identity must
// never be mistaken for (or escalate into) a staff principal.
// ============================================================

export interface CustomerAuthPayload {
  agencyId: string;
  customerId: string;
}

// Independent DB-backed check that the resolved customerId actually
// belongs to the resolved agencyId (mirrors ValidateUserAgencyAccess /
// validateUserAgencyAccess for the staff flow). Must query the
// `customers` table -- never trust the auth layer's claim alone.
export type ValidateCustomerAgencyAccess = (
  customerId: string,
  agencyId: string,
) => Promise<boolean>;

export interface CustomerTenantContextHookOptions {
  validateCustomerAgencyAccess: ValidateCustomerAgencyAccess;
}

export type CustomerTenantFastifyRequest = {
  customerAuth?: CustomerAuthPayload;
  body?: unknown;
};

// Synthetic, non-secret placeholders used only to satisfy
// assertValidTenantContext's staff-shaped invariants (non-empty
// userId/userRole) for a customer-portal request. Never treated as a
// real user id or role: customer-portal routes never call
// requireRole()/requireExactRole() and never read userId for anything
// but this context's own internal consistency.
const CUSTOMER_CONTEXT_ROLE = UserRole.VIEWER;

export async function establishCustomerTenantContext(
  request: CustomerTenantFastifyRequest,
  options: CustomerTenantContextHookOptions,
): Promise<TenantContext> {
  const customerAuth = request.customerAuth;

  if (!customerAuth) {
    throw new UnauthorizedError('Customer authentication required');
  }

  if (!isNonEmptyString(customerAuth.agencyId) || !isNonEmptyString(customerAuth.customerId)) {
    throw new UnauthorizedError('Customer authentication required');
  }

  const belongsToAgency = await options.validateCustomerAgencyAccess(
    customerAuth.customerId,
    customerAuth.agencyId,
  );

  if (!belongsToAgency) {
    throw new ForbiddenError('Customer does not belong to this agency');
  }

  const context: TenantContext = {
    agencyId: customerAuth.agencyId,
    userId: `customer-context:${customerAuth.customerId}`,
    userRole: CUSTOMER_CONTEXT_ROLE,
    email: '',
    customerId: customerAuth.customerId,
  };

  assertValidTenantContext(context);
  return context;
}

export function createCustomerTenantContextHook(options: CustomerTenantContextHookOptions) {
  return (
    request: CustomerTenantFastifyRequest,
    reply: TenantFastifyReply,
    done: HookHandlerDoneFunction,
  ): void => {
    establishCustomerTenantContext(request, options)
      .then((context) => {
        tenantStorage.run(context, done);
      })
      .catch((error: unknown) => {
        sendTenantError(reply, error);
      });
  };
}

// ============================================================
// PARTNER PORTAL TENANT CONTEXT
// Fully separate from the staff auth/context flow AND from the customer
// portal flow above. A partner (external affiliate/agent) is not a
// `users` row with a staff role, and never a `customers` row either --
// separate types, separate hook, separate request decoration
// (`partnerAuth`, not `auth`/`customerAuth`). Mirrors the customer-portal
// pattern exactly, per AGENT_04_PARTNERS mission guidance.
// ============================================================

export interface PartnerAuthPayload {
  agencyId: string;
  partnerId: string;
}

// Independent DB-backed check that the resolved partnerId actually
// belongs to the resolved agencyId (mirrors ValidateCustomerAgencyAccess).
// Must query the `commercial_partners` table -- never trust the auth
// layer's claim alone.
export type ValidatePartnerAgencyAccess = (
  partnerId: string,
  agencyId: string,
) => Promise<boolean>;

export interface PartnerTenantContextHookOptions {
  validatePartnerAgencyAccess: ValidatePartnerAgencyAccess;
}

export type PartnerTenantFastifyRequest = {
  partnerAuth?: PartnerAuthPayload;
  body?: unknown;
};

// Synthetic, non-secret placeholder, same rationale as CUSTOMER_CONTEXT_ROLE:
// partner-portal routes never call requireRole()/requireExactRole() and
// never read userId for anything but this context's own internal
// consistency.
const PARTNER_CONTEXT_ROLE = UserRole.VIEWER;

export async function establishPartnerTenantContext(
  request: PartnerTenantFastifyRequest,
  options: PartnerTenantContextHookOptions,
): Promise<TenantContext> {
  const partnerAuth = request.partnerAuth;

  if (!partnerAuth) {
    throw new UnauthorizedError('Partner authentication required');
  }

  if (!isNonEmptyString(partnerAuth.agencyId) || !isNonEmptyString(partnerAuth.partnerId)) {
    throw new UnauthorizedError('Partner authentication required');
  }

  const belongsToAgency = await options.validatePartnerAgencyAccess(
    partnerAuth.partnerId,
    partnerAuth.agencyId,
  );

  if (!belongsToAgency) {
    throw new ForbiddenError('Partner does not belong to this agency');
  }

  const context: TenantContext = {
    agencyId: partnerAuth.agencyId,
    userId: `partner-context:${partnerAuth.partnerId}`,
    userRole: PARTNER_CONTEXT_ROLE,
    email: '',
    partnerId: partnerAuth.partnerId,
  };

  assertValidTenantContext(context);
  return context;
}

export function createPartnerTenantContextHook(options: PartnerTenantContextHookOptions) {
  return (
    request: PartnerTenantFastifyRequest,
    reply: TenantFastifyReply,
    done: HookHandlerDoneFunction,
  ): void => {
    establishPartnerTenantContext(request, options)
      .then((context) => {
        tenantStorage.run(context, done);
      })
      .catch((error: unknown) => {
        sendTenantError(reply, error);
      });
  };
}

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

// Customer-portal counterpart to getUserId(). Throws if this request's
// tenant context was not established via establishCustomerTenantContext()
// (e.g. a staff request has no customerId at all). Never falls back to
// trusting a customerId supplied by the caller.
export function getCustomerId(): string {
  const context = getTenantContext();

  if (!isNonEmptyString(context.customerId ?? '')) {
    throw new TenantError(
      'No customer context available on this request.',
      'NO_CUSTOMER_CONTEXT',
    );
  }

  return context.customerId as string;
}

// Partner-portal counterpart to getCustomerId(). Throws if this request's
// tenant context was not established via establishPartnerTenantContext()
// (e.g. a staff or customer request has no partnerId at all). Never falls
// back to trusting a partnerId supplied by the caller.
export function getPartnerId(): string {
  const context = getTenantContext();

  if (!isNonEmptyString(context.partnerId ?? '')) {
    throw new TenantError(
      'No partner context available on this request.',
      'NO_PARTNER_CONTEXT',
    );
  }

  return context.partnerId as string;
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
