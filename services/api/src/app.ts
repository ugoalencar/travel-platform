import Fastify from 'fastify';
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from 'fastify';
import {
  createCustomerTenantContextHook,
  createPartnerTenantContextHook,
  createTenantContextHook,
  getAgencyId,
  type ValidateCustomerAgencyAccess,
  type ValidatePartnerAgencyAccess,
  type ValidateUserAgencyAccess,
} from '../../../packages/domain/tenant-context';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { createAuthenticateHook, type AuthProvider } from './auth';
import { createCustomerAuthenticateHook, type CustomerAuthProvider } from './customer-auth';
import { createPartnerAuthenticateHook, type PartnerAuthProvider } from './partner-auth';
import type { DatabaseRuntime } from './database';
import { registerAssetsRoutes } from './routes/assets';
import { registerAutomationsRoutes } from './routes/automations';
import { registerCampaignsRoutes } from './routes/campaigns';
import { registerCommercialCockpitRoutes } from './routes/commercial-cockpit';
import { registerCommissionsRoutes } from './routes/commissions';
import { registerConnectorsRoutes } from './routes/connectors';
import { registerCostCentersRoutes } from './routes/cost-centers';
import { registerCouponsRoutes } from './routes/coupons';
import { registerCustomerDocumentRoutes } from './routes/customer-documents';
import { registerCustomerPortalRoutes } from './routes/customer-portal';
import { registerCustomerRoutes } from './routes/customers';
import { registerEnrollmentRoutes } from './routes/enrollment';
import { registerEngagementsRoutes } from './routes/engagements';
import { registerEntitlementsRoutes } from './routes/entitlements';
import { registerFinancialRoutes } from './routes/financial';
import { registerInfrastructureRoutes } from './routes/infrastructure';
import { registerOfferGrowthAuditRoutes } from './routes/offer-growth-audit';
import { registerOffersRoutes } from './routes/offers';
import { registerContractsRoutes } from './routes/contracts';
import { registerInsuranceRoutes } from './routes/insurance';
import { registerAuthRoutes } from './routes/auth';
import { registerCustomerAuthRoutes } from './routes/customer-auth';
import { registerPlatformAuthRoutes } from './routes/platform-auth';
import { registerAgencySignupRoutes } from './routes/agency-signup';
import {
  composeAuthProviders,
  composeCustomerAuthProviders,
  composePlatformAuthProviders,
  createSessionAuthProvider,
} from './session-auth';
import { createCustomerSessionAuthProvider } from './customer-session-auth';
import { createPlatformSessionAuthProvider } from './platform-session-auth';
import { registerPartnerCampaignsRoutes } from './routes/partner-campaigns';
import { registerPartnersRoutes } from './routes/partners';
import { registerOperationsRoutes } from './routes/operations';
import { registerOperationsStaffRoutes } from './routes/operations-staff';
import { registerPescadorRoutes } from './routes/pescador';
import { registerPublicationsRoutes } from './routes/publications';
import { registerProposalsRoutes } from './routes/proposals';
import { registerReportsRoutes } from './routes/reports';
import { registerSalesRoutes } from './routes/sales';
import { registerSaleItemsRoutes } from './routes/sale-items';
import { registerTravelProductsRoutes } from './routes/travel-products';
import { registerSettingsExpandedRoutes } from './routes/settings-expanded';
import { registerSettingsRoutes } from './routes/settings';
import { registerSupportRoutes } from './routes/support';
import { registerTransportSuppliersRoutes } from './routes/transport-suppliers';
import { registerTripsRoutes } from './routes/trips';
import { registerWishesRoutes } from './routes/wishes';
import { type VersionInfo } from './version';
import type { OcrProviderContract } from './ocr-provider';
import {
  CorsOriginNotAllowedError,
  registerErrorHandler,
} from './errors';
import {
  DEFAULT_BODY_LIMIT_BYTES,
  isOriginAllowed,
  resolveCorsPolicy,
  type CorsPolicy,
} from './security-config';
import {
  classifyRateLimitRequest,
  InMemoryRateLimitStore,
  RequestRateLimiter,
  type RateLimitClass,
  resolveRateLimitRuntimeConfig,
  type RateLimitRule,
  type RateLimitRuntimeEnvironment,
  type RateLimitStore,
} from './rate-limit';
import {
  setAgencyEntitlementViaPlatformStopgap,
  type SetAgencyEntitlementInput,
} from './entitlements';
import type { PlatformDatabaseRuntime } from './database';
import { InternalMockConnector } from './connectors/mock-connector';
import { createPlatformAuthenticateHook, type PlatformAuthProvider } from './platform-auth';
import { PlatformDevAuthProvider } from './platform-dev-auth';
import { registerPlatformRoutes, registerPublicPlatformRoutes } from './platform-routes';
import { registerObservability, resolveDeploymentId } from './observability';

export interface BuildAppOptions {
  authProvider: AuthProvider;
  validateUserAgencyAccess: ValidateUserAgencyAccess;
  database: DatabaseRuntime;
  // Local email+password auth (Pilot Delivery Gap Closure -- Agent 02/
  // Identity): login/MFA/password-reset/session-lookup all need to
  // resolve tenant context from a caller-supplied token/slug rather than
  // the ambient request context DatabaseRuntime assumes. Optional and
  // fail-closed -- omitting it leaves /auth/* mounted but erroring, and
  // leaves Bearer session-token auth un-composed (dev-auth/OIDC still
  // work standalone), rather than making it a hard requirement for every
  // existing caller of buildApp().
  platformDatabase?: PlatformDatabaseRuntime;
  exposeTestRoutes?: boolean;
  platformAuthProvider?: PlatformAuthProvider;
  customerAuthProvider?: CustomerAuthProvider;
  validateCustomerAgencyAccess?: ValidateCustomerAgencyAccess;
  // Partner portal (Agent 04): same optional/fail-closed shape as the
  // customer-portal options above -- omitting these leaves /partner-api/*
  // exercisable but 401ing on every request rather than unmounted.
  partnerAuthProvider?: PartnerAuthProvider;
  validatePartnerAgencyAccess?: ValidatePartnerAgencyAccess;
  ocrProvider?: OcrProviderContract;
  readinessCheck?: () => Promise<void>;
  rateLimit?: RateLimitOptions;
  versionInfo?: VersionInfo;
  platformStopgap?: {
    enabled: boolean;
    sharedKey: string;
    database: PlatformDatabaseRuntime;
  };
  mockConnector?: InternalMockConnector;
  corsPolicy?: CorsPolicy;
  bodyLimitBytes?: number;
  deploymentId?: string;
  dbPoolStats?: () => { total: number; idle: number; waiting: number } | undefined;
}

export interface RateLimitOptions {
  enabled?: boolean;
  windowMs?: number;
  max?: number;
  classLimits?: Partial<Record<RateLimitClass, RateLimitRule>>;
  store?: RateLimitStore;
  environment?: RateLimitRuntimeEnvironment & { NODE_ENV?: string };
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: {
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.x-platform-stopgap-key',
        'req.headers.x-dev-user-id',
        'req.headers.x-dev-agency-id',
        'req.headers.x-dev-role',
        'req.headers.x-dev-platform-user-id',
        'req.headers.x-dev-platform-user-role',
        'req.headers.x-dev-customer',
      ],
    },
    bodyLimit: options.bodyLimitBytes ?? DEFAULT_BODY_LIMIT_BYTES,
  });

  const corsPolicy = options.corsPolicy ?? resolveCorsPolicy(process.env);

  void app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (isOriginAllowed(origin, corsPolicy)) {
        callback(null, true);
        return;
      }
      callback(new CorsOriginNotAllowedError('Origin not allowed'), false);
    },
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-dev-user-id',
      'x-dev-agency-id',
      'x-dev-role',
      'x-dev-platform-user-id',
      'x-dev-platform-user-role',
      'x-dev-customer',
    ],
    maxAge: 600,
  });

  void app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: corsPolicy.isProduction
      ? { maxAge: 15552000, includeSubDomains: true, preload: false }
      : false,
    xXssProtection: false,
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
  });

  app.addHook('onSend', (_request, reply, payload, done) => {
    reply.header(
      'Permissions-Policy',
      'geolocation=(), camera=(), microphone=(), payment=(), usb=(), fullscreen=()'
    );
    done(null, payload);
  });

  const metrics = registerObservability(app, {
    deploymentId: options.deploymentId ?? resolveDeploymentId(),
  });

  app.decorateRequest('auth', undefined);
  registerErrorHandler(app);

  const authenticate = createAuthenticateHook(
    options.platformDatabase
      ? composeAuthProviders(options.authProvider, createSessionAuthProvider(options.platformDatabase))
      : options.authProvider,
  );
  const establishTenant = createTenantContextHook({
    validateUserAgencyAccess: options.validateUserAgencyAccess,
  });
  const rateLimits = createRateLimitHooks(options.rateLimit);
  const protectedHooks = [authenticate, establishTenant, rateLimits.onTrustedTenant];
  app.addHook('onRequest', rateLimits.onRequest);

  const platformAuthProvider = options.platformAuthProvider ?? new PlatformDevAuthProvider();
  const platformAuthenticate = createPlatformAuthenticateHook(
    options.platformDatabase
      ? composePlatformAuthProviders(platformAuthProvider, createPlatformSessionAuthProvider(options.platformDatabase))
      : platformAuthProvider,
  );
  const platformProtectedHooks = [platformAuthenticate, rateLimits.onTrustedPlatformPrincipal];

  const baseCustomerAuthProvider =
    options.customerAuthProvider ?? { authenticateCustomer: () => Promise.resolve(null) };
  const customerAuthenticate = createCustomerAuthenticateHook(
    options.platformDatabase
      ? composeCustomerAuthProviders(baseCustomerAuthProvider, createCustomerSessionAuthProvider(options.platformDatabase))
      : baseCustomerAuthProvider,
  );
  const establishCustomerTenant = createCustomerTenantContextHook({
    validateCustomerAgencyAccess:
      options.validateCustomerAgencyAccess ?? (() => Promise.resolve(false)),
  });
  const customerHooks = [customerAuthenticate, establishCustomerTenant, rateLimits.onTrustedTenant];

  // Partner portal (Agent 04): entirely separate auth/tenant-context
  // pipeline from both the staff protectedHooks and the customer
  // customerHooks above -- never shares a hook, a decorator, or a
  // data-access function with either. Mounted under /partner-api/*
  // (distinct prefix from /api/* and /customer-api/*).
  const partnerAuthenticate = createPartnerAuthenticateHook(
    options.partnerAuthProvider ?? { authenticatePartner: () => Promise.resolve(null) }
  );
  const establishPartnerTenant = createPartnerTenantContextHook({
    validatePartnerAgencyAccess:
      options.validatePartnerAgencyAccess ?? (() => Promise.resolve(false)),
  });
  const partnerHooks = [partnerAuthenticate, establishPartnerTenant, rateLimits.onTrustedTenant];

  registerCustomerPortalRoutes(app, { database: options.database, customerHooks });

  // Infrastructure (health, version, metrics, readiness, me, tenant-proof)
  registerInfrastructureRoutes(app, {
    database: options.database,
    protectedHooks,
    versionInfo: options.versionInfo,
    readinessCheck: options.readinessCheck,
    metrics,
    dbPoolStats: options.dbPoolStats,
  });

  registerSupportRoutes(app, { database: options.database, protectedHooks });

  registerCustomerDocumentRoutes(app, {
    database: options.database,
    protectedHooks,
    ...(options.ocrProvider ? { ocrProvider: options.ocrProvider } : {}),
  });

  registerOperationsRoutes(app, {
    database: options.database,
    protectedHooks,
  });

  registerCustomerRoutes(app, { database: options.database, protectedHooks });

  // Enrollment (staff + public)
  registerEnrollmentRoutes(app, { database: options.database, protectedHooks });

  registerWishesRoutes(app, { database: options.database, protectedHooks });
  registerTripsRoutes(app, { database: options.database, protectedHooks });
  registerOffersRoutes(app, { database: options.database, protectedHooks });
  registerTravelProductsRoutes(app, { database: options.database, protectedHooks });
  registerPartnersRoutes(app, { database: options.database, protectedHooks, partnerHooks });
  registerContractsRoutes(app, { database: options.database, protectedHooks });
  registerInsuranceRoutes(app, { database: options.database, protectedHooks });
  registerAuthRoutes(app, {
    database: options.database,
    ...(options.platformDatabase ? { platformDatabase: options.platformDatabase } : {}),
    protectedHooks,
  });
  registerCustomerAuthRoutes(app, {
    ...(options.platformDatabase ? { platformDatabase: options.platformDatabase } : {}),
    customerHooks,
  });
  registerPlatformAuthRoutes(app, {
    ...(options.platformDatabase ? { platformDatabase: options.platformDatabase } : {}),
    platformProtectedHooks,
  });
  registerAgencySignupRoutes(app, {
    ...(options.platformDatabase ? { platformDatabase: options.platformDatabase } : {}),
  });
  registerPartnerCampaignsRoutes(app, { database: options.database, protectedHooks });
  registerProposalsRoutes(app, { database: options.database, protectedHooks });

  // Transport suppliers (routes, suppliers, products, departures, agenda)
  registerTransportSuppliersRoutes(app, { database: options.database, protectedHooks });

  // Operations staff (field operations, operational staff, assignments)
  registerOperationsStaffRoutes(app, { database: options.database, protectedHooks });

  registerCommercialCockpitRoutes(app, { database: options.database, protectedHooks });
  registerSettingsRoutes(app, { database: options.database, protectedHooks });

  // Settings expanded (agency profile, branding, onboarding, departments, invitations, permissions)
  registerSettingsExpandedRoutes(app, { database: options.database, protectedHooks });

  // Sales
  registerSalesRoutes(app, { database: options.database, protectedHooks });
  registerSaleItemsRoutes(app, { database: options.database, protectedHooks });

  // Financial (receivables, payables, payments, costs, categories, revenues, expenses, cash, reconciliations, reports)
  registerFinancialRoutes(app, { database: options.database, protectedHooks });

  // Cost centers
  registerCostCentersRoutes(app, { database: options.database, protectedHooks });

  // Commissions (plans, employees, entries, deductions, payroll)
  registerCommissionsRoutes(app, { database: options.database, protectedHooks });

  // Reports (sales, financial aging, profitability, personnel)
  registerReportsRoutes(app, { database: options.database, protectedHooks });

  // Pescador (external offer captures)
  registerPescadorRoutes(app, { database: options.database, protectedHooks });

  // ============================================================
  // OFFER & GROWTH ENGINE (batch 04 backend foundation)
  // ============================================================
  const mockConnector = options.mockConnector ?? new InternalMockConnector();

  registerAssetsRoutes(app, { database: options.database, protectedHooks });
  registerCampaignsRoutes(app, { database: options.database, protectedHooks });
  registerPublicationsRoutes(app, { database: options.database, protectedHooks, mockConnector });
  registerEngagementsRoutes(app, { database: options.database, protectedHooks });
  registerAutomationsRoutes(app, { database: options.database, protectedHooks });
  registerConnectorsRoutes(app, { database: options.database, protectedHooks, mockConnector });
  registerCouponsRoutes(app, { database: options.database, protectedHooks });
  registerEntitlementsRoutes(app, { database: options.database, protectedHooks });
  registerOfferGrowthAuditRoutes(app, { database: options.database, protectedHooks });

  // Platform-scoped entitlement WRITE stopgap
  app.post<{ Body: SetAgencyEntitlementInput }>(
    '/platform/entitlements',
    async (request, reply) => {
      const stopgap = options.platformStopgap;
      if (!stopgap || stopgap.enabled !== true) {
        reply.code(404);
        return { error: 'Not found' };
      }
      const providedKey = request.headers['x-platform-stopgap-key'];
      if (
        typeof providedKey !== 'string' ||
        providedKey.length === 0 ||
        providedKey !== stopgap.sharedKey
      ) {
        reply.code(401);
        return { error: 'Unauthorized' };
      }
      const body = request.body ?? ({} as SetAgencyEntitlementInput);
      const entitlement = await setAgencyEntitlementViaPlatformStopgap(
        stopgap.database,
        body,
        'platform-stopgap'
      );
      reply.code(200);
      return { entitlement };
    }
  );

  if (options.exposeTestRoutes === true) {
    app.post('/__test/rate-limit-proof', { preHandler: protectedHooks }, () => ({
      status: 'ok',
    }));

    app.post('/__test/rollback-proof', { preHandler: protectedHooks }, async () => {
      await options.database.withTenantTransaction(async (client) => {
        await client.query(
          'INSERT INTO offers (agency_id, name, price, status) VALUES ($1, $2, $3, $4)',
          [getAgencyId(), 'Rollback Probe', 1, 'ACTIVE']
        );
        throw new Error('Synthetic rollback probe failure');
      });
    });
  }

  registerPublicPlatformRoutes(app, options.database);
  registerPlatformRoutes(app, options.database, platformProtectedHooks);

  return app;
}

function createRateLimitHooks(options: RateLimitOptions | undefined) {
  const environment = options?.environment ?? process.env;
  const runtimeConfig = resolveRateLimitRuntimeConfig(environment);
  const enabled = options?.enabled ?? runtimeConfig.enabled;
  const windowMs = options?.windowMs ?? runtimeConfig.windowMs;
  const max = options?.max ?? runtimeConfig.max;
  if (environment.NODE_ENV === 'production' && runtimeConfig.store !== 'external') {
    throw new Error(
      'Production rate limiting cannot use the process-local store. ' +
        'HUMAN INFRASTRUCTURE DECISION REQUIRED: choose and wire a distributed provider.'
    );
  }
  if (runtimeConfig.store === 'external' && !options?.store) {
    throw new Error(
      'Production rate limiting requires an injected shared RateLimitStore. ' +
        'HUMAN INFRASTRUCTURE DECISION REQUIRED: choose and wire a distributed provider.'
    );
  }
  const limiter = new RequestRateLimiter({
    store: options?.store ?? new InMemoryRateLimitStore(),
    policies: {
      STAFF_WRITE: { max, windowMs },
      ...options?.classLimits,
    },
  });

  const onRequest = function rateLimitHook(
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ): void {
    if (!enabled) {
      done();
      return;
    }

    limiter
      .check({
        rateLimitClass: classifyRateLimitRequest(request.method, request.url),
        ip: request.ip,
        route: request.url.split('?')[0] ?? request.url,
      })
      .then((decision) => {
        if (decision.state === 'allow') {
          done();
          return;
        }
        if (decision.retryAfterSeconds !== undefined) {
          reply.header('retry-after', String(decision.retryAfterSeconds));
        }
        reply.code(429).send({
          error: 'Too many requests',
          code: 'RATE_LIMITED',
        });
      })
      .catch((error: unknown) => {
        done(error instanceof Error ? error : new Error('Rate limit evaluation failed'));
      });
  };

  const onTrustedTenant = function trustedTenantRateLimitHook(
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ): void {
    if (!enabled) {
      done();
      return;
    }

    limiter
      .checkTenant({
        rateLimitClass: classifyRateLimitRequest(request.method, request.url),
        tenantId: getAgencyId(),
        route: request.url.split('?')[0] ?? request.url,
      })
      .then((decision) => {
        if (decision.state === 'allow') {
          done();
          return;
        }
        if (decision.retryAfterSeconds !== undefined) {
          reply.header('retry-after', String(decision.retryAfterSeconds));
        }
        reply.code(429).send({
          error: 'Too many requests',
          code: 'RATE_LIMITED',
        });
      })
      .catch((error: unknown) => {
        done(error instanceof Error ? error : new Error('Tenant rate limit evaluation failed'));
      });
  };

  const onTrustedPlatformPrincipal = function trustedPlatformRateLimitHook(
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ): void {
    if (!enabled) {
      done();
      return;
    }

    const platformUserId = request.platformAuth?.sub;
    if (!platformUserId) {
      done(new Error('Platform rate limit requires an authenticated platform principal'));
      return;
    }

    limiter
      .checkTenant({
        rateLimitClass: classifyRateLimitRequest(request.method, request.url),
        tenantId: platformUserId,
        route: request.url.split('?')[0] ?? request.url,
      })
      .then((decision) => {
        if (decision.state === 'allow') {
          done();
          return;
        }
        if (decision.retryAfterSeconds !== undefined) {
          reply.header('retry-after', String(decision.retryAfterSeconds));
        }
        reply.code(429).send({
          error: 'Too many requests',
          code: 'RATE_LIMITED',
        });
      })
      .catch((error: unknown) => {
        done(error instanceof Error ? error : new Error('Platform rate limit evaluation failed'));
      });
  };

  return { onRequest, onTrustedTenant, onTrustedPlatformPrincipal };
}
