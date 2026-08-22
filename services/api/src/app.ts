import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import {
  createTenantContextHook,
  getAgencyId,
  getTenantContext,
  requireRole,
  type ValidateUserAgencyAccess,
} from '../../../packages/domain/tenant-context';
import { UserRole } from '../../../packages/domain/types';
import { createAuthenticateHook, type AuthProvider } from './auth';
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

export interface BuildAppOptions {
  authProvider: AuthProvider;
  validateUserAgencyAccess: ValidateUserAgencyAccess;
  database: DatabaseRuntime;
  exposeTestRoutes?: boolean;
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
