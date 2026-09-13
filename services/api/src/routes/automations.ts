/**
 * Automations -- HTTP surface for social automation CRUD and lifecycle transitions.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { AutomationStatus, PlatformFeature, UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import {
  createAutomation,
  getAutomationById,
  listAutomations,
  setAutomationStatus,
  type CreateAutomationInput,
} from '../automations';
import { requireEntitlement } from '../entitlements';
import {
  parseNonNegativeNumber,
  parseObjectBody,
  parsePositiveNumber,
  parseRequiredDate,
  parseRequiredString,
} from '../request-parsing';

export interface AutomationsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerAutomationsRoutes(
  app: FastifyInstance,
  options: AutomationsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/automations', { preHandler: protectedHooks }, async () => {
    await requireEntitlement(database, PlatformFeature.SOCIAL_AUTOMATION);
    requireRole(UserRole.VIEWER);
    const automations = await listAutomations(database);
    return { automations };
  });

  app.get<{ Params: { id: string } }>(
    '/automations/:id',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(database, PlatformFeature.SOCIAL_AUTOMATION);
      requireRole(UserRole.VIEWER);
      const automation = await getAutomationById(database, request.params.id);
      return { automation };
    }
  );

  app.post('/automations', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(database, PlatformFeature.SOCIAL_AUTOMATION);
    requireRole(UserRole.AGENT);
    const data = parseCreateAutomationInput(request.body);
    const automation = await createAutomation(database, data);
    reply.code(201);
    return { automation };
  });

  app.post<{ Params: { id: string } }>(
    '/automations/:id/activate',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(database, PlatformFeature.SOCIAL_AUTOMATION);
      requireRole(UserRole.MANAGER);
      const automation = await setAutomationStatus(
        database,
        request.params.id,
        AutomationStatus.ACTIVE
      );
      return { automation };
    }
  );

  app.post<{ Params: { id: string } }>(
    '/automations/:id/pause',
    { preHandler: protectedHooks },
    async (request) => {
      await requireEntitlement(database, PlatformFeature.SOCIAL_AUTOMATION);
      requireRole(UserRole.MANAGER);
      const automation = await setAutomationStatus(
        database,
        request.params.id,
        AutomationStatus.PAUSED
      );
      return { automation };
    }
  );
}

function parseCreateAutomationInput(body: unknown): CreateAutomationInput {
  const record = parseObjectBody(body);
  const name = parseRequiredString(record.name, 'name');
  const trigger = parseRequiredString(record.trigger, 'trigger');
  if (!Array.isArray(record.actions)) {
    throw new ValidationError('Field "actions" must be an array');
  }

  const data: CreateAutomationInput = {
    name,
    trigger: trigger as CreateAutomationInput['trigger'],
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
