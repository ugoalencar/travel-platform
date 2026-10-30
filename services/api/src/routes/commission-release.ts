/**
 * Commission release configuration and state (Onda E2, COM-03).
 * Configuration (receipt rule per payment method, agency financial profile): ADMIN writes, MANAGER reads.
 */

import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import { assertAllowedFields, parseObjectBody, parseRequiredString } from '../request-parsing';
import {
  createFinancialProfile,
  getEntryRelease,
  listFinancialProfiles,
  listReceiptRules,
  setReceiptRule,
} from '../commission-release-service';

const FORBIDDEN = ['agencyId', 'tenantId', 'id', 'createdAt'] as const;

export function registerCommissionReleaseRoutes(
  app: FastifyInstance,
  options: { database: DatabaseRuntime; protectedHooks: preHandlerHookHandler[] },
): void {
  const { database, protectedHooks } = options;

  app.get('/commission-release/config', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    const [receiptRules, profiles] = await Promise.all([listReceiptRules(database), listFinancialProfiles(database)]);
    const missing: string[] = [];
    if (receiptRules.length === 0) missing.push('PAYMENT_METHOD_RECEIPT_RULE_UNSET');
    if (!profiles.some((profile) => profile.active)) missing.push('FINANCIAL_PROFILE_NOT_ACTIVE');
    return { receiptRules, profiles, blocked: missing.length > 0, missing };
  });

  app.put('/commission-release/receipt-rules', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.ADMIN);
    const body = parseObjectBody(request.body);
    assertAllowedFields(body, FORBIDDEN, ['method', 'requiresReceipt']);
    if (typeof body.requiresReceipt !== 'boolean') throw new ValidationError('Field "requiresReceipt" must be a boolean');
    await setReceiptRule(database, parseRequiredString(body.method, 'method'), body.requiresReceipt);
    return { method: body.method, requiresReceipt: body.requiresReceipt };
  });

  app.post('/commission-release/financial-profiles', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const body = parseObjectBody(request.body);
    assertAllowedFields(body, FORBIDDEN, ['effect', 'effectiveFrom', 'reason']);
    const effect = body.effect;
    if (effect !== 'META_E_LIBERACAO' && effect !== 'SOMENTE_LIBERACAO') {
      throw new ValidationError('Field "effect" must be META_E_LIBERACAO or SOMENTE_LIBERACAO');
    }
    const created = await createFinancialProfile(database, {
      effect,
      effectiveFrom: parseRequiredString(body.effectiveFrom, 'effectiveFrom'),
      ...(body.reason !== undefined ? { reason: parseRequiredString(body.reason, 'reason').slice(0, 500) } : {}),
    });
    reply.code(201);
    return created;
  });

  app.get<{ Params: { id: string } }>('/commission-entries/:id/release', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    return getEntryRelease(database, request.params.id);
  });
}
