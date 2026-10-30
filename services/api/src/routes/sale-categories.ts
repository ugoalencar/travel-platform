/**
 * Sale categories and their configurable form profile (ADR-008).
 * Reads need VIEWER (the sale form uses them); configuration needs ADMIN.
 */

import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import { assertAllowedFields, parseObjectBody, parseRequiredString } from '../request-parsing';
import {
  assertNonEmptyName,
  createSaleCategory,
  getSaleCategoryForm,
  listSaleCategories,
  listSaleFormRegistry,
  replaceSaleCategoryForm,
  updateSaleCategory,
  type SaleCategoryFormInput,
} from '../sale-categories';

export interface SaleCategoriesRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

const FORBIDDEN = ['agencyId', 'tenantId', 'id', 'formRevision', 'createdAt', 'updatedAt'] as const;

function parseSortOrder(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new ValidationError('Field "sortOrder" must be an integer between 0 and 10000');
  }
  return value;
}

function parseCreate(body: unknown): { name: string; sortOrder?: number } {
  const record = parseObjectBody(body);
  assertAllowedFields(record, FORBIDDEN, ['name', 'sortOrder']);
  const name = parseRequiredString(record.name, 'name');
  assertNonEmptyName(name);
  return { name, ...(record.sortOrder !== undefined ? { sortOrder: parseSortOrder(record.sortOrder) } : {}) };
}

function parseUpdate(body: unknown): { name?: string; active?: boolean; sortOrder?: number } {
  const record = parseObjectBody(body);
  assertAllowedFields(record, FORBIDDEN, ['name', 'active', 'sortOrder']);
  const data: { name?: string; active?: boolean; sortOrder?: number } = {};
  if (record.name !== undefined) {
    data.name = parseRequiredString(record.name, 'name');
    assertNonEmptyName(data.name);
  }
  if (record.active !== undefined) {
    if (typeof record.active !== 'boolean') throw new ValidationError('Field "active" must be a boolean');
    data.active = record.active;
  }
  if (record.sortOrder !== undefined) data.sortOrder = parseSortOrder(record.sortOrder);
  if (Object.keys(data).length === 0) throw new ValidationError('At least one field must be provided');
  return data;
}

function parseForm(body: unknown): SaleCategoryFormInput {
  const record = parseObjectBody(body);
  assertAllowedFields(record, FORBIDDEN, ['fields']);
  if (!Array.isArray(record.fields) || record.fields.length > 100) {
    throw new ValidationError('Field "fields" must be an array of at most 100 items');
  }
  const fields = record.fields.map((entry: unknown) => {
    const item = parseObjectBody(entry);
    assertAllowedFields(item, FORBIDDEN, ['fieldKey', 'enabled', 'required', 'sortOrder']);
    if (typeof item.fieldKey !== 'string') throw new ValidationError('Field "fieldKey" must be a string');
    if (typeof item.enabled !== 'boolean' || typeof item.required !== 'boolean') {
      throw new ValidationError('Fields "enabled" and "required" must be booleans');
    }
    return {
      fieldKey: item.fieldKey,
      enabled: item.enabled,
      required: item.required,
      ...(item.sortOrder !== undefined ? { sortOrder: parseSortOrder(item.sortOrder) } : {}),
    };
  });
  return { fields };
}

export function registerSaleCategoriesRoutes(app: FastifyInstance, options: SaleCategoriesRoutesOptions): void {
  const { database, protectedHooks } = options;

  app.get('/sale-form-fields', { preHandler: protectedHooks }, () => {
    requireRole(UserRole.VIEWER);
    return { fields: listSaleFormRegistry() };
  });

  app.get('/sale-categories', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.VIEWER);
    const query = request.query as Record<string, string | undefined>;
    return { categories: await listSaleCategories(database, query.includeInactive === 'true') };
  });

  app.post('/sale-categories', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const category = await createSaleCategory(database, parseCreate(request.body));
    reply.code(201);
    return { category };
  });

  app.patch<{ Params: { id: string } }>('/sale-categories/:id', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.ADMIN);
    return { category: await updateSaleCategory(database, request.params.id, parseUpdate(request.body)) };
  });

  app.get<{ Params: { id: string } }>('/sale-categories/:id/form', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.VIEWER);
    return { form: await getSaleCategoryForm(database, request.params.id) };
  });

  app.put<{ Params: { id: string } }>('/sale-categories/:id/form', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.ADMIN);
    return { form: await replaceSaleCategoryForm(database, request.params.id, parseForm(request.body)) };
  });
}
