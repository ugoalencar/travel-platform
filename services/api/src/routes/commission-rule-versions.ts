/**
 * Versioned commission rules, sale attributions and versioned generation (Onda E1).
 * Rules: ADMIN writes, MANAGER reads. Attribution/generation: MANAGER.
 */

import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import { ValidationError } from '../errors';
import { createCommissionPaymentPolicy, getCommissionCostPolicy, listCommissionPaymentPolicies, setCommissionCostPolicy } from '../commission-payment-policies';
import { assertAllowedFields, parseObjectBody, parseRequiredString } from '../request-parsing';
import {
  attributeSale,
  cancelAttribution,
  createRuleScope,
  generateVersionedCommission,
  getCommissionEngineSettings,
  listRuleScopes,
  reviseRuleScope,
  setCommissionEngineCutoverDate,
  type RuleVersionInput,
} from '../commission-rule-versions';

const FORBIDDEN = ['agencyId', 'tenantId', 'id', 'seq', 'createdAt'] as const;
const VERSION_FIELDS = ['effectiveFrom', 'mode', 'calculationMetric', 'value', 'applyOn', 'excessThreshold', 'progressive', 'tierMode', 'tiers', 'reason', 'releaseAfterSupplierPayment'] as const;

function num(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new ValidationError(`Field "${field}" must be a non-negative number`);
  return value;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function parseVersion(value: unknown): RuleVersionInput {
  const record = parseObjectBody(value);
  assertAllowedFields(record, FORBIDDEN, VERSION_FIELDS);
  const mode = record.mode;
  if (mode !== 'PERCENTAGE' && mode !== 'FIXED' && mode !== 'NONE') throw new ValidationError('Field "mode" must be PERCENTAGE, FIXED or NONE');
  const metric = record.calculationMetric ?? 'GROSS';
  if (metric !== 'GROSS' && metric !== 'MARGIN' && metric !== 'SUPPLIER_SOLD_TOTAL') throw new ValidationError('Field "calculationMetric" is invalid');
  const applyOn = record.applyOn ?? 'TOTAL';
  if (applyOn !== 'TOTAL' && applyOn !== 'EXCESS') throw new ValidationError('Field "applyOn" must be TOTAL or EXCESS');
  const out: RuleVersionInput = {
    effectiveFrom: parseRequiredString(record.effectiveFrom, 'effectiveFrom'),
    mode,
    calculationMetric: metric,
    applyOn,
    progressive: record.progressive === true,
  };
  if (record.progressive !== undefined && typeof record.progressive !== 'boolean') throw new ValidationError('Field "progressive" must be a boolean');
  if (record.releaseAfterSupplierPayment !== undefined && typeof record.releaseAfterSupplierPayment !== 'boolean') throw new ValidationError('Field "releaseAfterSupplierPayment" must be a boolean');
  out.releaseAfterSupplierPayment = record.releaseAfterSupplierPayment === true;
  const tierMode = record.tierMode ?? 'MARGINAL';
  if (tierMode !== 'MARGINAL' && tierMode !== 'TOTAL') throw new ValidationError('Field "tierMode" must be MARGINAL or TOTAL');
  out.tierMode = tierMode;
  if (record.value !== undefined && record.value !== null) out.value = num(record.value, 'value');
  if (record.excessThreshold !== undefined && record.excessThreshold !== null) out.excessThreshold = num(record.excessThreshold, 'excessThreshold');
  if (record.reason !== undefined) out.reason = parseRequiredString(record.reason, 'reason').slice(0, 500);
  if (record.tiers !== undefined) {
    if (!Array.isArray(record.tiers) || record.tiers.length > 20) throw new ValidationError('Field "tiers" must be an array of at most 20 items');
    out.tiers = record.tiers.map((t: unknown) => {
      const tier = parseObjectBody(t);
      assertAllowedFields(tier, FORBIDDEN, ['fromAmount', 'toAmount', 'rate']);
      return { fromAmount: num(tier.fromAmount, 'fromAmount'), toAmount: tier.toAmount === null || tier.toAmount === undefined ? null : num(tier.toAmount, 'toAmount'), rate: num(tier.rate, 'rate') };
    });
  }
  return out;
}

function optionalId(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  return parseRequiredString(value, field);
}

export function registerCommissionRuleVersionsRoutes(
  app: FastifyInstance,
  options: { database: DatabaseRuntime; protectedHooks: preHandlerHookHandler[] },
): void {
  const { database, protectedHooks } = options;

  app.get('/commission-rule-scopes', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    return { scopes: await listRuleScopes(database) };
  });

  app.get('/commission-engine-settings', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    return getCommissionEngineSettings(database);
  });

  app.get('/commission-payment-policies', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    return { policies: await listCommissionPaymentPolicies(database) };
  });

  app.post('/commission-payment-policies', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const body=parseObjectBody(request.body);
    assertAllowedFields(body,FORBIDDEN,['employeeId','mode','effectiveFrom','day','paymentDays','reason']);
    const mode=body.mode;
    if(mode!=='PER_ENTRY'&&mode!=='FIXED_DAY'&&mode!=='WINDOW') throw new ValidationError('mode is invalid');
    const day=body.day===undefined||body.day===null?null:num(body.day,'day');
    const paymentDays=body.paymentDays===undefined?0:num(body.paymentDays,'paymentDays');
    const created=await createCommissionPaymentPolicy(database,{employeeId:optionalId(body.employeeId,'employeeId'),mode,effectiveFrom:parseRequiredString(body.effectiveFrom,'effectiveFrom'),day,paymentDays,reason:parseRequiredString(body.reason,'reason')});
    reply.code(201);
    return created;
  });

  app.get('/commission-cost-policy', { preHandler: protectedHooks }, async () => {
    requireRole(UserRole.MANAGER);
    return { mode: await getCommissionCostPolicy(database) };
  });

  app.put('/commission-cost-policy', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.ADMIN);
    const body=parseObjectBody(request.body);
    assertAllowedFields(body,FORBIDDEN,['mode']);
    if(body.mode!=='WARN'&&body.mode!=='BLOCK') throw new ValidationError('mode must be WARN or BLOCK');
    await setCommissionCostPolicy(database,body.mode);
    return {mode:body.mode};
  });

  app.put('/commission-engine-settings', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.ADMIN);
    const body=parseObjectBody(request.body);
    assertAllowedFields(body,FORBIDDEN,['cutoverDate']);
    const cutoverDate=body.cutoverDate;
    if (!isNullableString(cutoverDate)) throw new ValidationError('Field "cutoverDate" must be a date or null');
    await setCommissionEngineCutoverDate(database,cutoverDate);
    return {ok:true};
  });

  app.post('/commission-rule-scopes', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const body = parseObjectBody(request.body);
    assertAllowedFields(body, FORBIDDEN, ['employeeId', 'supplierId', 'categoryId', 'version']);
    const created = await createRuleScope(database, {
      employeeId: optionalId(body.employeeId, 'employeeId'),
      supplierId: optionalId(body.supplierId, 'supplierId'),
      categoryId: optionalId(body.categoryId, 'categoryId'),
      version: parseVersion(body.version),
    });
    reply.code(201);
    return created;
  });

  app.post<{ Params: { id: string } }>('/commission-rule-scopes/:id/versions', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.ADMIN);
    const created = await reviseRuleScope(database, request.params.id, parseVersion(request.body));
    reply.code(201);
    return created;
  });

  app.post<{ Params: { saleId: string } }>('/sales/:saleId/commission-attributions', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const body = parseObjectBody(request.body);
    assertAllowedFields(body, FORBIDDEN, ['employeeId', 'supplierId', 'categoryId', 'recognitionDate']);
    const created = await attributeSale(database, {
      saleId: request.params.saleId,
      employeeId: parseRequiredString(body.employeeId, 'employeeId'),
      supplierId: optionalId(body.supplierId, 'supplierId'),
      categoryId: optionalId(body.categoryId, 'categoryId'),
      ...(body.recognitionDate !== undefined ? { recognitionDate: parseRequiredString(body.recognitionDate, 'recognitionDate') } : {}),
    });
    reply.code(201);
    return created;
  });

  app.post<{ Params: { id: string } }>('/commission-attributions/:id/cancel', { preHandler: protectedHooks }, async (request) => {
    requireRole(UserRole.MANAGER);
    await cancelAttribution(database, request.params.id);
    return { ok: true };
  });

  app.post<{ Params: { saleId: string } }>('/sales/:saleId/commission-entries/versioned', { preHandler: protectedHooks }, async (request, reply) => {
    requireRole(UserRole.MANAGER);
    const body = parseObjectBody(request.body);
    assertAllowedFields(body, FORBIDDEN, ['employeeId', 'supplierId']);
    const generated = await generateVersionedCommission(database, {
      saleId: request.params.saleId,
      employeeId: parseRequiredString(body.employeeId, 'employeeId'),
      supplierId: optionalId(body.supplierId, 'supplierId'),
    });
    reply.code(201);
    return generated;
  });
}
