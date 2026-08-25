import Fastify from 'fastify';
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from 'fastify';
import {
  createCustomerTenantContextHook,
  createTenantContextHook,
  getAgencyId,
  getTenantContext,
  getUserId,
  requireRole,
  type ValidateCustomerAgencyAccess,
  type ValidateUserAgencyAccess,
} from '../../../packages/domain/tenant-context';
import {
  CheckpointType,
  OperationAssignmentRole,
  OperationalStaffCapability,
  PaymentDirection,
  UserRole,
} from '../../../packages/domain/types';
import { createAuthenticateHook, type AuthProvider } from './auth';
import { createCustomerAuthenticateHook, type CustomerAuthProvider } from './customer-auth';
import type { DatabaseRuntime } from './database';
import { NotFoundError, ValidationError, registerErrorHandler } from './errors';
import {
  createCustomer,
  getCustomerById,
  listCustomers,
  updateCustomer,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from './customers';
import {
  createWish,
  getWishById,
  listWishes,
  updateWish,
  type CreateWishInput,
  type UpdateWishInput,
} from './wishes';
import {
  createTrip,
  getTripById,
  listTrips,
  updateTrip,
  type CreateTripInput,
  type UpdateTripInput,
} from './trips';
import {
  createOffer,
  getOfferById,
  listOffers,
  updateOffer,
  type CreateOfferInput,
  type UpdateOfferInput,
} from './offers';
import {
  acceptProposal,
  cancelProposal,
  createProposal,
  declineProposal,
  getProposalById,
  listProposals,
  sendProposal,
  updateProposal,
  type CreateProposalInput,
  type UpdateProposalInput,
} from './proposals';
import {
  createRoute,
  getRouteById,
  listRoutes,
  updateRoute,
  type CreateRouteInput,
  type UpdateRouteInput,
} from './transport-routes';
import {
  createRoutePoint,
  listRoutePoints,
  reorderRoutePoints,
  updateRoutePoint,
  type CreateRoutePointInput,
  type UpdateRoutePointInput,
} from './route-points';
import {
  createSupplier,
  getSupplierById,
  listSuppliers,
  updateSupplier,
  type CreateSupplierInput,
  type UpdateSupplierInput,
} from './suppliers';
import {
  createTransportProduct,
  getTransportProductById,
  listTransportProducts,
  updateTransportProduct,
  type CreateTransportProductInput,
  type UpdateTransportProductInput,
} from './transport-products';
import {
  createScheduledDeparture,
  getAgenda,
  getScheduledDepartureById,
  listScheduledDepartures,
  updateScheduledDeparture,
  type CreateScheduledDepartureInput,
  type UpdateScheduledDepartureInput,
} from './scheduled-departures';
import { DepartureServiceType, TripType } from '../../../packages/domain/types';
import {
  cancelBooking,
  listBookings,
  getBookingById,
  createBooking,
  type CancelBookingInput,
  type CreateBookingInput,
  type CreateBookingPassengerInput,
} from './bookings';
import {
  confirmArrival,
  confirmDeparture,
  createOperationAssignment,
  createOperationalStaff,
  createOperation,
  getOperationById,
  listOperations,
  type CreateOperationAssignmentInput,
  type CreateOperationInput,
  type CreateOperationalStaffInput,
} from './transport-operations';
import {
  cancelSale,
  confirmSale,
  createSale,
  getSaleById,
  listSales,
  markSalePaid,
  updateSale,
  type CreateSaleInput,
  type UpdateSaleInput,
} from './sales';
import {
  allocatePayment,
  createOperationalCost,
  createPayable,
  createReceivable,
  getCashFlowSummary,
  listReceivables,
  recordPayment,
  type CashFlowPeriod,
  type CreateOperationalCostInput,
  type CreatePayableInput,
  type CreatePaymentAllocationInput,
  type CreateReceivableInput,
  type RecordPaymentInput,
} from './financial';
import {
  approveCapture,
  createExternalOfferCapture,
  listExternalOfferCaptures,
  moveCaptureToReview,
  publishCapture,
  rejectCapture,
  type CreateExternalOfferCaptureInput,
} from './pescador';
import {
  getAvailableOfferById,
  getMyBookingById,
  getMyProfile,
  getMyProposalById,
  getMyTripById,
  listAvailableOffers,
  listMyBookings,
  listMyProposals,
  listMyTrips,
} from './customer-portal';
import {
  createInteraction,
  createOpportunity,
  createTask,
  getDashboardSummary,
  getOpportunityById,
  getPostSaleCandidates,
  getProposalsWaiting,
  getTaskById,
  listInteractions,
  listOpportunities,
  listTasks,
  parsePagination,
  searchCustomers,
  travelSearch,
  updateOpportunity,
  updateTask,
} from './commercial-cockpit';
import {
  parseCreateInteractionInput,
  parseCreateOpportunityInput,
  parseCreateTaskInput,
  parseInteractionFilters,
  parseOpportunityFilters,
  parseTaskFilters,
  parseTravelSearchRange,
  parseUpdateOpportunityInput,
  parseUpdateTaskInput,
} from './commercial-cockpit-parsers';
import {
  createPipeline,
  createStage,
  getPipelineById,
  grantPipelineAccess,
  listPipelineAccess,
  listPipelines,
  listStages,
  revokePipelineAccess,
  updatePipeline,
  updateStage,
} from './pipeline-config';
import {
  parseCreatePipelineInput,
  parseCreateStageInput,
  parseGrantAccessInput,
  parseUpdatePipelineInput,
  parseUpdateStageInput,
} from './pipeline-config-parsers';
import {
  AssetSourceType,
  AssetType,
  AutomationStatus,
  CampaignStatus,
  PlatformFeature,
  PublicationStatus,
} from '../../../packages/domain/types';
import { createAsset, listAssets, type CreateAssetInput } from './assets';
import {
  createCampaign,
  getCampaignById,
  linkOfferToCampaign,
  listCampaigns,
  transitionCampaignStatus,
  type CreateCampaignInput,
} from './campaigns';
import {
  createPublication,
  generatePublicationSnapshot,
  getPublicationById,
  listPublications,
  publishViaConnector,
  transitionPublicationStatus,
  type CreatePublicationInput,
} from './publications';
import {
  listEntitlements,
  requireEntitlement,
  setAgencyEntitlementViaPlatformStopgap,
  type SetAgencyEntitlementInput,
} from './entitlements';
import type { PlatformDatabaseRuntime } from './database';
import {
  createAutomation,
  getAutomationById,
  listAutomations,
  processConnectorEvent,
  setAutomationStatus,
  type CreateAutomationInput,
} from './automations';
import { createCoupon, grantCoupon, listCoupons, recordRedemption } from './coupons';
import type { CreateCouponInput, GrantCouponInput, RecordRedemptionInput } from './coupons';
import { listEngagements } from './engagements';
import { listAuditLog } from './offer-growth-audit';
import { InternalMockConnector } from './connectors/mock-connector';
import type { ConnectorEvent } from '../../../packages/domain/types';

export interface BuildAppOptions {
  authProvider: AuthProvider;
  validateUserAgencyAccess: ValidateUserAgencyAccess;
  database: DatabaseRuntime;
  exposeTestRoutes?: boolean;
  // Customer-portal auth. Optional so every existing caller of buildApp()
  // (all staff/admin tests and server.ts's prior wiring) keeps working
  // unchanged; when omitted, the customer-portal routes below fail closed
  // with 401 rather than being unmounted, so their route surface/behavior
  // stays exercisable and reviewable even before a caller opts in.
  customerAuthProvider?: CustomerAuthProvider;
  validateCustomerAgencyAccess?: ValidateCustomerAgencyAccess;
  readinessCheck?: () => Promise<void>;
  rateLimit?: RateLimitOptions;
  // Offer & Growth Engine: platform-scoped entitlement-write stopgap
  // (section H). Deliberately NOT part of protectedHooks / agency auth
  // -- see entitlements.ts's header comment for the full rationale and
  // the documented architecture gap (no real platform-admin identity
  // exists yet in this codebase). Omit to leave /platform/entitlements
  // disabled (its handler 404s when not configured).
  platformStopgap?: {
    enabled: boolean;
    sharedKey: string;
    database: PlatformDatabaseRuntime;
  };
  // Offer & Growth Engine: the one real internal test/mock connector
  // (channel-connectors.md section I/W). Defaults to a fresh in-process
  // InternalMockConnector per buildApp() call when omitted, so routes
  // that simulate connector events always have something real to call.
  mockConnector?: InternalMockConnector;
}

interface AgencyProofRow {
  id: string;
  name: string;
}

interface RateLimitOptions {
  enabled?: boolean;
  windowMs?: number;
  max?: number;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  app.decorateRequest('auth', undefined);
  registerErrorHandler(app);

  const authenticate = createAuthenticateHook(options.authProvider);
  const establishTenant = createTenantContextHook({
    validateUserAgencyAccess: options.validateUserAgencyAccess,
  });
  const protectedHooks = [authenticate, establishTenant];
  const rateLimit = createRateLimitHook(options.rateLimit);
  app.addHook('onRequest', rateLimit);

  // ============================================================
  // CUSTOMER PORTAL (end-customer facing, read-only). Entirely separate
  // auth/tenant-context pipeline from the staff protectedHooks above --
  // never shares a hook, a decorator, or a data-access function with the
  // staff routes. Mounted under /customer-api/* (distinct prefix from
  // the staff /api/* surface the frontend proxy uses).
  // ============================================================
  const customerAuthenticate = createCustomerAuthenticateHook(
    options.customerAuthProvider ?? { authenticateCustomer: () => Promise.resolve(null) },
  );
  const establishCustomerTenant = createCustomerTenantContextHook({
    validateCustomerAgencyAccess:
      options.validateCustomerAgencyAccess ?? (() => Promise.resolve(false)),
  });
  const customerHooks = [customerAuthenticate, establishCustomerTenant];

  app.get('/customer-api/me', { preHandler: customerHooks }, async () => {
    const profile = await getMyProfile(options.database);
    if (!profile) {
      throw new NotFoundError('Customer profile not found');
    }
    return { profile };
  });

  app.get('/customer-api/trips', { preHandler: customerHooks }, async () => {
    const trips = await listMyTrips(options.database);
    return { trips };
  });

  app.get<{ Params: { id: string } }>(
    '/customer-api/trips/:id',
    { preHandler: customerHooks },
    async (request) => {
      const trip = await getMyTripById(options.database, request.params.id);
      if (!trip) {
        throw new NotFoundError('Trip not found');
      }
      return { trip };
    },
  );

  app.get('/customer-api/offers', { preHandler: customerHooks }, async () => {
    const offers = await listAvailableOffers(options.database);
    return { offers };
  });

  app.get<{ Params: { id: string } }>(
    '/customer-api/offers/:id',
    { preHandler: customerHooks },
    async (request) => {
      const offer = await getAvailableOfferById(options.database, request.params.id);
      if (!offer) {
        throw new NotFoundError('Offer not found');
      }
      return { offer };
    },
  );

  app.get('/customer-api/proposals', { preHandler: customerHooks }, async () => {
    const proposals = await listMyProposals(options.database);
    return { proposals };
  });

  app.get<{ Params: { id: string } }>(
    '/customer-api/proposals/:id',
    { preHandler: customerHooks },
    async (request) => {
      const proposal = await getMyProposalById(options.database, request.params.id);
      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }
      return { proposal };
    },
  );

  app.get('/customer-api/bookings', { preHandler: customerHooks }, async () => {
    const bookings = await listMyBookings(options.database);
    return { bookings };
  });

  app.get<{ Params: { id: string } }>(
    '/customer-api/bookings/:id',
    { preHandler: customerHooks },
    async (request) => {
      const result = await getMyBookingById(options.database, request.params.id);
      if (!result) {
        throw new NotFoundError('Booking not found');
      }
      return { booking: result.booking, passengers: result.passengers };
    },
  );

  app.get('/health', () => ({
    status: 'ok',
    service: 'api',
  }));

  app.get('/readiness', async (_request, reply) => {
    try {
      await options.readinessCheck?.();
      return {
        status: 'ready',
        service: 'api',
      };
    } catch (error: unknown) {
      app.log.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Readiness check failed');
      reply.code(503);
      return {
        status: 'not_ready',
        service: 'api',
      };
    }
  });

  app.get('/me', { preHandler: protectedHooks }, () => {
    const context = getTenantContext();

    return {
      userId: context.userId,
      agencyId: context.agencyId,
      role: context.userRole,
    };
  });

  app.get('/tenant-proof', { preHandler: protectedHooks }, async () => {
    const agencyId = getAgencyId();
    const agency = await options.database.withTenantTransaction(async (client) => {
      const result = await client.query<AgencyProofRow>(
        'SELECT id, name FROM agencies WHERE id = $1',
        [agencyId],
      );

      return result.rows[0];
    });

    if (!agency) {
      throw new NotFoundError('Agency not found');
    }

    return {
      agency: {
        id: agency.id,
        name: agency.name,
      },
    };
  });

  app.get('/customers', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const customers = await listCustomers(options.database);
    return { customers };
  });

  app.get<{ Params: { id: string } }>(
    '/customers/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const customer = await getCustomerById(options.database, request.params.id);

      if (!customer) {
        throw new NotFoundError('Customer not found');
      }

      return { customer };
    },
  );

  app.post('/customers', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateCustomerInput(request.body);
    const customer = await createCustomer(options.database, data);

    reply.code(201);
    return { customer };
  });

  app.patch<{ Params: { id: string } }>(
    '/customers/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const data = parseUpdateCustomerInput(request.body);
      const customer = await updateCustomer(options.database, request.params.id, data);

      if (!customer) {
        throw new NotFoundError('Customer not found');
      }

      return { customer };
    },
  );

  app.get('/wishes', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const wishes = await listWishes(options.database);
    return { wishes };
  });

  app.get<{ Params: { id: string } }>(
    '/wishes/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const wish = await getWishById(options.database, request.params.id);

      if (!wish) {
        throw new NotFoundError('Wish not found');
      }

      return { wish };
    },
  );

  app.post('/wishes', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const { customerId, data } = parseCreateWishInput(request.body);
    const wish = await createWish(options.database, customerId, data);

    reply.code(201);
    return { wish };
  });

  app.patch<{ Params: { id: string } }>(
    '/wishes/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const data = parseUpdateWishInput(request.body);
      const wish = await updateWish(options.database, request.params.id, data);

      if (!wish) {
        throw new NotFoundError('Wish not found');
      }

      return { wish };
    },
  );

  app.get('/trips', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const trips = await listTrips(options.database);
    return { trips };
  });

  app.get<{ Params: { id: string } }>(
    '/trips/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const trip = await getTripById(options.database, request.params.id);

      if (!trip) {
        throw new NotFoundError('Trip not found');
      }

      return { trip };
    },
  );

  app.post('/trips', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const { customerId, data } = parseCreateTripInput(request.body);
    const trip = await createTrip(options.database, customerId, data);

    reply.code(201);
    return { trip };
  });

  app.patch<{ Params: { id: string } }>(
    '/trips/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const data = parseUpdateTripInput(request.body);
      const trip = await updateTrip(options.database, request.params.id, data);

      if (!trip) {
        throw new NotFoundError('Trip not found');
      }

      return { trip };
    },
  );

  app.get('/offers', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const offers = await listOffers(options.database);
    return { offers };
  });

  app.get<{ Params: { id: string } }>(
    '/offers/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const offer = await getOfferById(options.database, request.params.id);

      if (!offer) {
        throw new NotFoundError('Offer not found');
      }

      return { offer };
    },
  );

  app.post('/offers', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = parseCreateOfferInput(request.body);
    const offer = await createOffer(options.database, data);

    reply.code(201);
    return { offer };
  });

  app.patch<{ Params: { id: string } }>(
    '/offers/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateOfferInput(request.body);
      const offer = await updateOffer(options.database, request.params.id, data);

      if (!offer) {
        throw new NotFoundError('Offer not found');
      }

      return { offer };
    },
  );

  app.get('/proposals', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const proposals = await listProposals(options.database);
    return { proposals };
  });

  app.get<{ Params: { id: string } }>(
    '/proposals/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const proposal = await getProposalById(options.database, request.params.id);

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      return { proposal };
    },
  );

  app.post('/proposals', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const { customerId, data } = parseCreateProposalInput(request.body);
    const proposal = await createProposal(options.database, customerId, data);

    reply.code(201);
    return { proposal };
  });

  app.patch<{ Params: { id: string } }>(
    '/proposals/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateProposalInput(request.body);
      const proposal = await updateProposal(options.database, request.params.id, data);

      if (!proposal) {
        throw new NotFoundError('Proposal not found');
      }

      return { proposal };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/send',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const proposal = await sendProposal(options.database, request.params.id);
      if (!proposal) throw new NotFoundError('Proposal not found');
      return { proposal };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/cancel',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const proposal = await cancelProposal(options.database, request.params.id);
      if (!proposal) throw new NotFoundError('Proposal not found');
      return { proposal };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/accept',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const proposal = await acceptProposal(options.database, request.params.id);
      if (!proposal) throw new NotFoundError('Proposal not found');
      return { proposal };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/proposals/:id/decline',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const proposal = await declineProposal(options.database, request.params.id);
      if (!proposal) throw new NotFoundError('Proposal not found');
      return { proposal };
    },
  );

  app.get('/transport/routes', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const routes = await listRoutes(options.database);
    return { routes };
  });

  app.get<{ Params: { id: string } }>(
    '/transport/routes/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const route = await getRouteById(options.database, request.params.id);
      if (!route) {
        throw new NotFoundError('Route not found');
      }
      return { route };
    },
  );

  app.post('/transport/routes', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = parseCreateRouteInput(request.body);
    const route = await createRoute(options.database, data);
    reply.code(201);
    return { route };
  });

  app.patch<{ Params: { id: string } }>(
    '/transport/routes/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateRouteInput(request.body);
      const route = await updateRoute(options.database, request.params.id, data);
      if (!route) {
        throw new NotFoundError('Route not found');
      }
      return { route };
    },
  );

  app.get<{ Params: { routeId: string } }>(
    '/transport/routes/:routeId/points',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const points = await listRoutePoints(options.database, request.params.routeId);
      return { points };
    },
  );

  app.post<{ Params: { routeId: string } }>(
    '/transport/routes/:routeId/points',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const data = parseCreateRoutePointInput(request.body);
      const point = await createRoutePoint(options.database, request.params.routeId, data);
      reply.code(201);
      return { point };
    },
  );

  app.patch<{ Params: { routeId: string; id: string } }>(
    '/transport/routes/:routeId/points/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateRoutePointInput(request.body);
      const point = await updateRoutePoint(
        options.database,
        request.params.routeId,
        request.params.id,
        data,
      );
      if (!point) {
        throw new NotFoundError('Route point not found');
      }
      return { point };
    },
  );

  app.post<{ Params: { routeId: string } }>(
    '/transport/routes/:routeId/points/reorder',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const orderedPointIds = parseReorderRoutePointsInput(request.body);
      const points = await reorderRoutePoints(
        options.database,
        request.params.routeId,
        orderedPointIds,
      );
      return { points };
    },
  );

  app.get('/transport/suppliers', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const suppliers = await listSuppliers(options.database);
    return { suppliers };
  });

  app.get<{ Params: { id: string } }>(
    '/transport/suppliers/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const supplier = await getSupplierById(options.database, request.params.id);
      if (!supplier) {
        throw new NotFoundError('Supplier not found');
      }
      return { supplier };
    },
  );

  app.post('/transport/suppliers', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = parseCreateSupplierInput(request.body);
    const supplier = await createSupplier(options.database, data);
    reply.code(201);
    return { supplier };
  });

  app.patch<{ Params: { id: string } }>(
    '/transport/suppliers/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateSupplierInput(request.body);
      const supplier = await updateSupplier(options.database, request.params.id, data);
      if (!supplier) {
        throw new NotFoundError('Supplier not found');
      }
      return { supplier };
    },
  );

  app.get('/transport/products', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const products = await listTransportProducts(options.database);
    return { products };
  });

  app.get<{ Params: { id: string } }>(
    '/transport/products/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const product = await getTransportProductById(options.database, request.params.id);
      if (!product) {
        throw new NotFoundError('Transport product not found');
      }
      return { product };
    },
  );

  app.post('/transport/products', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = parseCreateTransportProductInput(request.body);
    const product = await createTransportProduct(options.database, data);
    reply.code(201);
    return { product };
  });

  app.patch<{ Params: { id: string } }>(
    '/transport/products/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateTransportProductInput(request.body);
      const product = await updateTransportProduct(options.database, request.params.id, data);
      if (!product) {
        throw new NotFoundError('Transport product not found');
      }
      return { product };
    },
  );

  app.get('/transport/departures', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const departures = await listScheduledDepartures(options.database);
    return { departures };
  });

  app.get<{ Params: { id: string } }>(
    '/transport/departures/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const departure = await getScheduledDepartureById(options.database, request.params.id);
      if (!departure) {
        throw new NotFoundError('Scheduled departure not found');
      }
      return { departure };
    },
  );

  app.post('/transport/departures', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = parseCreateScheduledDepartureInput(request.body);
    const departure = await createScheduledDeparture(options.database, data);
    reply.code(201);
    return { departure };
  });

  app.patch<{ Params: { id: string } }>(
    '/transport/departures/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateScheduledDepartureInput(request.body);
      const departure = await updateScheduledDeparture(options.database, request.params.id, data);
      if (!departure) {
        throw new NotFoundError('Scheduled departure not found');
      }
      return { departure };
    },
  );

  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/transport/agenda',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const filters: { from?: Date; to?: Date } = {};
      if (request.query.from !== undefined) {
        const from = new Date(request.query.from);
        if (Number.isNaN(from.getTime())) {
          throw new ValidationError('Query param "from" must be a valid date');
        }
        filters.from = from;
      }
      if (request.query.to !== undefined) {
        const to = new Date(request.query.to);
        if (Number.isNaN(to.getTime())) {
          throw new ValidationError('Query param "to" must be a valid date');
        }
        filters.to = to;
      }
      const agenda = await getAgenda(options.database, filters);
      return { agenda };
    },
  );

  app.get('/bookings', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const bookings = await listBookings(options.database);
    return { bookings };
  });

  app.get<{ Params: { id: string } }>(
    '/bookings/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const result = await getBookingById(options.database, request.params.id);
      if (!result) {
        throw new NotFoundError('Booking not found');
      }
      return { booking: result.booking, passengers: result.passengers };
    },
  );

  // RBAC floor: AGENT, not MANAGER. Transportation's write floor
  // (ScheduledDeparture/TransportProduct/etc.) is MANAGER because those
  // are catalog/admin changes. Booking creation is closer in spirit to
  // Sale's "Criar" floor -- a day-to-day operational action performed by
  // front-line staff, not a catalog/admin change. No documented Booking
  // RBAC floor exists, so this is a precedent-based choice, recorded here
  // per the project's anti-invention discipline.
  app.post('/bookings', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateBookingInput(request.body);
    const result = await createBooking(options.database, data);
    reply.code(201);
    return { booking: result.booking, passengers: result.passengers };
  });

  app.post<{ Params: { id: string } }>(
    '/bookings/:id/cancel',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseCancelBookingInput(request.body);
      const booking = await cancelBooking(options.database, request.params.id, {
        ...data,
        userId: getUserId(),
      });
      return { booking };
    },
  );

  // ============================================================
  // FIELD OPERATIONS (TransportOperation / OperationCheckpoint)
  // ============================================================
  // RBAC floor reasoning: GET routes use VIEWER (read-only, same floor
  // as every other transport read endpoint above). POST /operations
  // (creating today's operation + generating checkpoints) and the two
  // confirmation endpoints are day-to-day operational actions taken by
  // field/ops staff -- the same reasoning already applied to Booking's
  // POST /bookings floor in this codebase -- so they use AGENT, one
  // level below the MANAGER floor used for administrative
  // Route/Product/Departure configuration changes above. There is no
  // DRIVER/GUIDE role and no staff-assignment mechanism (explicit
  // project constraint); confirmation is gated purely on "authenticated
  // user with AGENT+ role in this tenant", not on a specific assigned
  // individual -- that gap is deferred, not invented around.

  app.get('/operations', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const operations = await listOperations(options.database);
    return { operations };
  });

  app.post('/operational-staff', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = parseCreateOperationalStaffInput(request.body);
    const staff = await createOperationalStaff(options.database, data);
    reply.code(201);
    return { staff };
  });

  app.get<{ Params: { id: string } }>(
    '/operations/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const result = await getOperationById(options.database, request.params.id);
      if (!result) {
        throw new NotFoundError('Operation not found');
      }
      return result;
    },
  );

  app.post('/operations', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateOperationInput(request.body);
    const result = await createOperation(options.database, data);
    reply.code(201);
    return result;
  });

  app.post<{ Params: { id: string } }>(
    '/operations/:id/assignments',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const data = parseCreateOperationAssignmentInput(request.params.id, request.body);
      const assignment = await createOperationAssignment(options.database, {
        ...data,
        createdByUserId: getUserId(),
      });
      reply.code(201);
      return { assignment };
    },
  );

  app.post<{ Params: { id: string; checkpointId: string } }>(
    '/operations/:id/checkpoints/:checkpointId/arrival',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const checkpoint = await confirmArrival(
        options.database,
        request.params.id,
        request.params.checkpointId,
      );
      return { checkpoint };
    },
  );

  app.post<{ Params: { id: string; checkpointId: string } }>(
    '/operations/:id/checkpoints/:checkpointId/departure',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const checkpoint = await confirmDeparture(
        options.database,
        request.params.id,
        request.params.checkpointId,
      );
      return { checkpoint };
    },
  );

  // ============================================================
  // COMMERCIAL COCKPIT
  // Kanban stage lives ONLY on commercial_opportunities.stage -- these
  // routes never touch proposals.status or sales.status.
  // ============================================================

  app.get<{ Querystring: Record<string, string> }>(
    '/commercial/opportunities',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const filters = parseOpportunityFilters(request.query);
      const pagination = parsePagination(request.query);
      const { opportunities, total } = await listOpportunities(options.database, filters, pagination);
      return { opportunities, total, limit: pagination.limit, offset: pagination.offset };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/commercial/opportunities/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const opportunity = await getOpportunityById(options.database, request.params.id);
      if (!opportunity) {
        throw new NotFoundError('Opportunity not found');
      }
      return { opportunity };
    },
  );

  app.post('/commercial/opportunities', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateOpportunityInput(request.body);
    const opportunity = await createOpportunity(options.database, data);
    reply.code(201);
    return { opportunity };
  });

  app.patch<{ Params: { id: string } }>(
    '/commercial/opportunities/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const data = parseUpdateOpportunityInput(request.body);
      const opportunity = await updateOpportunity(options.database, request.params.id, data);
      if (!opportunity) {
        throw new NotFoundError('Opportunity not found');
      }
      return { opportunity };
    },
  );

  app.get<{ Querystring: Record<string, string> }>(
    '/commercial/tasks',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const filters = parseTaskFilters(request.query);
      const pagination = parsePagination(request.query);
      const { tasks, total } = await listTasks(options.database, filters, pagination);
      return { tasks, total, limit: pagination.limit, offset: pagination.offset };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/commercial/tasks/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const task = await getTaskById(options.database, request.params.id);
      if (!task) {
        throw new NotFoundError('Task not found');
      }
      return { task };
    },
  );

  app.post('/commercial/tasks', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateTaskInput(request.body);
    const task = await createTask(options.database, getUserId(), data);
    reply.code(201);
    return { task };
  });

  app.patch<{ Params: { id: string } }>(
    '/commercial/tasks/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const data = parseUpdateTaskInput(request.body);
      const task = await updateTask(options.database, request.params.id, data);
      if (!task) {
        throw new NotFoundError('Task not found');
      }
      return { task };
    },
  );

  app.get<{ Querystring: Record<string, string> }>(
    '/commercial/interactions',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const filters = parseInteractionFilters(request.query);
      const pagination = parsePagination(request.query);
      const { interactions, total } = await listInteractions(options.database, filters, pagination);
      return { interactions, total, limit: pagination.limit, offset: pagination.offset };
    },
  );

  app.post('/commercial/interactions', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateInteractionInput(request.body);
    const interaction = await createInteraction(options.database, getUserId(), data);
    reply.code(201);
    return { interaction };
  });

  app.get<{ Querystring: Record<string, string> }>(
    '/commercial/customers/search',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const q = request.query.q;
      if (typeof q !== 'string') {
        throw new ValidationError('Query parameter "q" is required');
      }
      const pagination = parsePagination(request.query);
      const customers = await searchCustomers(options.database, q, pagination);
      return { customers };
    },
  );

  app.get<{ Querystring: Record<string, string> }>(
    '/commercial/travel-search',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const range = parseTravelSearchRange(request.query);
      const destination = typeof request.query.destination === 'string' ? request.query.destination : undefined;
      const result = await travelSearch(options.database, range, destination);
      return result;
    },
  );

  app.get<{ Querystring: Record<string, string> }>(
    '/commercial/dashboard',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const pipelineId = typeof request.query.pipelineId === 'string' ? request.query.pipelineId : undefined;
      const summary = await getDashboardSummary(options.database, getUserId(), pipelineId);
      return summary;
    },
  );

  // Read-only agenda/dashboard-suggestion lists. Neither ever writes --
  // proposals stay unmanaged, and post-sale candidates only ever result
  // in a MANUAL CommercialTask creation via POST /commercial/tasks.
  app.get('/commercial/proposals-waiting', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const proposals = await getProposalsWaiting(options.database);
    return { proposals };
  });

  app.get('/commercial/post-sale-candidates', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const candidates = await getPostSaleCandidates(options.database);
    return { candidates };
  });

  // ============================================================
  // CONFIGURABLE MULTI-PIPELINE (migration 009_configurable_pipelines.sql)
  // Reading GET /commercial/pipelines is server-driven access control: it
  // only ever returns pipelines the caller may see (never all pipelines
  // filtered client-side). Every configuration write below requires
  // ADMIN (OWNER passes too, higher in ROLE_HIERARCHY) -- requirePipelineAdmin()
  // inside pipeline-config.ts is the actual enforcement, requireRole()
  // here is the route-level first gate matching the existing pattern.
  // ============================================================

  app.get('/commercial/pipelines', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const pipelines = await listPipelines(options.database);
    return { pipelines };
  });

  app.post('/commercial/pipelines', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseCreatePipelineInput(request.body);
    const pipeline = await createPipeline(options.database, data);
    reply.code(201);
    return { pipeline };
  });

  app.get<{ Params: { id: string } }>(
    '/commercial/pipelines/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const pipeline = await getPipelineById(options.database, request.params.id);
      if (!pipeline) {
        throw new NotFoundError('Pipeline not found');
      }
      return { pipeline };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/commercial/pipelines/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const data = parseUpdatePipelineInput(request.body);
      const pipeline = await updatePipeline(options.database, request.params.id, data);
      if (!pipeline) {
        throw new NotFoundError('Pipeline not found');
      }
      return { pipeline };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/commercial/pipelines/:id/stages',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const stages = await listStages(options.database, request.params.id);
      return { stages };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/commercial/pipelines/:id/stages',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      const data = parseCreateStageInput(request.body);
      const stage = await createStage(options.database, request.params.id, data);
      reply.code(201);
      return { stage };
    },
  );

  app.patch<{ Params: { id: string; stageId: string } }>(
    '/commercial/pipelines/:id/stages/:stageId',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const data = parseUpdateStageInput(request.body);
      const stage = await updateStage(options.database, request.params.id, request.params.stageId, data);
      if (!stage) {
        throw new NotFoundError('Stage not found');
      }
      return { stage };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/commercial/pipelines/:id/access',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const access = await listPipelineAccess(options.database, request.params.id);
      return { access };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/commercial/pipelines/:id/access',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      const data = parseGrantAccessInput(request.body);
      const access = await grantPipelineAccess(options.database, request.params.id, data.userId);
      reply.code(201);
      return { access };
    },
  );

  app.delete<{ Params: { id: string; userId: string } }>(
    '/commercial/pipelines/:id/access/:userId',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      await revokePipelineAccess(options.database, request.params.id, request.params.userId);
      reply.code(204);
      return null;
    },
  );
  // Sale RBAC (docs/03-security/authorization.md): "Listar todas" is
  // OWNER/ADMIN/MANAGER only, "Listar próprias" is all 5 roles. userId is
  // never populated from client input on create in this vertical, so there
  // is no client-controllable "own" subset to filter by -- GET /sales is a
  // single tenant-wide list gated at the lower floor ("listar próprias"),
  // i.e. VIEWER+, consistent with both documented rows since there is no
  // narrower subset to withhold from a VIEWER. "Editar status" (its own,
  // higher floor) is intentionally not exercised: this vertical treats
  // status as fully read-only (forbidden on POST/PATCH), so no
  // status-editing route exists at all.
  app.get('/sales', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const sales = await listSales(options.database);
    return { sales };
  });

  app.get<{ Params: { id: string } }>(
    '/sales/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const sale = await getSaleById(options.database, request.params.id);

      if (!sale) {
        throw new NotFoundError('Sale not found');
      }

      return { sale };
    },
  );

  app.post('/sales', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateSaleInput(request.body);
    const sale = await createSale(options.database, data);

    reply.code(201);
    return { sale };
  });

  app.patch<{ Params: { id: string } }>(
    '/sales/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const data = parseUpdateSaleInput(request.body);
      const sale = await updateSale(options.database, request.params.id, data);

      if (!sale) {
        throw new NotFoundError('Sale not found');
      }

      return { sale };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/sales/:id/confirm',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const sale = await confirmSale(options.database, request.params.id);
      if (!sale) throw new NotFoundError('Sale not found');
      return { sale };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/sales/:id/cancel',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const sale = await cancelSale(options.database, request.params.id);
      if (!sale) throw new NotFoundError('Sale not found');
      return { sale };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/sales/:id/mark-paid',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const sale = await markSalePaid(options.database, request.params.id);
      if (!sale) throw new NotFoundError('Sale not found');
      return { sale };
    },
  );

  app.get('/financial/receivables', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    const receivables = await listReceivables(options.database);
    return { receivables };
  });

  app.get('/financial/dashboard', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    const period = parseCashFlowPeriod(request.query);
    const cashFlow = await getCashFlowSummary(options.database, period);
    return { cashFlow };
  });

  app.post('/financial/receivables', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseCreateReceivableInput(request.body);
    const receivable = await createReceivable(options.database, data);
    reply.code(201);
    return { receivable };
  });

  app.post('/financial/payables', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseCreatePayableInput(request.body);
    const payable = await createPayable(options.database, data);
    reply.code(201);
    return { payable };
  });

  app.post('/financial/payments', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseRecordPaymentInput(request.body);
    const payment = await recordPayment(options.database, data);
    reply.code(201);
    return { payment };
  });

  app.post<{ Params: { id: string } }>(
    '/financial/payments/:id/allocations',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.ADMIN);
      const allocations = parsePaymentAllocationsInput(request.body);
      return allocatePayment(options.database, request.params.id, allocations);
    },
  );

  app.post('/financial/operational-costs', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const data = parseCreateOperationalCostInput(request.body);
    const operationalCost = await createOperationalCost(options.database, data);
    reply.code(201);
    return { operationalCost };
  });

  app.get('/pescador/captures', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.AGENT);
    const captures = await listExternalOfferCaptures(options.database);
    return { captures };
  });

  app.post('/pescador/captures', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateExternalOfferCaptureInput(request.body);
    const capture = await createExternalOfferCapture(options.database, data);
    reply.code(201);
    return { capture };
  });

  app.post<{ Params: { id: string } }>(
    '/pescador/captures/:id/review',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const capture = await moveCaptureToReview(options.database, request.params.id, getUserId());
      return { capture };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/pescador/captures/:id/approve',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const capture = await approveCapture(options.database, request.params.id, getUserId());
      return { capture };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/pescador/captures/:id/reject',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const capture = await rejectCapture(options.database, request.params.id, getUserId());
      return { capture };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/pescador/captures/:id/publish',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.ADMIN);
      const result = await publishCapture(options.database, request.params.id, getUserId());
      reply.code(201);
      return result;
    },
  );

  // ============================================================
  // OFFER & GROWTH ENGINE (batch 04 backend foundation)
  // Order of authorization per entitlements.md: entitlement check FIRST
  // (requireEntitlement), then RBAC (requireRole). No frontend UI in
  // this batch -- every route below is safe standalone.
  // ============================================================
  const mockConnector = options.mockConnector ?? new InternalMockConnector();

  app.get('/assets', { preHandler: protectedHooks }, async () => {
    await requireEntitlement(options.database, PlatformFeature.CREATIVE_STUDIO);
    requireRole(UserRole.VIEWER);
    const assets = await listAssets(options.database);
    return { assets };
  });

  app.post('/assets', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(options.database, PlatformFeature.CREATIVE_STUDIO);
    requireRole(UserRole.AGENT);
    const data = parseCreateAssetInput(request.body);
    const asset = await createAsset(options.database, data);
    reply.code(201);
    return { asset };
  });

  app.get('/campaigns', { preHandler: protectedHooks }, async () => {
    await requireEntitlement(options.database, PlatformFeature.CAMPAIGNS);
    requireRole(UserRole.VIEWER);
    const campaigns = await listCampaigns(options.database);
    return { campaigns };
  });

  app.get<{ Params: { id: string } }>('/campaigns/:id', { preHandler: protectedHooks }, async (request) => {
    await requireEntitlement(options.database, PlatformFeature.CAMPAIGNS);
    requireRole(UserRole.VIEWER);
    const campaign = await getCampaignById(options.database, request.params.id);
    return { campaign };
  });

  app.post('/campaigns', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(options.database, PlatformFeature.CAMPAIGNS);
    requireRole(UserRole.AGENT);
    const data = parseCreateCampaignInput(request.body);
    const campaign = await createCampaign(options.database, data);
    reply.code(201);
    return { campaign };
  });

  app.post<{ Params: { id: string }; Body: { offerId: string } }>(
    '/campaigns/:id/offers',
    { preHandler: protectedHooks },
    async (request, reply) => {
      await requireEntitlement(options.database, PlatformFeature.CAMPAIGNS);
      requireRole(UserRole.AGENT);
      const offerId = requireStringField(request.body, 'offerId');
      await linkOfferToCampaign(options.database, request.params.id, offerId);
      reply.code(204);
    },
  );

  app.post<{ Params: { id: string }; Body: { status: string } }>(
    '/campaigns/:id/status',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(options.database, PlatformFeature.CAMPAIGNS);
      const status = parseCampaignStatus(request.body?.status);
      // Publishing/activating a campaign requires campaign.publish RBAC;
      // any other transition requires campaign.write (write >= AGENT).
      requireRole(status === CampaignStatus.ACTIVE ? UserRole.MANAGER : UserRole.AGENT);
      const campaign = await transitionCampaignStatus(options.database, request.params.id, status);
      return { campaign };
    },
  );

  app.get('/publications', { preHandler: protectedHooks }, async () => {
    await requireEntitlement(options.database, PlatformFeature.SOCIAL_PUBLISHING);
    requireRole(UserRole.VIEWER);
    const publications = await listPublications(options.database);
    return { publications };
  });

  app.get<{ Params: { id: string } }>(
    '/publications/:id',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(options.database, PlatformFeature.SOCIAL_PUBLISHING);
      requireRole(UserRole.VIEWER);
      const publication = await getPublicationById(options.database, request.params.id);
      return { publication };
    },
  );

  app.post('/publications', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(options.database, PlatformFeature.SOCIAL_PUBLISHING);
    requireRole(UserRole.AGENT);
    const data = parseCreatePublicationInput(request.body);
    const publication = await createPublication(options.database, data);
    reply.code(201);
    return { publication };
  });

  app.post<{ Params: { id: string }; Body: { snapshot: Record<string, unknown> } }>(
    '/publications/:id/snapshot',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(options.database, PlatformFeature.SOCIAL_PUBLISHING);
      requireRole(UserRole.AGENT);
      if (typeof request.body?.snapshot !== 'object' || request.body.snapshot === null) {
        throw new ValidationError('Field "snapshot" is required and must be an object');
      }
      const publication = await generatePublicationSnapshot(
        options.database,
        request.params.id,
        request.body.snapshot,
      );
      return { publication };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/publications/:id/publish',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(options.database, PlatformFeature.SOCIAL_PUBLISHING);
      requireRole(UserRole.MANAGER);
      const publication = await publishViaConnector(options.database, mockConnector, request.params.id);
      return { publication };
    },
  );

  app.post<{ Params: { id: string }; Body: { status: string } }>(
    '/publications/:id/status',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(options.database, PlatformFeature.SOCIAL_PUBLISHING);
      requireRole(UserRole.AGENT);
      const status = parsePublicationStatus(request.body?.status);
      const publication = await transitionPublicationStatus(options.database, request.params.id, status);
      return { publication };
    },
  );

  app.get('/engagements', { preHandler: protectedHooks }, async () => {
    await requireEntitlement(options.database, PlatformFeature.SOCIAL_AUTOMATION);
    requireRole(UserRole.VIEWER);
    const engagements = await listEngagements(options.database);
    return { engagements };
  });

  app.get('/automations', { preHandler: protectedHooks }, async () => {
    await requireEntitlement(options.database, PlatformFeature.SOCIAL_AUTOMATION);
    requireRole(UserRole.VIEWER);
    const automations = await listAutomations(options.database);
    return { automations };
  });

  app.get<{ Params: { id: string } }>(
    '/automations/:id',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(options.database, PlatformFeature.SOCIAL_AUTOMATION);
      requireRole(UserRole.VIEWER);
      const automation = await getAutomationById(options.database, request.params.id);
      return { automation };
    },
  );

  app.post('/automations', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(options.database, PlatformFeature.SOCIAL_AUTOMATION);
    requireRole(UserRole.AGENT);
    const data = parseCreateAutomationInput(request.body);
    const automation = await createAutomation(options.database, data);
    reply.code(201);
    return { automation };
  });

  app.post<{ Params: { id: string } }>(
    '/automations/:id/activate',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(options.database, PlatformFeature.SOCIAL_AUTOMATION);
      requireRole(UserRole.MANAGER);
      const automation = await setAutomationStatus(options.database, request.params.id, AutomationStatus.ACTIVE);
      return { automation };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/automations/:id/pause',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(options.database, PlatformFeature.SOCIAL_AUTOMATION);
      requireRole(UserRole.MANAGER);
      const automation = await setAutomationStatus(options.database, request.params.id, AutomationStatus.PAUSED);
      return { automation };
    },
  );

  // Drives the internal mock connector's simulateComment()/
  // simulateMessage() output through the real automation engine. Used
  // by tests (see the Cancun E2E test) to exercise the full chain
  // end-to-end without any real Meta/WhatsApp API.
  app.post<{
    Body: {
      kind: 'comment' | 'message';
      externalUserId: string;
      content: string;
      campaignId?: string;
      publicationId?: string;
      offerId?: string;
    };
  }>('/connectors/internal-mock/simulate', { preHandler: protectedHooks }, async (request) => {
    await requireEntitlement(options.database, PlatformFeature.SOCIAL_AUTOMATION);
    requireRole(UserRole.AGENT);
    const agencyId = getAgencyId();
    const body = request.body ?? ({} as never);
    const event: ConnectorEvent =
      body.kind === 'message'
        ? mockConnector.simulateMessage({ agencyId, externalUserId: body.externalUserId, content: body.content })
        : mockConnector.simulateComment({ agencyId, externalUserId: body.externalUserId, content: body.content });

    const result = await processConnectorEvent(options.database, mockConnector, event, {
      ...(body.campaignId !== undefined ? { campaignId: body.campaignId } : {}),
      ...(body.publicationId !== undefined ? { publicationId: body.publicationId } : {}),
      ...(body.offerId !== undefined ? { offerId: body.offerId } : {}),
    });
    return result;
  });

  app.get('/coupons', { preHandler: protectedHooks }, async () => {
    await requireEntitlement(options.database, PlatformFeature.CAMPAIGNS);
    requireRole(UserRole.VIEWER);
    const coupons = await listCoupons(options.database);
    return { coupons };
  });

  app.post('/coupons', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(options.database, PlatformFeature.CAMPAIGNS);
    requireRole(UserRole.AGENT);
    const data = parseCreateCouponInput(request.body);
    const coupon = await createCoupon(options.database, data);
    reply.code(201);
    return { coupon };
  });

  app.post('/coupons/grants', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(options.database, PlatformFeature.CAMPAIGNS);
    requireRole(UserRole.AGENT);
    const data = parseGrantCouponInput(request.body);
    const grant = await grantCoupon(options.database, data);
    reply.code(201);
    return { grant };
  });

  app.post('/coupons/redemptions', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(options.database, PlatformFeature.CAMPAIGNS);
    requireRole(UserRole.AGENT);
    const data = parseRecordRedemptionInput(request.body);
    const redemption = await recordRedemption(options.database, data);
    reply.code(201);
    return { redemption };
  });

  app.get('/entitlements', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const entitlements = await listEntitlements(options.database);
    return { entitlements };
  });

  app.get('/offer-growth/audit-log', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    const entries = await listAuditLog(options.database);
    return { entries };
  });

  // Platform-scoped entitlement WRITE stopgap. Deliberately mounted
  // OUTSIDE protectedHooks -- no agency JWT/session can satisfy it. See
  // entitlements.ts's header comment: this is a documented temporary
  // stopgap (dual-gated like ALLOW_DEV_AUTH), not a real Super Admin
  // boundary, because no real platform-admin identity exists yet.
  app.post<{ Body: SetAgencyEntitlementInput }>('/platform/entitlements', async (request, reply) => {
    const stopgap = options.platformStopgap;
    if (!stopgap || stopgap.enabled !== true) {
      reply.code(404);
      return { error: 'Not found' };
    }
    const providedKey = request.headers['x-platform-stopgap-key'];
    if (typeof providedKey !== 'string' || providedKey.length === 0 || providedKey !== stopgap.sharedKey) {
      reply.code(401);
      return { error: 'Unauthorized' };
    }
    const body = request.body ?? ({} as SetAgencyEntitlementInput);
    const entitlement = await setAgencyEntitlementViaPlatformStopgap(
      stopgap.database,
      body,
      'platform-stopgap',
    );
    reply.code(200);
    return { entitlement };
  });

  if (options.exposeTestRoutes === true) {
    app.post('/__test/rate-limit-proof', { preHandler: protectedHooks }, () => ({
      status: 'ok',
    }));

    app.post('/__test/rollback-proof', { preHandler: protectedHooks }, async () => {
      await options.database.withTenantTransaction(async (client) => {
        await client.query(
          'INSERT INTO offers (agency_id, name, price, status) VALUES ($1, $2, $3, $4)',
          [getAgencyId(), 'Rollback Probe', 1, 'ACTIVE'],
        );
        throw new Error('Synthetic rollback probe failure');
      });
    });
  }

  return app;
}

function createRateLimitHook(options: RateLimitOptions | undefined) {
  const enabled = options?.enabled ?? true;
  const windowMs = options?.windowMs ?? 60_000;
  const max = options?.max ?? 300;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return function rateLimitHook(
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void {
    if (!enabled || !isRateLimitedMethod(request.method)) {
      done();
      return;
    }

    const now = Date.now();
    const key = `${request.ip}:${request.method}:${request.url.split('?')[0] ?? request.url}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      done();
      return;
    }

    bucket.count += 1;
    if (bucket.count <= max) {
      done();
      return;
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    reply.header('retry-after', String(retryAfterSeconds));
    reply.code(429).send({
      error: 'Too many requests',
      code: 'RATE_LIMITED',
    });
  };
}

function isRateLimitedMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
}

const FORBIDDEN_CREATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdBy',
  'deletedAt',
  'createdAt',
  'updatedAt',
  'status',
] as const;

const ALLOWED_CREATE_FIELDS = [
  'name',
  'email',
  'phone',
  'cpf',
  'passport',
  'address',
  'notes',
] as const;

const ALLOWED_UPDATE_FIELDS = ['name', 'email', 'phone'] as const;

function parseCreateCustomerInput(body: unknown): CreateCustomerInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_CREATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    throw new ValidationError('Field "name" is required and must be a non-empty string');
  }

  const data: CreateCustomerInput = { name: record.name };

  if (record.email !== undefined) {
    if (typeof record.email !== 'string') {
      throw new ValidationError('Field "email" must be a string');
    }
    data.email = record.email;
  }
  if (record.phone !== undefined) {
    if (typeof record.phone !== 'string') {
      throw new ValidationError('Field "phone" must be a string');
    }
    data.phone = record.phone;
  }
  if (record.cpf !== undefined) {
    if (typeof record.cpf !== 'string') {
      throw new ValidationError('Field "cpf" must be a string');
    }
    data.cpf = record.cpf;
  }
  if (record.passport !== undefined) {
    if (typeof record.passport !== 'string') {
      throw new ValidationError('Field "passport" must be a string');
    }
    data.passport = record.passport;
  }
  if (record.address !== undefined) {
    if (typeof record.address !== 'object' || record.address === null || Array.isArray(record.address)) {
      throw new ValidationError('Field "address" must be an object');
    }
    data.address = record.address as Record<string, unknown>;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  return data;
}

function parseUpdateCustomerInput(body: unknown): UpdateCustomerInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Field "${key}" is not allowed in the request body`);
    }
  }

  const data: UpdateCustomerInput = {};

  if (record.name !== undefined) {
    if (typeof record.name !== 'string' || record.name.trim().length === 0) {
      throw new ValidationError('Field "name" must be a non-empty string');
    }
    data.name = record.name;
  }
  if (record.email !== undefined) {
    if (typeof record.email !== 'string') {
      throw new ValidationError('Field "email" must be a string');
    }
    data.email = record.email;
  }
  if (record.phone !== undefined) {
    if (typeof record.phone !== 'string') {
      throw new ValidationError('Field "phone" must be a string');
    }
    data.phone = record.phone;
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}

const FORBIDDEN_WISH_CREATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'status',
] as const;

const ALLOWED_WISH_CREATE_FIELDS = [
  'customerId',
  'destination',
  'startDate',
  'endDate',
  'budget',
  'travelersCount',
  'notes',
] as const;

const FORBIDDEN_WISH_UPDATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'status',
  'customerId',
] as const;

const ALLOWED_WISH_UPDATE_FIELDS = [
  'destination',
  'startDate',
  'endDate',
  'budget',
  'travelersCount',
  'notes',
] as const;

function parseWishDate(value: unknown, field: string): Date {
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Field "${field}" must be a valid date`);
  }

  return date;
}

function parseCreateWishInput(body: unknown): { customerId: string; data: CreateWishInput } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_WISH_CREATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_WISH_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.customerId !== 'string' || record.customerId.trim().length === 0) {
    throw new ValidationError('Field "customerId" is required and must be a non-empty string');
  }

  const data: CreateWishInput = {};

  if (record.destination !== undefined) {
    if (typeof record.destination !== 'string') {
      throw new ValidationError('Field "destination" must be a string');
    }
    data.destination = record.destination;
  }
  if (record.startDate !== undefined) {
    data.startDate = parseWishDate(record.startDate, 'startDate');
  }
  if (record.endDate !== undefined) {
    data.endDate = parseWishDate(record.endDate, 'endDate');
  }
  if (record.budget !== undefined) {
    if (typeof record.budget !== 'number' || Number.isNaN(record.budget)) {
      throw new ValidationError('Field "budget" must be a number');
    }
    data.budget = record.budget;
  }
  if (record.travelersCount !== undefined) {
    if (typeof record.travelersCount !== 'number' || Number.isNaN(record.travelersCount)) {
      throw new ValidationError('Field "travelersCount" must be a number');
    }
    data.travelersCount = record.travelersCount;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  return { customerId: record.customerId, data };
}

function parseUpdateWishInput(body: unknown): UpdateWishInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_WISH_UPDATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_WISH_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  const data: UpdateWishInput = {};

  if (record.destination !== undefined) {
    if (typeof record.destination !== 'string') {
      throw new ValidationError('Field "destination" must be a string');
    }
    data.destination = record.destination;
  }
  if (record.startDate !== undefined) {
    data.startDate = parseWishDate(record.startDate, 'startDate');
  }
  if (record.endDate !== undefined) {
    data.endDate = parseWishDate(record.endDate, 'endDate');
  }
  if (record.budget !== undefined) {
    if (typeof record.budget !== 'number' || Number.isNaN(record.budget)) {
      throw new ValidationError('Field "budget" must be a number');
    }
    data.budget = record.budget;
  }
  if (record.travelersCount !== undefined) {
    if (typeof record.travelersCount !== 'number' || Number.isNaN(record.travelersCount)) {
      throw new ValidationError('Field "travelersCount" must be a number');
    }
    data.travelersCount = record.travelersCount;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}

const FORBIDDEN_TRIP_CREATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'status',
  'saleId',
] as const;

const ALLOWED_TRIP_CREATE_FIELDS = [
  'customerId',
  'name',
  'destination',
  'startDate',
  'endDate',
  'description',
  'notes',
] as const;

const FORBIDDEN_TRIP_UPDATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'status',
  'customerId',
  'saleId',
] as const;

const ALLOWED_TRIP_UPDATE_FIELDS = [
  'name',
  'destination',
  'startDate',
  'endDate',
  'description',
  'notes',
] as const;

function parseTripDate(value: unknown, field: string): Date {
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Field "${field}" must be a valid date`);
  }

  return date;
}

function parseCreateTripInput(body: unknown): { customerId: string; data: CreateTripInput } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_TRIP_CREATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_TRIP_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.customerId !== 'string' || record.customerId.trim().length === 0) {
    throw new ValidationError('Field "customerId" is required and must be a non-empty string');
  }
  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    throw new ValidationError('Field "name" is required and must be a non-empty string');
  }
  if (typeof record.destination !== 'string' || record.destination.trim().length === 0) {
    throw new ValidationError('Field "destination" is required and must be a non-empty string');
  }
  if (record.startDate === undefined) {
    throw new ValidationError('Field "startDate" is required');
  }
  if (record.endDate === undefined) {
    throw new ValidationError('Field "endDate" is required');
  }

  const data: CreateTripInput = {
    name: record.name,
    destination: record.destination,
    startDate: parseTripDate(record.startDate, 'startDate'),
    endDate: parseTripDate(record.endDate, 'endDate'),
  };

  if (record.description !== undefined) {
    if (typeof record.description !== 'string') {
      throw new ValidationError('Field "description" must be a string');
    }
    data.description = record.description;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  return { customerId: record.customerId, data };
}

function parseUpdateTripInput(body: unknown): UpdateTripInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_TRIP_UPDATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_TRIP_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  const data: UpdateTripInput = {};

  if (record.name !== undefined) {
    if (typeof record.name !== 'string' || record.name.trim().length === 0) {
      throw new ValidationError('Field "name" must be a non-empty string');
    }
    data.name = record.name;
  }
  if (record.destination !== undefined) {
    if (typeof record.destination !== 'string' || record.destination.trim().length === 0) {
      throw new ValidationError('Field "destination" must be a non-empty string');
    }
    data.destination = record.destination;
  }
  if (record.startDate !== undefined) {
    data.startDate = parseTripDate(record.startDate, 'startDate');
  }
  if (record.endDate !== undefined) {
    data.endDate = parseTripDate(record.endDate, 'endDate');
  }
  if (record.description !== undefined) {
    if (typeof record.description !== 'string') {
      throw new ValidationError('Field "description" must be a string');
    }
    data.description = record.description;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}

const FORBIDDEN_OFFER_CREATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'status',
] as const;

const ALLOWED_OFFER_CREATE_FIELDS = [
  'name',
  'description',
  'price',
  'validFrom',
  'validUntil',
] as const;

const FORBIDDEN_OFFER_UPDATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
] as const;

const ALLOWED_OFFER_UPDATE_FIELDS = [
  'name',
  'description',
  'price',
  'validFrom',
  'validUntil',
  'status',
] as const;

const VALID_OFFER_STATUS_VALUES = ['ACTIVE', 'INACTIVE', 'EXPIRED'] as const;

function parseOfferDate(value: unknown, field: string): Date {
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Field "${field}" must be a valid date`);
  }

  return date;
}

function parseOfferPrice(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ValidationError('Field "price" must be a number');
  }
  if (value < 0) {
    throw new ValidationError('Field "price" must not be negative');
  }
  return value;
}

function parseCreateOfferInput(body: unknown): CreateOfferInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_OFFER_CREATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_OFFER_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    throw new ValidationError('Field "name" is required and must be a non-empty string');
  }
  if (record.price === undefined) {
    throw new ValidationError('Field "price" is required');
  }

  const data: CreateOfferInput = {
    name: record.name,
    price: parseOfferPrice(record.price),
  };

  if (record.description !== undefined) {
    if (typeof record.description !== 'string') {
      throw new ValidationError('Field "description" must be a string');
    }
    data.description = record.description;
  }
  if (record.validFrom !== undefined) {
    data.validFrom = parseOfferDate(record.validFrom, 'validFrom');
  }
  if (record.validUntil !== undefined) {
    data.validUntil = parseOfferDate(record.validUntil, 'validUntil');
  }

  return data;
}

function parseUpdateOfferInput(body: unknown): UpdateOfferInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_OFFER_UPDATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_OFFER_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  const data: UpdateOfferInput = {};

  if (record.name !== undefined) {
    if (typeof record.name !== 'string' || record.name.trim().length === 0) {
      throw new ValidationError('Field "name" must be a non-empty string');
    }
    data.name = record.name;
  }
  if (record.description !== undefined) {
    if (typeof record.description !== 'string') {
      throw new ValidationError('Field "description" must be a string');
    }
    data.description = record.description;
  }
  if (record.price !== undefined) {
    data.price = parseOfferPrice(record.price);
  }
  if (record.validFrom !== undefined) {
    data.validFrom = parseOfferDate(record.validFrom, 'validFrom');
  }
  if (record.validUntil !== undefined) {
    data.validUntil = parseOfferDate(record.validUntil, 'validUntil');
  }
  if (record.status !== undefined) {
    if (
      typeof record.status !== 'string' ||
      !(VALID_OFFER_STATUS_VALUES as readonly string[]).includes(record.status)
    ) {
      throw new ValidationError('Field "status" must be one of ACTIVE, INACTIVE, EXPIRED');
    }
    data.status = record.status as NonNullable<UpdateOfferInput['status']>;
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}

const FORBIDDEN_PROPOSAL_CREATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'total',
  'status',
  'userId',
] as const;

const ALLOWED_PROPOSAL_CREATE_FIELDS = [
  'customerId',
  'offerId',
  'wishId',
  'proposedPrice',
  'discount',
  'validUntil',
  'conditions',
  'notes',
] as const;

const FORBIDDEN_PROPOSAL_UPDATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'total',
  'status',
  'userId',
  'customerId',
  'offerId',
  'wishId',
] as const;

const ALLOWED_PROPOSAL_UPDATE_FIELDS = [
  'proposedPrice',
  'discount',
  'validUntil',
  'conditions',
  'notes',
] as const;

function parseProposalDate(value: unknown, field: string): Date {
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Field "${field}" must be a valid date`);
  }

  return date;
}

function parseProposalMoney(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ValidationError(`Field "${field}" must be a number`);
  }
  if (value < 0) {
    throw new ValidationError(`Field "${field}" must not be negative`);
  }
  return value;
}

function parseCreateProposalInput(body: unknown): {
  customerId: string;
  data: CreateProposalInput;
} {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_PROPOSAL_CREATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_PROPOSAL_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.customerId !== 'string' || record.customerId.trim().length === 0) {
    throw new ValidationError('Field "customerId" is required and must be a non-empty string');
  }
  if (record.proposedPrice === undefined) {
    throw new ValidationError('Field "proposedPrice" is required');
  }

  const data: CreateProposalInput = {
    proposedPrice: parseProposalMoney(record.proposedPrice, 'proposedPrice'),
  };

  if (record.offerId !== undefined) {
    if (typeof record.offerId !== 'string' || record.offerId.trim().length === 0) {
      throw new ValidationError('Field "offerId" must be a non-empty string');
    }
    data.offerId = record.offerId;
  }
  if (record.wishId !== undefined) {
    if (typeof record.wishId !== 'string' || record.wishId.trim().length === 0) {
      throw new ValidationError('Field "wishId" must be a non-empty string');
    }
    data.wishId = record.wishId;
  }
  if (record.discount !== undefined) {
    data.discount = parseProposalMoney(record.discount, 'discount');
  }
  if (record.validUntil !== undefined) {
    data.validUntil = parseProposalDate(record.validUntil, 'validUntil');
  }
  if (record.conditions !== undefined) {
    if (typeof record.conditions !== 'string') {
      throw new ValidationError('Field "conditions" must be a string');
    }
    data.conditions = record.conditions;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  if (data.discount !== undefined && data.discount > data.proposedPrice) {
    throw new ValidationError('Field "discount" must not exceed "proposedPrice"');
  }

  return { customerId: record.customerId, data };
}

function parseUpdateProposalInput(body: unknown): UpdateProposalInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_PROPOSAL_UPDATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_PROPOSAL_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  const data: UpdateProposalInput = {};

  if (record.proposedPrice !== undefined) {
    data.proposedPrice = parseProposalMoney(record.proposedPrice, 'proposedPrice');
  }
  if (record.discount !== undefined) {
    data.discount = parseProposalMoney(record.discount, 'discount');
  }
  if (record.validUntil !== undefined) {
    data.validUntil = parseProposalDate(record.validUntil, 'validUntil');
  }
  if (record.conditions !== undefined) {
    if (typeof record.conditions !== 'string') {
      throw new ValidationError('Field "conditions" must be a string');
    }
    data.conditions = record.conditions;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  if (
    data.proposedPrice !== undefined &&
    data.discount !== undefined &&
    data.discount > data.proposedPrice
  ) {
    throw new ValidationError('Field "discount" must not exceed "proposedPrice"');
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}

const FORBIDDEN_SALE_CREATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'total',
  'status',
  'userId',
  'paidAt',
] as const;

const ALLOWED_SALE_CREATE_FIELDS = [
  'customerId',
  'proposalId',
  'brokerId',
  'amount',
  'discount',
  'notes',
] as const;

const FORBIDDEN_SALE_UPDATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'total',
  'status',
  'userId',
  'paidAt',
  'customerId',
  'proposalId',
  'brokerId',
] as const;

const ALLOWED_SALE_UPDATE_FIELDS = ['amount', 'discount', 'notes'] as const;

function parseSaleMoney(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ValidationError(`Field "${field}" must be a number`);
  }
  if (value < 0) {
    throw new ValidationError(`Field "${field}" must not be negative`);
  }
  return value;
}

function parseCreateSaleInput(body: unknown): CreateSaleInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_SALE_CREATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_SALE_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.customerId !== 'string' || record.customerId.trim().length === 0) {
    throw new ValidationError('Field "customerId" is required and must be a non-empty string');
  }
  if (record.amount === undefined) {
    throw new ValidationError('Field "amount" is required');
  }

  const data: CreateSaleInput = {
    customerId: record.customerId,
    amount: parseSaleMoney(record.amount, 'amount'),
  };

  if (record.proposalId !== undefined) {
    if (typeof record.proposalId !== 'string' || record.proposalId.trim().length === 0) {
      throw new ValidationError('Field "proposalId" must be a non-empty string');
    }
    data.proposalId = record.proposalId;
  }
  if (record.brokerId !== undefined) {
    if (typeof record.brokerId !== 'string' || record.brokerId.trim().length === 0) {
      throw new ValidationError('Field "brokerId" must be a non-empty string');
    }
    data.brokerId = record.brokerId;
  }
  if (record.discount !== undefined) {
    data.discount = parseSaleMoney(record.discount, 'discount');
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  return data;
}

function parseUpdateSaleInput(body: unknown): UpdateSaleInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }

  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_SALE_UPDATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!(ALLOWED_SALE_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  const data: UpdateSaleInput = {};

  if (record.amount !== undefined) {
    data.amount = parseSaleMoney(record.amount, 'amount');
  }
  if (record.discount !== undefined) {
    data.discount = parseSaleMoney(record.discount, 'discount');
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}

// ============================================================
// FINANCIAL
// ============================================================

const FORBIDDEN_FINANCIAL_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'createdBy',
  'status',
] as const;

const ALLOWED_RECEIVABLE_CREATE_FIELDS = [
  'saleId',
  'customerId',
  'description',
  'amount',
  'dueAt',
] as const;

const ALLOWED_PAYABLE_CREATE_FIELDS = [
  'saleId',
  'supplierId',
  'commissionId',
  'transportOperationId',
  'operationalCostId',
  'description',
  'amount',
  'dueAt',
] as const;

const ALLOWED_PAYMENT_CREATE_FIELDS = [
  'direction',
  'amount',
  'occurredAt',
  'method',
  'reference',
  'notes',
] as const;

const ALLOWED_OPERATIONAL_COST_CREATE_FIELDS = [
  'saleId',
  'transportOperationId',
  'supplierId',
  'description',
  'costType',
  'expectedAmount',
  'actualAmount',
  'incurredAt',
] as const;

function parseCreateReceivableInput(body: unknown): CreateReceivableInput {
  const record = parseObjectBody(body);
  assertAllowedFields(record, FORBIDDEN_FINANCIAL_FIELDS, ALLOWED_RECEIVABLE_CREATE_FIELDS);

  return {
    customerId: parseRequiredString(record.customerId, 'customerId'),
    description: parseRequiredString(record.description, 'description'),
    amount: parsePositiveNumber(record.amount, 'amount'),
    dueAt: parseRequiredDate(record.dueAt, 'dueAt'),
    ...(record.saleId !== undefined ? { saleId: parseRequiredString(record.saleId, 'saleId') } : {}),
  };
}

function parseCreatePayableInput(body: unknown): CreatePayableInput {
  const record = parseObjectBody(body);
  assertAllowedFields(record, FORBIDDEN_FINANCIAL_FIELDS, ALLOWED_PAYABLE_CREATE_FIELDS);

  return {
    description: parseRequiredString(record.description, 'description'),
    amount: parsePositiveNumber(record.amount, 'amount'),
    dueAt: parseRequiredDate(record.dueAt, 'dueAt'),
    ...(record.saleId !== undefined ? { saleId: parseRequiredString(record.saleId, 'saleId') } : {}),
    ...(record.supplierId !== undefined
      ? { supplierId: parseRequiredString(record.supplierId, 'supplierId') }
      : {}),
    ...(record.commissionId !== undefined
      ? { commissionId: parseRequiredString(record.commissionId, 'commissionId') }
      : {}),
    ...(record.transportOperationId !== undefined
      ? {
          transportOperationId: parseRequiredString(
            record.transportOperationId,
            'transportOperationId',
          ),
        }
      : {}),
    ...(record.operationalCostId !== undefined
      ? { operationalCostId: parseRequiredString(record.operationalCostId, 'operationalCostId') }
      : {}),
  };
}

function parseRecordPaymentInput(body: unknown): RecordPaymentInput {
  const record = parseObjectBody(body);
  assertAllowedFields(record, FORBIDDEN_FINANCIAL_FIELDS, ALLOWED_PAYMENT_CREATE_FIELDS);
  if (typeof record.direction !== 'string' || !Object.values(PaymentDirection).includes(record.direction as PaymentDirection)) {
    throw new ValidationError('Field "direction" must be IN or OUT');
  }

  return {
    direction: record.direction as PaymentDirection,
    amount: parsePositiveNumber(record.amount, 'amount'),
    occurredAt: parseRequiredDate(record.occurredAt, 'occurredAt'),
    ...(record.method !== undefined ? { method: parseRequiredString(record.method, 'method') } : {}),
    ...(record.reference !== undefined
      ? { reference: parseRequiredString(record.reference, 'reference') }
      : {}),
    ...(record.notes !== undefined ? { notes: parseRequiredString(record.notes, 'notes') } : {}),
  };
}

function parsePaymentAllocationsInput(body: unknown): CreatePaymentAllocationInput[] {
  const record = parseObjectBody(body);
  assertAllowedFields(record, FORBIDDEN_FINANCIAL_FIELDS, ['allocations'] as const);
  if (!Array.isArray(record.allocations) || record.allocations.length === 0) {
    throw new ValidationError('Field "allocations" must be a non-empty array');
  }
  return record.allocations.map((value) => {
    const allocation = parseObjectBody(value);
    assertAllowedFields(
      allocation,
      FORBIDDEN_FINANCIAL_FIELDS,
      ['receivableId', 'payableId', 'amount'] as const,
    );
    return {
      amount: parsePositiveNumber(allocation.amount, 'amount'),
      ...(allocation.receivableId !== undefined
        ? { receivableId: parseRequiredString(allocation.receivableId, 'receivableId') }
        : {}),
      ...(allocation.payableId !== undefined
        ? { payableId: parseRequiredString(allocation.payableId, 'payableId') }
        : {}),
    };
  });
}

function parseCreateOperationalCostInput(body: unknown): CreateOperationalCostInput {
  const record = parseObjectBody(body);
  assertAllowedFields(record, FORBIDDEN_FINANCIAL_FIELDS, ALLOWED_OPERATIONAL_COST_CREATE_FIELDS);

  return {
    description: parseRequiredString(record.description, 'description'),
    costType: parseRequiredString(record.costType, 'costType'),
    incurredAt: parseRequiredDate(record.incurredAt, 'incurredAt'),
    ...(record.saleId !== undefined ? { saleId: parseRequiredString(record.saleId, 'saleId') } : {}),
    ...(record.transportOperationId !== undefined
      ? {
          transportOperationId: parseRequiredString(
            record.transportOperationId,
            'transportOperationId',
          ),
        }
      : {}),
    ...(record.supplierId !== undefined
      ? { supplierId: parseRequiredString(record.supplierId, 'supplierId') }
      : {}),
    ...(record.expectedAmount !== undefined
      ? { expectedAmount: parseNonNegativeNumber(record.expectedAmount, 'expectedAmount') }
      : {}),
    ...(record.actualAmount !== undefined
      ? { actualAmount: parseNonNegativeNumber(record.actualAmount, 'actualAmount') }
      : {}),
  };
}

function parseCashFlowPeriod(query: unknown): CashFlowPeriod {
  const record = parseObjectBody(query);
  return {
    from: parseRequiredDate(record.from, 'from'),
    to: parseRequiredDate(record.to, 'to'),
  };
}

function parseCreateExternalOfferCaptureInput(body: unknown): CreateExternalOfferCaptureInput {
  const record = parseObjectBody(body);
  const allowed = [
    'sourceUrl',
    'sourceName',
    'rawContent',
    'normalizedTitle',
    'normalizedDescription',
    'foundPrice',
    'currency',
    'validUntil',
  ] as const;
  assertAllowedFields(
    record,
    [
      'agencyId',
      'tenantId',
      'id',
      'status',
      'reviewedAt',
      'reviewedByUserId',
      'publishedOfferId',
      'createdAt',
      'updatedAt',
    ],
    allowed,
  );

  const data: CreateExternalOfferCaptureInput = {
    sourceUrl: parseRequiredString(record.sourceUrl, 'sourceUrl'),
    sourceName: parseRequiredString(record.sourceName, 'sourceName'),
    rawContent: parseRequiredString(record.rawContent, 'rawContent'),
  };

  if (record.normalizedTitle !== undefined) {
    data.normalizedTitle = parseRequiredString(record.normalizedTitle, 'normalizedTitle');
  }
  if (record.normalizedDescription !== undefined) {
    data.normalizedDescription = parseRequiredString(
      record.normalizedDescription,
      'normalizedDescription',
    );
  }
  if (record.foundPrice !== undefined) {
    data.foundPrice = parseNonNegativeNumber(record.foundPrice, 'foundPrice');
  }
  if (record.currency !== undefined) {
    data.currency = parseRequiredString(record.currency, 'currency');
  }
  if (record.validUntil !== undefined) {
    data.validUntil = parseRequiredDate(record.validUntil, 'validUntil');
  }

  return data;
}

// ============================================================
// OFFER & GROWTH ENGINE request parsers
// ============================================================

function requireStringField(body: unknown, field: string): string {
  const record = parseObjectBody(body);
  return parseRequiredString(record[field], field);
}

function parseCreateAssetInput(body: unknown): CreateAssetInput {
  const record = parseObjectBody(body);
  if (!Object.values(AssetType).includes(record.type as AssetType)) {
    throw new ValidationError('Field "type" must be a valid AssetType');
  }
  if (!Object.values(AssetSourceType).includes(record.source as AssetSourceType)) {
    throw new ValidationError('Field "source" must be a valid AssetSourceType');
  }
  const data: CreateAssetInput = {
    type: record.type as AssetType,
    source: record.source as AssetSourceType,
  };
  if (record.storageUrl !== undefined) data.storageUrl = parseRequiredString(record.storageUrl, 'storageUrl');
  if (record.localReference !== undefined) data.localReference = parseRequiredString(record.localReference, 'localReference');
  if (record.sourceConnector !== undefined) data.sourceConnector = parseRequiredString(record.sourceConnector, 'sourceConnector');
  if (record.sourceSupplier !== undefined) data.sourceSupplier = parseRequiredString(record.sourceSupplier, 'sourceSupplier');
  if (record.sourceOriginalUrl !== undefined) data.sourceOriginalUrl = parseRequiredString(record.sourceOriginalUrl, 'sourceOriginalUrl');
  if (record.sourceLicense !== undefined) data.sourceLicense = parseRequiredString(record.sourceLicense, 'sourceLicense');
  if (record.sourceAuthor !== undefined) data.sourceAuthor = parseRequiredString(record.sourceAuthor, 'sourceAuthor');
  if (record.sourceDedupeHash !== undefined) data.sourceDedupeHash = parseRequiredString(record.sourceDedupeHash, 'sourceDedupeHash');
  if (record.sourceUsageRestrictions !== undefined) data.sourceUsageRestrictions = parseRequiredString(record.sourceUsageRestrictions, 'sourceUsageRestrictions');
  if (record.sourceCaptureId !== undefined) data.sourceCaptureId = parseRequiredString(record.sourceCaptureId, 'sourceCaptureId');
  if (record.metaTags !== undefined) {
    if (!Array.isArray(record.metaTags)) throw new ValidationError('Field "metaTags" must be an array');
    data.metaTags = record.metaTags as string[];
  }
  return data;
}

function parseCreateCampaignInput(body: unknown): CreateCampaignInput {
  const record = parseObjectBody(body);
  const data: CreateCampaignInput = {
    name: parseRequiredString(record.name, 'name'),
  };
  if (record.description !== undefined) data.description = parseRequiredString(record.description, 'description');
  if (record.startsAt !== undefined) data.startsAt = parseRequiredDate(record.startsAt, 'startsAt');
  if (record.endsAt !== undefined) data.endsAt = parseRequiredDate(record.endsAt, 'endsAt');
  if (record.publicationStartsAt !== undefined) data.publicationStartsAt = parseRequiredDate(record.publicationStartsAt, 'publicationStartsAt');
  if (record.publicationEndsAt !== undefined) data.publicationEndsAt = parseRequiredDate(record.publicationEndsAt, 'publicationEndsAt');
  if (record.timezone !== undefined) data.timezone = parseRequiredString(record.timezone, 'timezone');
  if (record.offerIds !== undefined) {
    if (!Array.isArray(record.offerIds)) throw new ValidationError('Field "offerIds" must be an array');
    data.offerIds = record.offerIds as string[];
  }
  return data;
}

function parseCampaignStatus(value: unknown): CampaignStatus {
  if (typeof value !== 'string' || !Object.values(CampaignStatus).includes(value as CampaignStatus)) {
    throw new ValidationError('Field "status" must be a valid CampaignStatus');
  }
  return value as CampaignStatus;
}

function parsePublicationStatus(value: unknown): PublicationStatus {
  if (typeof value !== 'string' || !Object.values(PublicationStatus).includes(value as PublicationStatus)) {
    throw new ValidationError('Field "status" must be a valid PublicationStatus');
  }
  return value as PublicationStatus;
}

function parseCreatePublicationInput(body: unknown): CreatePublicationInput {
  const record = parseObjectBody(body);
  const data: CreatePublicationInput = {
    campaignId: parseRequiredString(record.campaignId, 'campaignId'),
    offerId: parseRequiredString(record.offerId, 'offerId'),
    channel: parseRequiredString(record.channel, 'channel'),
  };
  if (record.creativeTemplateId !== undefined) data.creativeTemplateId = parseRequiredString(record.creativeTemplateId, 'creativeTemplateId');
  if (record.scheduledAt !== undefined) data.scheduledAt = parseRequiredDate(record.scheduledAt, 'scheduledAt');
  return data;
}

function parseCreateAutomationInput(body: unknown): CreateAutomationInput {
  const record = parseObjectBody(body);
  if (!Array.isArray(record.actions)) {
    throw new ValidationError('Field "actions" must be an array');
  }
  const data: CreateAutomationInput = {
    name: parseRequiredString(record.name, 'name'),
    trigger: parseRequiredString(record.trigger, 'trigger') as CreateAutomationInput['trigger'],
    actions: record.actions as CreateAutomationInput['actions'],
  };
  if (record.channel !== undefined) data.channel = parseRequiredString(record.channel, 'channel');
  if (record.campaignId !== undefined) data.campaignId = parseRequiredString(record.campaignId, 'campaignId');
  if (record.publicationId !== undefined) data.publicationId = parseRequiredString(record.publicationId, 'publicationId');
  if (record.keyword !== undefined) data.keyword = parseRequiredString(record.keyword, 'keyword');
  if (record.caseSensitive !== undefined) {
    if (typeof record.caseSensitive !== 'boolean') throw new ValidationError('Field "caseSensitive" must be a boolean');
    data.caseSensitive = record.caseSensitive;
  }
  if (record.validFrom !== undefined) data.validFrom = parseRequiredDate(record.validFrom, 'validFrom');
  if (record.validUntil !== undefined) data.validUntil = parseRequiredDate(record.validUntil, 'validUntil');
  if (record.cooldownSeconds !== undefined) data.cooldownSeconds = parseNonNegativeNumber(record.cooldownSeconds, 'cooldownSeconds');
  if (record.maxExecutions !== undefined) data.maxExecutions = parsePositiveNumber(record.maxExecutions, 'maxExecutions');
  if (record.maxExecutionsPerExternalUser !== undefined) data.maxExecutionsPerExternalUser = parsePositiveNumber(record.maxExecutionsPerExternalUser, 'maxExecutionsPerExternalUser');
  return data;
}

function parseCreateCouponInput(body: unknown): CreateCouponInput {
  const record = parseObjectBody(body);
  const data: CreateCouponInput = {
    code: parseRequiredString(record.code, 'code'),
    name: parseRequiredString(record.name, 'name'),
    type: parseRequiredString(record.type, 'type') as CreateCouponInput['type'],
  };
  if (record.value !== undefined) data.value = parseNonNegativeNumber(record.value, 'value');
  if (record.benefitDescription !== undefined) data.benefitDescription = parseRequiredString(record.benefitDescription, 'benefitDescription');
  if (record.startsAt !== undefined) data.startsAt = parseRequiredDate(record.startsAt, 'startsAt');
  if (record.expiresAt !== undefined) data.expiresAt = parseRequiredDate(record.expiresAt, 'expiresAt');
  if (record.maxUses !== undefined) data.maxUses = parsePositiveNumber(record.maxUses, 'maxUses');
  if (record.maxUsesPerCustomer !== undefined) data.maxUsesPerCustomer = parsePositiveNumber(record.maxUsesPerCustomer, 'maxUsesPerCustomer');
  if (record.campaignId !== undefined) data.campaignId = parseRequiredString(record.campaignId, 'campaignId');
  if (record.offerId !== undefined) data.offerId = parseRequiredString(record.offerId, 'offerId');
  return data;
}

function parseGrantCouponInput(body: unknown): GrantCouponInput {
  const record = parseObjectBody(body);
  const data: GrantCouponInput = {
    couponId: parseRequiredString(record.couponId, 'couponId'),
  };
  if (record.campaignId !== undefined) data.campaignId = parseRequiredString(record.campaignId, 'campaignId');
  if (record.publicationId !== undefined) data.publicationId = parseRequiredString(record.publicationId, 'publicationId');
  if (record.automationId !== undefined) data.automationId = parseRequiredString(record.automationId, 'automationId');
  if (record.customerId !== undefined) data.customerId = parseRequiredString(record.customerId, 'customerId');
  if (record.externalUserId !== undefined) data.externalUserId = parseRequiredString(record.externalUserId, 'externalUserId');
  if (record.deliveryChannel !== undefined) data.deliveryChannel = parseRequiredString(record.deliveryChannel, 'deliveryChannel');
  return data;
}

function parseRecordRedemptionInput(body: unknown): RecordRedemptionInput {
  const record = parseObjectBody(body);
  const data: RecordRedemptionInput = {
    couponId: parseRequiredString(record.couponId, 'couponId'),
    customerId: parseRequiredString(record.customerId, 'customerId'),
  };
  if (record.grantId !== undefined) data.grantId = parseRequiredString(record.grantId, 'grantId');
  if (record.proposalId !== undefined) data.proposalId = parseRequiredString(record.proposalId, 'proposalId');
  if (record.saleId !== undefined) data.saleId = parseRequiredString(record.saleId, 'saleId');
  if (record.amountApplied !== undefined) data.amountApplied = parseNonNegativeNumber(record.amountApplied, 'amountApplied');
  return data;
}

function parseObjectBody(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('Request body must be an object');
  }
  return value as Record<string, unknown>;
}

function assertAllowedFields(
  record: Record<string, unknown>,
  forbidden: readonly string[],
  allowed: readonly string[],
): void {
  for (const field of forbidden) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }
}

function parseRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Field "${field}" is required and must be a non-empty string`);
  }
  return value;
}

function parsePositiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`Field "${field}" must be a positive number`);
  }
  return value;
}

function parseNonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ValidationError(`Field "${field}" must be a non-negative number`);
  }
  return value;
}

function parseRequiredDate(value: unknown, field: string): Date {
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a date string`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Field "${field}" must be a valid date`);
  }
  return date;
}

// ============================================================
// TRANSPORTATION: Route
// ============================================================

const FORBIDDEN_ROUTE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
] as const;

const ALLOWED_ROUTE_CREATE_FIELDS = [
  'origin',
  'destination',
  'estimatedDuration',
  'distance',
  'notes',
  'active',
] as const;

const ALLOWED_ROUTE_UPDATE_FIELDS = [
  'origin',
  'destination',
  'estimatedDuration',
  'distance',
  'notes',
  'active',
] as const;

const FORBIDDEN_ROUTE_POINT_FIELDS = [
  'agencyId',
  'tenantId',
  'routeId',
  'id',
  'sequence',
  'createdAt',
  'updatedAt',
] as const;

const ALLOWED_ROUTE_POINT_CREATE_FIELDS = [
  'sequence',
  'name',
  'checkpointRequired',
  'checkpointType',
  'plannedOffsetMinutes',
  'notes',
] as const;

const ALLOWED_ROUTE_POINT_UPDATE_FIELDS = [
  'name',
  'checkpointRequired',
  'checkpointType',
  'plannedOffsetMinutes',
  'notes',
] as const;

const CHECKPOINT_TYPE_VALUES: readonly string[] = Object.values(CheckpointType);

function parseCreateRoutePointInput(body: unknown): CreateRoutePointInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const field of ['agencyId', 'tenantId', 'id', 'createdAt', 'updatedAt'] as const) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(ALLOWED_ROUTE_POINT_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.sequence !== 'number' || !Number.isInteger(record.sequence)) {
    throw new ValidationError('Field "sequence" is required and must be an integer');
  }
  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    throw new ValidationError('Field "name" is required and must be a non-empty string');
  }

  const data: CreateRoutePointInput = { sequence: record.sequence, name: record.name };

  if (record.checkpointRequired !== undefined) {
    if (typeof record.checkpointRequired !== 'boolean') {
      throw new ValidationError('Field "checkpointRequired" must be a boolean');
    }
    data.checkpointRequired = record.checkpointRequired;
  }
  if (record.checkpointType !== undefined) {
    if (
      typeof record.checkpointType !== 'string' ||
      !CHECKPOINT_TYPE_VALUES.includes(record.checkpointType)
    ) {
      throw new ValidationError('Field "checkpointType" must be one of ARRIVAL, DEPARTURE, BOTH');
    }
    data.checkpointType = record.checkpointType as CheckpointType;
  }
  if (record.plannedOffsetMinutes !== undefined) {
    if (typeof record.plannedOffsetMinutes !== 'number') {
      throw new ValidationError('Field "plannedOffsetMinutes" must be a number');
    }
    data.plannedOffsetMinutes = record.plannedOffsetMinutes;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  return data;
}

function parseUpdateRoutePointInput(body: unknown): UpdateRoutePointInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_ROUTE_POINT_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(ALLOWED_ROUTE_POINT_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  const data: UpdateRoutePointInput = {};

  if (record.name !== undefined) {
    if (typeof record.name !== 'string' || record.name.trim().length === 0) {
      throw new ValidationError('Field "name" must be a non-empty string');
    }
    data.name = record.name;
  }
  if (record.checkpointRequired !== undefined) {
    if (typeof record.checkpointRequired !== 'boolean') {
      throw new ValidationError('Field "checkpointRequired" must be a boolean');
    }
    data.checkpointRequired = record.checkpointRequired;
  }
  if (record.checkpointType !== undefined) {
    if (
      record.checkpointType !== null &&
      (typeof record.checkpointType !== 'string' ||
        !CHECKPOINT_TYPE_VALUES.includes(record.checkpointType))
    ) {
      throw new ValidationError(
        'Field "checkpointType" must be one of ARRIVAL, DEPARTURE, BOTH, or null',
      );
    }
    data.checkpointType = record.checkpointType as CheckpointType | null;
  }
  if (record.plannedOffsetMinutes !== undefined) {
    if (record.plannedOffsetMinutes !== null && typeof record.plannedOffsetMinutes !== 'number') {
      throw new ValidationError('Field "plannedOffsetMinutes" must be a number or null');
    }
    data.plannedOffsetMinutes = record.plannedOffsetMinutes;
  }
  if (record.notes !== undefined) {
    if (record.notes !== null && typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string or null');
    }
    data.notes = record.notes;
  }

  return data;
}

function parseReorderRoutePointsInput(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;
  const ids = record.orderedPointIds;

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
    throw new ValidationError(
      'Field "orderedPointIds" is required and must be a non-empty array of strings',
    );
  }

  return ids;
}

function parseCreateRouteInput(body: unknown): CreateRouteInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_ROUTE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(ALLOWED_ROUTE_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.origin !== 'string' || record.origin.trim().length === 0) {
    throw new ValidationError('Field "origin" is required and must be a non-empty string');
  }
  if (typeof record.destination !== 'string' || record.destination.trim().length === 0) {
    throw new ValidationError('Field "destination" is required and must be a non-empty string');
  }

  const data: CreateRouteInput = { origin: record.origin, destination: record.destination };

  if (record.estimatedDuration !== undefined) {
    if (typeof record.estimatedDuration !== 'number') {
      throw new ValidationError('Field "estimatedDuration" must be a number');
    }
    data.estimatedDuration = record.estimatedDuration;
  }
  if (record.distance !== undefined) {
    if (typeof record.distance !== 'number') {
      throw new ValidationError('Field "distance" must be a number');
    }
    data.distance = record.distance;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }
  if (record.active !== undefined) {
    if (typeof record.active !== 'boolean') {
      throw new ValidationError('Field "active" must be a boolean');
    }
    data.active = record.active;
  }

  return data;
}

function parseUpdateRouteInput(body: unknown): UpdateRouteInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_ROUTE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(ALLOWED_ROUTE_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  const data: UpdateRouteInput = {};

  if (record.origin !== undefined) {
    if (typeof record.origin !== 'string' || record.origin.trim().length === 0) {
      throw new ValidationError('Field "origin" must be a non-empty string');
    }
    data.origin = record.origin;
  }
  if (record.destination !== undefined) {
    if (typeof record.destination !== 'string' || record.destination.trim().length === 0) {
      throw new ValidationError('Field "destination" must be a non-empty string');
    }
    data.destination = record.destination;
  }
  if (record.estimatedDuration !== undefined) {
    if (typeof record.estimatedDuration !== 'number') {
      throw new ValidationError('Field "estimatedDuration" must be a number');
    }
    data.estimatedDuration = record.estimatedDuration;
  }
  if (record.distance !== undefined) {
    if (typeof record.distance !== 'number') {
      throw new ValidationError('Field "distance" must be a number');
    }
    data.distance = record.distance;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }
  if (record.active !== undefined) {
    if (typeof record.active !== 'boolean') {
      throw new ValidationError('Field "active" must be a boolean');
    }
    data.active = record.active;
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}

// ============================================================
// TRANSPORTATION: Supplier
// ============================================================

const ALLOWED_SUPPLIER_CREATE_FIELDS = ['name', 'document', 'contact', 'active'] as const;
const ALLOWED_SUPPLIER_UPDATE_FIELDS = ['name', 'document', 'contact', 'active'] as const;

function parseCreateSupplierInput(body: unknown): CreateSupplierInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_ROUTE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(ALLOWED_SUPPLIER_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    throw new ValidationError('Field "name" is required and must be a non-empty string');
  }

  const data: CreateSupplierInput = { name: record.name };

  if (record.document !== undefined) {
    if (typeof record.document !== 'string') {
      throw new ValidationError('Field "document" must be a string');
    }
    data.document = record.document;
  }
  if (record.contact !== undefined) {
    if (typeof record.contact !== 'string') {
      throw new ValidationError('Field "contact" must be a string');
    }
    data.contact = record.contact;
  }
  if (record.active !== undefined) {
    if (typeof record.active !== 'boolean') {
      throw new ValidationError('Field "active" must be a boolean');
    }
    data.active = record.active;
  }

  return data;
}

function parseUpdateSupplierInput(body: unknown): UpdateSupplierInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_ROUTE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(ALLOWED_SUPPLIER_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  const data: UpdateSupplierInput = {};

  if (record.name !== undefined) {
    if (typeof record.name !== 'string' || record.name.trim().length === 0) {
      throw new ValidationError('Field "name" must be a non-empty string');
    }
    data.name = record.name;
  }
  if (record.document !== undefined) {
    if (typeof record.document !== 'string') {
      throw new ValidationError('Field "document" must be a string');
    }
    data.document = record.document;
  }
  if (record.contact !== undefined) {
    if (typeof record.contact !== 'string') {
      throw new ValidationError('Field "contact" must be a string');
    }
    data.contact = record.contact;
  }
  if (record.active !== undefined) {
    if (typeof record.active !== 'boolean') {
      throw new ValidationError('Field "active" must be a boolean');
    }
    data.active = record.active;
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}

// ============================================================
// TRANSPORTATION: TransportProduct
// ============================================================

const FORBIDDEN_PRODUCT_CREATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
] as const;

const ALLOWED_PRODUCT_CREATE_FIELDS = [
  'name',
  'tripType',
  'outboundRouteId',
  'returnRouteId',
  'price',
  'active',
  'publiclyBookable',
  'notes',
] as const;

const FORBIDDEN_PRODUCT_UPDATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'tripType',
  'outboundRouteId',
  'returnRouteId',
] as const;

const ALLOWED_PRODUCT_UPDATE_FIELDS = [
  'name',
  'price',
  'active',
  'publiclyBookable',
  'notes',
] as const;

function parseCreateTransportProductInput(body: unknown): CreateTransportProductInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_PRODUCT_CREATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(ALLOWED_PRODUCT_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    throw new ValidationError('Field "name" is required and must be a non-empty string');
  }
  if (
    typeof record.tripType !== 'string' ||
    !(Object.values(TripType) as string[]).includes(record.tripType)
  ) {
    throw new ValidationError('Field "tripType" must be one of ONE_WAY, ROUND_TRIP');
  }
  if (typeof record.outboundRouteId !== 'string' || record.outboundRouteId.trim().length === 0) {
    throw new ValidationError('Field "outboundRouteId" is required and must be a non-empty string');
  }
  if (typeof record.price !== 'number' || record.price < 0) {
    throw new ValidationError('Field "price" is required and must be a non-negative number');
  }

  const data: CreateTransportProductInput = {
    name: record.name,
    tripType: record.tripType as TripType,
    outboundRouteId: record.outboundRouteId,
    price: record.price,
  };

  if (record.returnRouteId !== undefined) {
    if (typeof record.returnRouteId !== 'string' || record.returnRouteId.trim().length === 0) {
      throw new ValidationError('Field "returnRouteId" must be a non-empty string');
    }
    data.returnRouteId = record.returnRouteId;
  }
  if (record.active !== undefined) {
    if (typeof record.active !== 'boolean') {
      throw new ValidationError('Field "active" must be a boolean');
    }
    data.active = record.active;
  }
  if (record.publiclyBookable !== undefined) {
    if (typeof record.publiclyBookable !== 'boolean') {
      throw new ValidationError('Field "publiclyBookable" must be a boolean');
    }
    data.publiclyBookable = record.publiclyBookable;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  return data;
}

function parseUpdateTransportProductInput(body: unknown): UpdateTransportProductInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_PRODUCT_UPDATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(ALLOWED_PRODUCT_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  const data: UpdateTransportProductInput = {};

  if (record.name !== undefined) {
    if (typeof record.name !== 'string' || record.name.trim().length === 0) {
      throw new ValidationError('Field "name" must be a non-empty string');
    }
    data.name = record.name;
  }
  if (record.price !== undefined) {
    if (typeof record.price !== 'number' || record.price < 0) {
      throw new ValidationError('Field "price" must be a non-negative number');
    }
    data.price = record.price;
  }
  if (record.active !== undefined) {
    if (typeof record.active !== 'boolean') {
      throw new ValidationError('Field "active" must be a boolean');
    }
    data.active = record.active;
  }
  if (record.publiclyBookable !== undefined) {
    if (typeof record.publiclyBookable !== 'boolean') {
      throw new ValidationError('Field "publiclyBookable" must be a boolean');
    }
    data.publiclyBookable = record.publiclyBookable;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}

// ============================================================
// TRANSPORTATION: ScheduledDeparture
// ============================================================

const FORBIDDEN_DEPARTURE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
] as const;

const ALLOWED_DEPARTURE_CREATE_FIELDS = [
  'productId',
  'departureAt',
  'arrivalExpectedAt',
  'capacity',
  'supplierId',
  'serviceType',
  'notes',
] as const;

const ALLOWED_DEPARTURE_UPDATE_FIELDS = [
  'departureAt',
  'arrivalExpectedAt',
  'capacity',
  'supplierId',
  'serviceType',
  'cancelled',
  'notes',
] as const;

function parseDepartureDate(value: unknown, field: string): Date {
  if (typeof value !== 'string') {
    throw new ValidationError(`Field "${field}" must be a string`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Field "${field}" must be a valid date`);
  }
  return date;
}

function parseCreateScheduledDepartureInput(body: unknown): CreateScheduledDepartureInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_DEPARTURE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(ALLOWED_DEPARTURE_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.productId !== 'string' || record.productId.trim().length === 0) {
    throw new ValidationError('Field "productId" is required and must be a non-empty string');
  }
  const departureAt = parseDepartureDate(record.departureAt, 'departureAt');
  if (typeof record.capacity !== 'number' || !Number.isInteger(record.capacity) || record.capacity < 0) {
    throw new ValidationError('Field "capacity" is required and must be a non-negative integer');
  }
  if (
    typeof record.serviceType !== 'string' ||
    !(Object.values(DepartureServiceType) as string[]).includes(record.serviceType)
  ) {
    throw new ValidationError(
      'Field "serviceType" must be one of OWN, SUBCONTRACTED, RESELL',
    );
  }

  const data: CreateScheduledDepartureInput = {
    productId: record.productId,
    departureAt,
    capacity: record.capacity,
    serviceType: record.serviceType as DepartureServiceType,
  };

  if (record.arrivalExpectedAt !== undefined) {
    data.arrivalExpectedAt = parseDepartureDate(record.arrivalExpectedAt, 'arrivalExpectedAt');
  }
  if (record.supplierId !== undefined) {
    if (typeof record.supplierId !== 'string' || record.supplierId.trim().length === 0) {
      throw new ValidationError('Field "supplierId" must be a non-empty string');
    }
    data.supplierId = record.supplierId;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  return data;
}

function parseCreateOperationInput(body: unknown): CreateOperationInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const field of ['agencyId', 'tenantId', 'id', 'createdAt', 'updatedAt'] as const) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (key !== 'departureId') {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.departureId !== 'string' || record.departureId.trim().length === 0) {
    throw new ValidationError('Field "departureId" is required and must be a non-empty string');
  }

  return { departureId: record.departureId };
}

function parseCreateOperationalStaffInput(body: unknown): CreateOperationalStaffInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;
  const allowed = ['userId', 'name', 'phone', 'email', 'capabilities'] as const;

  for (const field of ['agencyId', 'tenantId', 'id', 'active', 'createdAt', 'updatedAt'] as const) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(allowed as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }
  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    throw new ValidationError('Field "name" is required and must be a non-empty string');
  }
  if (!Array.isArray(record.capabilities) || record.capabilities.length === 0) {
    throw new ValidationError('Field "capabilities" is required and must be a non-empty array');
  }

  const capabilities = record.capabilities.map((capability) => {
    if (
      typeof capability !== 'string' ||
      !(Object.values(OperationalStaffCapability) as string[]).includes(capability)
    ) {
      throw new ValidationError('Field "capabilities" must contain only DRIVER or GUIDE');
    }
    return capability as OperationalStaffCapability;
  });

  const data: CreateOperationalStaffInput = {
    name: record.name,
    capabilities,
  };

  if (record.userId !== undefined) {
    if (typeof record.userId !== 'string' || record.userId.trim().length === 0) {
      throw new ValidationError('Field "userId" must be a non-empty string');
    }
    data.userId = record.userId;
  }
  if (record.phone !== undefined) {
    if (typeof record.phone !== 'string') {
      throw new ValidationError('Field "phone" must be a string');
    }
    data.phone = record.phone;
  }
  if (record.email !== undefined) {
    if (typeof record.email !== 'string') {
      throw new ValidationError('Field "email" must be a string');
    }
    data.email = record.email;
  }

  return data;
}

function parseCreateOperationAssignmentInput(
  operationId: string,
  body: unknown,
): Omit<CreateOperationAssignmentInput, 'createdByUserId'> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;
  const allowed = ['operationalStaffId', 'role'] as const;

  for (const field of ['agencyId', 'tenantId', 'id', 'operationId', 'createdByUserId', 'createdAt'] as const) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(allowed as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }
  if (typeof record.operationalStaffId !== 'string' || record.operationalStaffId.trim().length === 0) {
    throw new ValidationError('Field "operationalStaffId" is required and must be a non-empty string');
  }
  if (
    typeof record.role !== 'string' ||
    !(Object.values(OperationAssignmentRole) as string[]).includes(record.role)
  ) {
    throw new ValidationError('Field "role" must be one of DRIVER, GUIDE');
  }

  return {
    operationId,
    operationalStaffId: record.operationalStaffId,
    role: record.role as OperationAssignmentRole,
  };
}

function parseUpdateScheduledDepartureInput(body: unknown): UpdateScheduledDepartureInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_DEPARTURE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(ALLOWED_DEPARTURE_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  const data: UpdateScheduledDepartureInput = {};

  if (record.departureAt !== undefined) {
    data.departureAt = parseDepartureDate(record.departureAt, 'departureAt');
  }
  if (record.arrivalExpectedAt !== undefined) {
    data.arrivalExpectedAt = parseDepartureDate(record.arrivalExpectedAt, 'arrivalExpectedAt');
  }
  if (record.capacity !== undefined) {
    if (
      typeof record.capacity !== 'number' ||
      !Number.isInteger(record.capacity) ||
      record.capacity < 0
    ) {
      throw new ValidationError('Field "capacity" must be a non-negative integer');
    }
    data.capacity = record.capacity;
  }
  if (record.supplierId !== undefined) {
    if (typeof record.supplierId !== 'string' || record.supplierId.trim().length === 0) {
      throw new ValidationError('Field "supplierId" must be a non-empty string');
    }
    data.supplierId = record.supplierId;
  }
  if (record.serviceType !== undefined) {
    if (
      typeof record.serviceType !== 'string' ||
      !(Object.values(DepartureServiceType) as string[]).includes(record.serviceType)
    ) {
      throw new ValidationError(
        'Field "serviceType" must be one of OWN, SUBCONTRACTED, RESELL',
      );
    }
    data.serviceType = record.serviceType as DepartureServiceType;
  }
  if (record.cancelled !== undefined) {
    if (typeof record.cancelled !== 'boolean') {
      throw new ValidationError('Field "cancelled" must be a boolean');
    }
    data.cancelled = record.cancelled;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}

// ============================================================
// BOOKING
// ============================================================

const FORBIDDEN_BOOKING_CREATE_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'createdAt',
  'updatedAt',
  'cancelled',
] as const;

const ALLOWED_BOOKING_CREATE_FIELDS = [
  'bookerCustomerId',
  'tripType',
  'outboundDepartureId',
  'returnDepartureId',
  'notes',
  'passengers',
] as const;

const FORBIDDEN_BOOKING_CANCEL_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'bookingId',
  'userId',
  'cancelledAt',
  'cancelledByUserId',
  'createdAt',
  'updatedAt',
] as const;

const ALLOWED_BOOKING_CANCEL_FIELDS = ['reason'] as const;

const FORBIDDEN_PASSENGER_FIELDS = [
  'agencyId',
  'tenantId',
  'id',
  'bookingId',
  'createdAt',
  'updatedAt',
] as const;

const ALLOWED_PASSENGER_FIELDS = ['name', 'notes'] as const;

function parseCreateBookingPassengerInput(value: unknown): CreateBookingPassengerInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('Each passenger must be an object');
  }
  const record = value as Record<string, unknown>;

  for (const field of FORBIDDEN_PASSENGER_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed on a passenger`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(ALLOWED_PASSENGER_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" on a passenger`);
    }
  }

  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    throw new ValidationError('Each passenger must have a non-empty "name"');
  }

  const passenger: CreateBookingPassengerInput = { name: record.name };
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Passenger field "notes" must be a string');
    }
    passenger.notes = record.notes;
  }
  return passenger;
}

function parseCreateBookingInput(body: unknown): CreateBookingInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_BOOKING_CREATE_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(ALLOWED_BOOKING_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.bookerCustomerId !== 'string' || record.bookerCustomerId.trim().length === 0) {
    throw new ValidationError('Field "bookerCustomerId" is required and must be a non-empty string');
  }
  if (
    typeof record.tripType !== 'string' ||
    !(Object.values(TripType) as string[]).includes(record.tripType)
  ) {
    throw new ValidationError('Field "tripType" must be one of ONE_WAY, ROUND_TRIP');
  }
  if (typeof record.outboundDepartureId !== 'string' || record.outboundDepartureId.trim().length === 0) {
    throw new ValidationError('Field "outboundDepartureId" is required and must be a non-empty string');
  }
  if (!Array.isArray(record.passengers) || record.passengers.length === 0) {
    throw new ValidationError('Field "passengers" is required and must be a non-empty array');
  }

  const data: CreateBookingInput = {
    bookerCustomerId: record.bookerCustomerId,
    tripType: record.tripType as TripType,
    outboundDepartureId: record.outboundDepartureId,
    passengers: record.passengers.map(parseCreateBookingPassengerInput),
  };

  if (record.returnDepartureId !== undefined) {
    if (typeof record.returnDepartureId !== 'string' || record.returnDepartureId.trim().length === 0) {
      throw new ValidationError('Field "returnDepartureId" must be a non-empty string');
    }
    data.returnDepartureId = record.returnDepartureId;
  }
  if (record.notes !== undefined) {
    if (typeof record.notes !== 'string') {
      throw new ValidationError('Field "notes" must be a string');
    }
    data.notes = record.notes;
  }

  return data;
}

function parseCancelBookingInput(body: unknown): Omit<CancelBookingInput, 'userId'> {
  if (body === undefined || body === null) {
    return {};
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const record = body as Record<string, unknown>;

  for (const field of FORBIDDEN_BOOKING_CANCEL_FIELDS) {
    if (field in record) {
      throw new ValidationError(`Field "${field}" is not allowed in the request body`);
    }
  }
  for (const key of Object.keys(record)) {
    if (!(ALLOWED_BOOKING_CANCEL_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (record.reason === undefined || record.reason === null) {
    return {};
  }
  if (typeof record.reason !== 'string') {
    throw new ValidationError('Field "reason" must be a string');
  }
  const reason = record.reason.trim();
  return reason.length > 0 ? { reason } : {};
}
