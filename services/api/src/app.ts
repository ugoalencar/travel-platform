import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
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
import { CheckpointType, UserRole } from '../../../packages/domain/types';
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
  createProposal,
  getProposalById,
  listProposals,
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
  listBookings,
  getBookingById,
  createBooking,
  type CreateBookingInput,
  type CreateBookingPassengerInput,
} from './bookings';
import {
  confirmArrival,
  confirmDeparture,
  createOperation,
  getOperationById,
  listOperations,
  type CreateOperationInput,
} from './transport-operations';
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
}

interface AgencyProofRow {
  id: string;
  name: string;
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
  // CONFIGURABLE MULTI-PIPELINE (migration 008_configurable_pipelines.sql)
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

  if (options.exposeTestRoutes === true) {
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
