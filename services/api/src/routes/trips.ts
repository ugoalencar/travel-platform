/**
 * Trips + Bookings + Air/Land Services -- HTTP surface for trip CRUD,
 * booking lifecycle, and air/land service management scoped by tripId.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { getTenantContext, getUserId, requireRole } from '../../../../packages/domain/tenant-context';
import { TripType, UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import {
  cancelBooking,
  listBookingsWithCustomer,
  getBookingWithCustomerById,
  createBooking,
  type CancelBookingInput,
  type CreateBookingInput,
  type CreateBookingPassengerInput,
} from '../bookings';
import {
  createTrip,
  getTripById,
  listTrips,
  updateTrip,
  type CreateTripInput,
  type UpdateTripInput,
} from '../trips';
import {
  createAirService,
  deleteAirService,
  getAirServiceById,
  listAirServices,
  updateAirService,
  type CreateAirServiceInput,
  type UpdateAirServiceInput,
} from '../air-services';
import {
  createLandService,
  deleteLandService,
  getLandServiceById,
  listLandServices,
  updateLandService,
  type CreateLandServiceInput,
  type UpdateLandServiceInput,
} from '../land-services';
import { assertNotRestricted } from '../permission-restrictions';
import { NotFoundError, ValidationError } from '../errors';

export interface TripsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerTripsRoutes(
  app: FastifyInstance,
  options: TripsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  // ============================================================
  // TRIPS
  // ============================================================

  app.get('/trips', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const trips = await listTrips(database);
    return { trips };
  });

  app.get<{ Params: { id: string } }>(
    '/trips/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const trip = await getTripById(database, request.params.id);

      if (!trip) {
        throw new NotFoundError('Trip not found');
      }

      return { trip };
    }
  );

  app.post('/trips', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const { customerId, data } = parseCreateTripInput(request.body);
    const trip = await createTrip(database, customerId, data);

    reply.code(201);
    return { trip };
  });

  app.patch<{ Params: { id: string } }>(
    '/trips/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const data = parseUpdateTripInput(request.body);
      const trip = await updateTrip(database, request.params.id, data);

      if (!trip) {
        throw new NotFoundError('Trip not found');
      }

      return { trip };
    }
  );

  // ============================================================
  // BOOKINGS
  // ============================================================

  app.get('/bookings', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const bookings = await listBookingsWithCustomer(database);
    return { bookings };
  });

  app.get<{ Params: { id: string } }>(
    '/bookings/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const result = await getBookingWithCustomerById(database, request.params.id);
      if (!result) {
        throw new NotFoundError('Booking not found');
      }
      return { booking: result.booking, passengers: result.passengers };
    }
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
    const result = await createBooking(database, data);
    reply.code(201);
    return { booking: result.booking, passengers: result.passengers };
  });

  app.post<{ Params: { id: string } }>(
    '/bookings/:id/cancel',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseCancelBookingInput(request.body);
      const booking = await cancelBooking(database, request.params.id, {
        ...data,
        userId: getUserId(),
      });
      return { booking };
    }
  );

  // ============================================================
  // AIR SERVICES (AirService)
  // ============================================================
  // RBAC floor: same precedent as Booking above -- AGENT for create/update
  // (day-to-day operational entry by front-line staff), VIEWER for reads.

  app.get<{ Querystring: { tripId?: string; customerId?: string } }>(
    '/air-services',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const { tripId, customerId } = request.query;
      const airServices = await listAirServices(database, { tripId, customerId });
      return { airServices };
    }
  );

  app.get<{ Params: { tripId: string } }>(
    '/trips/:tripId/air-services',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const airServices = await listAirServices(database, { tripId: request.params.tripId });
      return { airServices };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/air-services/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const airService = await getAirServiceById(database, request.params.id);
      if (!airService) {
        throw new NotFoundError('Air service not found');
      }
      return { airService };
    }
  );

  app.post('/air-services', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    // Demonstrable PermissionRestriction slice: a tenant OWNER/ADMIN can
    // additively restrict the AGENT role from creating air services
    // in THIS tenant only -- base RBAC (requireRole above) still applies
    // unchanged, and this check can never widen access.
    const restrictionContext = getTenantContext();
    await database.withTenantTransaction((client) =>
      assertNotRestricted(client, restrictionContext.userRole, 'air-services', 'create'),
    );
    const data = parseCreateAirServiceInput(request.body);
    const airService = await createAirService(database, data);
    reply.code(201);
    return { airService };
  });

  app.patch<{ Params: { id: string } }>(
    '/air-services/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const data = parseUpdateAirServiceInput(request.body);
      const airService = await updateAirService(database, request.params.id, data);
      if (!airService) {
        throw new NotFoundError('Air service not found');
      }
      return { airService };
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/air-services/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const deleted = await deleteAirService(database, request.params.id);
      if (!deleted) {
        throw new NotFoundError('Air service not found');
      }
      return { success: true };
    }
  );

  // ============================================================
  // LAND SERVICES (LandService)
  // ============================================================
  // RBAC floor: mirrors Air Operations above -- AGENT for create/update,
  // VIEWER for reads, MANAGER for delete.

  app.get<{ Querystring: { tripId?: string; customerId?: string } }>(
    '/land-services',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const { tripId, customerId } = request.query;
      const landServices = await listLandServices(database, { tripId, customerId });
      return { landServices };
    }
  );

  app.get<{ Params: { tripId: string } }>(
    '/trips/:tripId/land-services',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const landServices = await listLandServices(database, { tripId: request.params.tripId });
      return { landServices };
    }
  );

  app.get<{ Params: { id: string } }>(
    '/land-services/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const landService = await getLandServiceById(database, request.params.id);
      if (!landService) {
        throw new NotFoundError('Land service not found');
      }
      return { landService };
    }
  );

  app.post('/land-services', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.AGENT);
    const data = parseCreateLandServiceInput(request.body);
    const landService = await createLandService(database, data);
    reply.code(201);
    return { landService };
  });

  app.patch<{ Params: { id: string } }>(
    '/land-services/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.AGENT);
      const data = parseUpdateLandServiceInput(request.body);
      const landService = await updateLandService(database, request.params.id, data);
      if (!landService) {
        throw new NotFoundError('Land service not found');
      }
      return { landService };
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/land-services/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const deleted = await deleteLandService(database, request.params.id);
      if (!deleted) {
        throw new NotFoundError('Land service not found');
      }
      return { success: true };
    }
  );
}

// ============================================================
// INPUT PARSERS
// ============================================================

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

// ============================================================
// BOOKING INPUT PARSERS
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
    throw new ValidationError(
      'Field "bookerCustomerId" is required and must be a non-empty string'
    );
  }
  if (
    typeof record.tripType !== 'string' ||
    !(Object.values(TripType) as string[]).includes(record.tripType)
  ) {
    throw new ValidationError('Field "tripType" must be one of ONE_WAY, ROUND_TRIP');
  }
  if (
    typeof record.outboundDepartureId !== 'string' ||
    record.outboundDepartureId.trim().length === 0
  ) {
    throw new ValidationError(
      'Field "outboundDepartureId" is required and must be a non-empty string'
    );
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
    if (
      typeof record.returnDepartureId !== 'string' ||
      record.returnDepartureId.trim().length === 0
    ) {
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

// ============================================================
// AIR SERVICE INPUT PARSERS
// ============================================================

const FORBIDDEN_ROUTE_FIELDS = ['agencyId', 'tenantId', 'id', 'createdAt', 'updatedAt'] as const;

const AIR_SERVICE_STRING_FIELDS = [
  'bookingId',
  'supplierId',
  'dependentId',
  'airline',
  'consolidator',
  'origin',
  'destination',
  'departureDate',
  'departureTime',
  'arrivalDate',
  'arrivalTime',
  'flightNumber',
  'bookingLocator',
  'ticketNumber',
  'baggage',
  'seat',
  'currency',
  'supplierDueDate',
  'notes',
] as const;

const AIR_SERVICE_NUMBER_FIELDS = [
  'fare',
  'taxes',
  'fees',
  'commission',
  'cost',
  'saleValue',
] as const;

const AIR_CABIN_CLASS_VALUES = ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'] as const;
const AIR_SEGMENT_DIRECTION_VALUES = ['OUTBOUND', 'RETURN', 'INTERNAL'] as const;
const AIR_SERVICE_STATUS_VALUES = ['PENDING', 'CONFIRMED', 'CANCELLED'] as const;
const AIR_SUPPLIER_PAYMENT_STATUS_VALUES = [
  'OPEN',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
] as const;

const ALLOWED_AIR_SERVICE_CREATE_FIELDS = [
  'tripId',
  'customerId',
  'direction',
  'sequence',
  'cabinClass',
  'supplierPaymentStatus',
  'status',
  ...AIR_SERVICE_STRING_FIELDS,
  ...AIR_SERVICE_NUMBER_FIELDS,
] as const;
const ALLOWED_AIR_SERVICE_UPDATE_FIELDS = ALLOWED_AIR_SERVICE_CREATE_FIELDS;

function parseCreateAirServiceInput(body: unknown): CreateAirServiceInput {
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
    if (!(ALLOWED_AIR_SERVICE_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.tripId !== 'string' || record.tripId.trim().length === 0) {
    throw new ValidationError('Field "tripId" is required and must be a non-empty string');
  }
  if (typeof record.customerId !== 'string' || record.customerId.trim().length === 0) {
    throw new ValidationError('Field "customerId" is required and must be a non-empty string');
  }
  if (typeof record.airline !== 'string' || record.airline.trim().length === 0) {
    throw new ValidationError('Field "airline" is required and must be a non-empty string');
  }
  if (typeof record.origin !== 'string' || record.origin.trim().length === 0) {
    throw new ValidationError('Field "origin" is required and must be a non-empty string');
  }
  if (typeof record.destination !== 'string' || record.destination.trim().length === 0) {
    throw new ValidationError('Field "destination" is required and must be a non-empty string');
  }
  if (typeof record.departureDate !== 'string' || record.departureDate.trim().length === 0) {
    throw new ValidationError('Field "departureDate" is required and must be a date string');
  }
  if (typeof record.arrivalDate !== 'string' || record.arrivalDate.trim().length === 0) {
    throw new ValidationError('Field "arrivalDate" is required and must be a date string');
  }

  const data: CreateAirServiceInput = {
    tripId: record.tripId,
    customerId: record.customerId,
    airline: record.airline,
    origin: record.origin,
    destination: record.destination,
    departureDate: record.departureDate,
    arrivalDate: record.arrivalDate,
  };

  applyAirServiceOptionalFields(record, data);

  return data;
}

function parseUpdateAirServiceInput(body: unknown): UpdateAirServiceInput {
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
    if (!(ALLOWED_AIR_SERVICE_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  const data: UpdateAirServiceInput = {};

  if (record.tripId !== undefined) {
    if (typeof record.tripId !== 'string' || record.tripId.trim().length === 0) {
      throw new ValidationError('Field "tripId" must be a non-empty string');
    }
    data.tripId = record.tripId;
  }
  if (record.customerId !== undefined) {
    if (typeof record.customerId !== 'string' || record.customerId.trim().length === 0) {
      throw new ValidationError('Field "customerId" must be a non-empty string');
    }
    data.customerId = record.customerId;
  }
  if (record.airline !== undefined) {
    if (typeof record.airline !== 'string' || record.airline.trim().length === 0) {
      throw new ValidationError('Field "airline" must be a non-empty string');
    }
    data.airline = record.airline;
  }
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
  if (record.departureDate !== undefined) {
    if (typeof record.departureDate !== 'string' || record.departureDate.trim().length === 0) {
      throw new ValidationError('Field "departureDate" must be a date string');
    }
    data.departureDate = record.departureDate;
  }
  if (record.arrivalDate !== undefined) {
    if (typeof record.arrivalDate !== 'string' || record.arrivalDate.trim().length === 0) {
      throw new ValidationError('Field "arrivalDate" must be a date string');
    }
    data.arrivalDate = record.arrivalDate;
  }

  applyAirServiceOptionalFields(record, data);

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}

function applyAirServiceOptionalFields(
  record: Record<string, unknown>,
  data: CreateAirServiceInput | UpdateAirServiceInput,
): void {
  const target = data as unknown as Record<string, unknown>;

  for (const field of AIR_SERVICE_STRING_FIELDS) {
    if (record[field] !== undefined) {
      if (typeof record[field] !== 'string') {
        throw new ValidationError(`Field "${field}" must be a string`);
      }
      target[field] = record[field];
    }
  }
  for (const field of AIR_SERVICE_NUMBER_FIELDS) {
    const value = record[field];
    if (value !== undefined) {
      if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
        throw new ValidationError(`Field "${field}" must be a non-negative number`);
      }
      target[field] = value;
    }
  }
  if (record.sequence !== undefined) {
    if (typeof record.sequence !== 'number' || !Number.isInteger(record.sequence) || record.sequence < 1) {
      throw new ValidationError('Field "sequence" must be a positive integer');
    }
    target.sequence = record.sequence;
  }
  if (record.direction !== undefined) {
    if (
      typeof record.direction !== 'string' ||
      !(AIR_SEGMENT_DIRECTION_VALUES as readonly string[]).includes(record.direction)
    ) {
      throw new ValidationError('Field "direction" must be one of OUTBOUND, RETURN, INTERNAL');
    }
    target.direction = record.direction;
  }
  if (record.cabinClass !== undefined) {
    if (
      typeof record.cabinClass !== 'string' ||
      !(AIR_CABIN_CLASS_VALUES as readonly string[]).includes(record.cabinClass)
    ) {
      throw new ValidationError('Field "cabinClass" must be one of ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST');
    }
    target.cabinClass = record.cabinClass;
  }
  if (record.status !== undefined) {
    if (
      typeof record.status !== 'string' ||
      !(AIR_SERVICE_STATUS_VALUES as readonly string[]).includes(record.status)
    ) {
      throw new ValidationError('Field "status" must be one of PENDING, CONFIRMED, CANCELLED');
    }
    target.status = record.status;
  }
  if (record.supplierPaymentStatus !== undefined) {
    if (
      typeof record.supplierPaymentStatus !== 'string' ||
      !(AIR_SUPPLIER_PAYMENT_STATUS_VALUES as readonly string[]).includes(record.supplierPaymentStatus)
    ) {
      throw new ValidationError(
        'Field "supplierPaymentStatus" must be one of OPEN, PARTIALLY_PAID, PAID, CANCELLED',
      );
    }
    target.supplierPaymentStatus = record.supplierPaymentStatus;
  }
}

// ============================================================
// LAND SERVICE INPUT PARSERS
// ============================================================

const LAND_SERVICE_STRING_FIELDS = [
  'bookingId',
  'supplierId',
  'dependentId',
  'description',
  'startDate',
  'endDate',
  'currency',
  'supplierDueDate',
  'confirmationNumber',
  'notes',
] as const;

const LAND_SERVICE_NUMBER_FIELDS = [
  'quantity',
  'cost',
  'saleValue',
  'taxes',
  'fees',
  'commission',
] as const;

const LAND_SERVICE_TYPE_VALUES = [
  'ACCOMMODATION', 'TRANSFER', 'CAR_RENTAL', 'TOUR', 'TRAVEL_INSURANCE',
  'CRUISE', 'TRAIN', 'BUS', 'GUIDE', 'TICKET', 'RECEPTIVE', 'OTHER',
] as const;
const LAND_SERVICE_STATUS_VALUES = ['PENDING', 'CONFIRMED', 'CANCELLED'] as const;
const LAND_SUPPLIER_PAYMENT_STATUS_VALUES = [
  'OPEN',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
] as const;

const ALLOWED_LAND_SERVICE_CREATE_FIELDS = [
  'tripId',
  'customerId',
  'serviceType',
  'supplierPaymentStatus',
  'status',
  ...LAND_SERVICE_STRING_FIELDS,
  ...LAND_SERVICE_NUMBER_FIELDS,
] as const;
const ALLOWED_LAND_SERVICE_UPDATE_FIELDS = ALLOWED_LAND_SERVICE_CREATE_FIELDS;

function parseCreateLandServiceInput(body: unknown): CreateLandServiceInput {
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
    if (!(ALLOWED_LAND_SERVICE_CREATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  if (typeof record.tripId !== 'string' || record.tripId.trim().length === 0) {
    throw new ValidationError('Field "tripId" is required and must be a non-empty string');
  }
  if (typeof record.customerId !== 'string' || record.customerId.trim().length === 0) {
    throw new ValidationError('Field "customerId" is required and must be a non-empty string');
  }
  if (typeof record.description !== 'string' || record.description.trim().length === 0) {
    throw new ValidationError('Field "description" is required and must be a non-empty string');
  }
  if (typeof record.startDate !== 'string' || record.startDate.trim().length === 0) {
    throw new ValidationError('Field "startDate" is required and must be a date string');
  }
  if (typeof record.endDate !== 'string' || record.endDate.trim().length === 0) {
    throw new ValidationError('Field "endDate" is required and must be a date string');
  }

  const data: CreateLandServiceInput = {
    tripId: record.tripId,
    customerId: record.customerId,
    description: record.description,
    startDate: record.startDate,
    endDate: record.endDate,
  };

  applyLandServiceOptionalFields(record, data);

  return data;
}

function parseUpdateLandServiceInput(body: unknown): UpdateLandServiceInput {
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
    if (!(ALLOWED_LAND_SERVICE_UPDATE_FIELDS as readonly string[]).includes(key)) {
      throw new ValidationError(`Unknown field "${key}" in request body`);
    }
  }

  const data: UpdateLandServiceInput = {};

  if (record.tripId !== undefined) {
    if (typeof record.tripId !== 'string' || record.tripId.trim().length === 0) {
      throw new ValidationError('Field "tripId" must be a non-empty string');
    }
    data.tripId = record.tripId;
  }
  if (record.customerId !== undefined) {
    if (typeof record.customerId !== 'string' || record.customerId.trim().length === 0) {
      throw new ValidationError('Field "customerId" must be a non-empty string');
    }
    data.customerId = record.customerId;
  }
  if (record.description !== undefined) {
    if (typeof record.description !== 'string' || record.description.trim().length === 0) {
      throw new ValidationError('Field "description" must be a non-empty string');
    }
    data.description = record.description;
  }
  if (record.startDate !== undefined) {
    if (typeof record.startDate !== 'string' || record.startDate.trim().length === 0) {
      throw new ValidationError('Field "startDate" must be a date string');
    }
    data.startDate = record.startDate;
  }
  if (record.endDate !== undefined) {
    if (typeof record.endDate !== 'string' || record.endDate.trim().length === 0) {
      throw new ValidationError('Field "endDate" must be a date string');
    }
    data.endDate = record.endDate;
  }

  applyLandServiceOptionalFields(record, data);

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}

function applyLandServiceOptionalFields(
  record: Record<string, unknown>,
  data: CreateLandServiceInput | UpdateLandServiceInput,
): void {
  const target = data as unknown as Record<string, unknown>;

  for (const field of LAND_SERVICE_STRING_FIELDS) {
    if (record[field] !== undefined) {
      if (typeof record[field] !== 'string') {
        throw new ValidationError(`Field "${field}" must be a string`);
      }
      target[field] = record[field];
    }
  }
  for (const field of LAND_SERVICE_NUMBER_FIELDS) {
    const value = record[field];
    if (value !== undefined) {
      if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
        throw new ValidationError(`Field "${field}" must be a non-negative number`);
      }
      target[field] = value;
    }
  }
  if (record.serviceType !== undefined) {
    if (
      typeof record.serviceType !== 'string' ||
      !(LAND_SERVICE_TYPE_VALUES as readonly string[]).includes(record.serviceType)
    ) {
      throw new ValidationError(
        `Field "serviceType" must be one of: ${LAND_SERVICE_TYPE_VALUES.join(', ')}`,
      );
    }
    target.serviceType = record.serviceType;
  }
  if (record.status !== undefined) {
    if (
      typeof record.status !== 'string' ||
      !(LAND_SERVICE_STATUS_VALUES as readonly string[]).includes(record.status)
    ) {
      throw new ValidationError('Field "status" must be one of PENDING, CONFIRMED, CANCELLED');
    }
    target.status = record.status;
  }
  if (record.supplierPaymentStatus !== undefined) {
    if (
      typeof record.supplierPaymentStatus !== 'string' ||
      !(LAND_SUPPLIER_PAYMENT_STATUS_VALUES as readonly string[]).includes(record.supplierPaymentStatus)
    ) {
      throw new ValidationError(
        'Field "supplierPaymentStatus" must be one of OPEN, PARTIALLY_PAID, PAID, CANCELLED',
      );
    }
    target.supplierPaymentStatus = record.supplierPaymentStatus;
  }
}
