/**
 * Transport Suppliers -- CRUD for transport routes, route points, suppliers,
 * transport products, scheduled departures, and the departure agenda.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import {
  CheckpointType,
  DepartureServiceType,
  TripType,
  UserRole,
  type SupplierCategory,
  type SupplierType,
} from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { NotFoundError, ValidationError } from '../errors';
import {
  createRoute,
  getRouteById,
  listRoutes,
  updateRoute,
  type CreateRouteInput,
  type UpdateRouteInput,
} from '../transport-routes';
import {
  createRoutePoint,
  listRoutePoints,
  reorderRoutePoints,
  updateRoutePoint,
  type CreateRoutePointInput,
  type UpdateRoutePointInput,
} from '../route-points';
import {
  createSupplier,
  getSupplierById,
  listSuppliers,
  updateSupplier,
  type CreateSupplierInput,
  type UpdateSupplierInput,
} from '../suppliers';
import {
  createTransportProduct,
  getTransportProductById,
  listTransportProducts,
  updateTransportProduct,
  type CreateTransportProductInput,
  type UpdateTransportProductInput,
} from '../transport-products';
import {
  createScheduledDeparture,
  getAgenda,
  getScheduledDepartureById,
  listScheduledDepartures,
  updateScheduledDeparture,
  type CreateScheduledDepartureInput,
  type UpdateScheduledDepartureInput,
} from '../scheduled-departures';

export interface TransportSuppliersRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerTransportSuppliersRoutes(
  app: FastifyInstance,
  options: TransportSuppliersRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  // ============================================================
  // ROUTES
  // ============================================================
  app.get('/transport/routes', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const routes = await listRoutes(database);
    return { routes };
  });

  app.get<{ Params: { id: string } }>(
    '/transport/routes/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const route = await getRouteById(database, request.params.id);
      if (!route) {
        throw new NotFoundError('Route not found');
      }
      return { route };
    }
  );

  app.post('/transport/routes', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = parseCreateRouteInput(request.body);
    const route = await createRoute(database, data);
    reply.code(201);
    return { route };
  });

  app.patch<{ Params: { id: string } }>(
    '/transport/routes/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateRouteInput(request.body);
      const route = await updateRoute(database, request.params.id, data);
      if (!route) {
        throw new NotFoundError('Route not found');
      }
      return { route };
    }
  );

  // ============================================================
  // ROUTE POINTS
  // ============================================================
  app.get<{ Params: { routeId: string } }>(
    '/transport/routes/:routeId/points',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const points = await listRoutePoints(database, request.params.routeId);
      return { points };
    }
  );

  app.post<{ Params: { routeId: string } }>(
    '/transport/routes/:routeId/points',
    { preHandler: protectedHooks },
    async (request, reply) => {
      requireRole(UserRole.MANAGER);
      const data = parseCreateRoutePointInput(request.body);
      const point = await createRoutePoint(database, request.params.routeId, data);
      reply.code(201);
      return { point };
    }
  );

  app.patch<{ Params: { routeId: string; id: string } }>(
    '/transport/routes/:routeId/points/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateRoutePointInput(request.body);
      const point = await updateRoutePoint(
        database,
        request.params.routeId,
        request.params.id,
        data
      );
      if (!point) {
        throw new NotFoundError('Route point not found');
      }
      return { point };
    }
  );

  app.post<{ Params: { routeId: string } }>(
    '/transport/routes/:routeId/points/reorder',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const orderedPointIds = parseReorderRoutePointsInput(request.body);
      const points = await reorderRoutePoints(
        database,
        request.params.routeId,
        orderedPointIds
      );
      return { points };
    }
  );

  // ============================================================
  // TRANSPORT SUPPLIERS
  // ============================================================
  app.get('/transport/suppliers', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const suppliers = await listSuppliers(database);
    return { suppliers };
  });

  app.get<{ Params: { id: string } }>(
    '/transport/suppliers/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const supplier = await getSupplierById(database, request.params.id);
      if (!supplier) {
        throw new NotFoundError('Supplier not found');
      }
      return { supplier };
    }
  );

  app.post('/transport/suppliers', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = parseCreateSupplierInput(request.body);
    const supplier = await createSupplier(database, data);
    reply.code(201);
    return { supplier };
  });

  app.patch<{ Params: { id: string } }>(
    '/transport/suppliers/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateSupplierInput(request.body);
      const supplier = await updateSupplier(database, request.params.id, data);
      if (!supplier) {
        throw new NotFoundError('Supplier not found');
      }
      return { supplier };
    }
  );

  // ============================================================
  // GENERIC SUPPLIERS ALIAS
  // ============================================================
  app.get('/suppliers', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const suppliers = await listSuppliers(database);
    return { suppliers };
  });

  app.get<{ Params: { id: string } }>(
    '/suppliers/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const supplier = await getSupplierById(database, request.params.id);
      if (!supplier) {
        throw new NotFoundError('Supplier not found');
      }
      return { supplier };
    }
  );

  app.post('/suppliers', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = parseCreateSupplierInput(request.body);
    const supplier = await createSupplier(database, data);
    reply.code(201);
    return { supplier };
  });

  app.patch<{ Params: { id: string } }>(
    '/suppliers/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateSupplierInput(request.body);
      const supplier = await updateSupplier(database, request.params.id, data);
      if (!supplier) {
        throw new NotFoundError('Supplier not found');
      }
      return { supplier };
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/suppliers/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const supplier = await updateSupplier(database, request.params.id, { active: false });
      if (!supplier) {
        throw new NotFoundError('Supplier not found');
      }
      return { supplier };
    }
  );

  // ============================================================
  // TRANSPORT PRODUCTS
  // ============================================================
  app.get('/transport/products', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const products = await listTransportProducts(database);
    return { products };
  });

  app.get<{ Params: { id: string } }>(
    '/transport/products/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const product = await getTransportProductById(database, request.params.id);
      if (!product) {
        throw new NotFoundError('Transport product not found');
      }
      return { product };
    }
  );

  app.post('/transport/products', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = parseCreateTransportProductInput(request.body);
    const product = await createTransportProduct(database, data);
    reply.code(201);
    return { product };
  });

  app.patch<{ Params: { id: string } }>(
    '/transport/products/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateTransportProductInput(request.body);
      const product = await updateTransportProduct(database, request.params.id, data);
      if (!product) {
        throw new NotFoundError('Transport product not found');
      }
      return { product };
    }
  );

  // ============================================================
  // SCHEDULED DEPARTURES
  // ============================================================
  app.get('/transport/departures', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.VIEWER);
    const departures = await listScheduledDepartures(database);
    return { departures };
  });

  app.get<{ Params: { id: string } }>(
    '/transport/departures/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.VIEWER);
      const departure = await getScheduledDepartureById(database, request.params.id);
      if (!departure) {
        throw new NotFoundError('Scheduled departure not found');
      }
      return { departure };
    }
  );

  app.post('/transport/departures', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const data = parseCreateScheduledDepartureInput(request.body);
    const departure = await createScheduledDeparture(database, data);
    reply.code(201);
    return { departure };
  });

  app.patch<{ Params: { id: string } }>(
    '/transport/departures/:id',
    { preHandler: protectedHooks },
    async (request) => {
      requireRole(UserRole.MANAGER);
      const data = parseUpdateScheduledDepartureInput(request.body);
      const departure = await updateScheduledDeparture(database, request.params.id, data);
      if (!departure) {
        throw new NotFoundError('Scheduled departure not found');
      }
      return { departure };
    }
  );

  // ============================================================
  // AGENDA
  // ============================================================
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
      const agenda = await getAgenda(database, filters);
      return { agenda };
    }
  );
}

// ============================================================
// ROUTE PARSERS
// ============================================================

const FORBIDDEN_ROUTE_FIELDS = ['agencyId', 'tenantId', 'id', 'createdAt', 'updatedAt'] as const;

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
        'Field "checkpointType" must be one of ARRIVAL, DEPARTURE, BOTH, or null'
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
      'Field "orderedPointIds" is required and must be a non-empty array of strings'
    );
  }

  return ids;
}

// ============================================================
// SUPPLIER PARSERS
// ============================================================

const SUPPLIER_STRING_FIELDS = [
  'tradeName',
  'document',
  'contact',
  'email',
  'phone',
  'website',
  'addressLine',
  'addressCity',
  'addressState',
  'addressZip',
  'addressCountry',
  'bankName',
  'bankBranch',
  'bankAccount',
  'bankPix',
  'paymentTerms',
  'notes',
] as const;

const SUPPLIER_TYPE_VALUES = ['TRAVEL', 'OPERATIONAL', 'BOTH'] as const;

const SUPPLIER_CATEGORY_VALUES = [
  'AIRLINE', 'CONSOLIDATOR', 'HOTEL', 'RESORT', 'TOUR_OPERATOR', 'TRANSFER',
  'CAR_RENTAL', 'TRAVEL_INSURANCE', 'TOUR', 'GUIDE', 'CRUISE', 'TRAIN', 'BUS',
  'TICKET_PROVIDER', 'RECEPTIVE_OPERATOR',
  'RENT', 'ELECTRICITY', 'WATER', 'INTERNET', 'PHONE', 'SOFTWARE', 'ACCOUNTING',
  'LEGAL', 'MARKETING', 'OFFICE', 'CLEANING', 'MAINTENANCE', 'EQUIPMENT',
  'BANKING', 'INSURANCE', 'OTHER',
] as const;

const ALLOWED_SUPPLIER_CREATE_FIELDS = [
  'name',
  'supplierType',
  'active',
  'categories',
  ...SUPPLIER_STRING_FIELDS,
] as const;
const ALLOWED_SUPPLIER_UPDATE_FIELDS = ALLOWED_SUPPLIER_CREATE_FIELDS;

function parseSupplierCategories(value: unknown): SupplierCategory[] {
  if (!Array.isArray(value)) {
    throw new ValidationError('Field "categories" must be an array of strings');
  }
  return value.map((item) => {
    if (typeof item !== 'string' || !(SUPPLIER_CATEGORY_VALUES as readonly string[]).includes(item)) {
      throw new ValidationError(`Invalid supplier category "${String(item)}"`);
    }
    return item as SupplierCategory;
  });
}

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

  for (const field of SUPPLIER_STRING_FIELDS) {
    if (record[field] !== undefined) {
      if (typeof record[field] !== 'string') {
        throw new ValidationError(`Field "${field}" must be a string`);
      }
      (data as unknown as Record<string, unknown>)[field] = record[field];
    }
  }
  if (record.supplierType !== undefined) {
    if (
      typeof record.supplierType !== 'string' ||
      !(SUPPLIER_TYPE_VALUES as readonly string[]).includes(record.supplierType)
    ) {
      throw new ValidationError('Field "supplierType" must be one of TRAVEL, OPERATIONAL, BOTH');
    }
    data.supplierType = record.supplierType as SupplierType;
  }
  if (record.active !== undefined) {
    if (typeof record.active !== 'boolean') {
      throw new ValidationError('Field "active" must be a boolean');
    }
    data.active = record.active;
  }
  if (record.categories !== undefined) {
    data.categories = parseSupplierCategories(record.categories);
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
  for (const field of SUPPLIER_STRING_FIELDS) {
    if (record[field] !== undefined) {
      if (typeof record[field] !== 'string') {
        throw new ValidationError(`Field "${field}" must be a string`);
      }
      (data as unknown as Record<string, unknown>)[field] = record[field];
    }
  }
  if (record.supplierType !== undefined) {
    if (
      typeof record.supplierType !== 'string' ||
      !(SUPPLIER_TYPE_VALUES as readonly string[]).includes(record.supplierType)
    ) {
      throw new ValidationError('Field "supplierType" must be one of TRAVEL, OPERATIONAL, BOTH');
    }
    data.supplierType = record.supplierType as SupplierType;
  }
  if (record.active !== undefined) {
    if (typeof record.active !== 'boolean') {
      throw new ValidationError('Field "active" must be a boolean');
    }
    data.active = record.active;
  }
  if (record.categories !== undefined) {
    data.categories = parseSupplierCategories(record.categories);
  }

  if (Object.keys(data).length === 0) {
    throw new ValidationError('At least one field must be provided');
  }

  return data;
}

// ============================================================
// TRANSPORT PRODUCT PARSERS
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
// SCHEDULED DEPARTURE PARSERS
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
  if (
    typeof record.capacity !== 'number' ||
    !Number.isInteger(record.capacity) ||
    record.capacity < 0
  ) {
    throw new ValidationError('Field "capacity" is required and must be a non-negative integer');
  }
  if (
    typeof record.serviceType !== 'string' ||
    !(Object.values(DepartureServiceType) as string[]).includes(record.serviceType)
  ) {
    throw new ValidationError('Field "serviceType" must be one of OWN, SUBCONTRACTED, RESELL');
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
      throw new ValidationError('Field "serviceType" must be one of OWN, SUBCONTRACTED, RESELL');
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
