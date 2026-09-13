/**
 * Coupons -- HTTP surface for coupon CRUD, grants, and redemptions.
 *
 * Registered as one unit from app.ts, same convention as
 * routes/customer-documents.ts.
 */

import type { FastifyInstance } from 'fastify';
import type { preHandlerHookHandler } from 'fastify';
import { requireRole } from '../../../../packages/domain/tenant-context';
import { PlatformFeature, UserRole } from '../../../../packages/domain/types';
import type { DatabaseRuntime } from '../database';
import {
  createCoupon,
  grantCoupon,
  listCoupons,
  recordRedemption,
  type CreateCouponInput,
  type GrantCouponInput,
  type RecordRedemptionInput,
} from '../coupons';
import { requireEntitlement } from '../entitlements';
import {
  parseNonNegativeNumber,
  parseObjectBody,
  parsePositiveNumber,
  parseRequiredDate,
  parseRequiredString,
} from '../request-parsing';

export interface CouponsRoutesOptions {
  database: DatabaseRuntime;
  protectedHooks: preHandlerHookHandler[];
}

export function registerCouponsRoutes(
  app: FastifyInstance,
  options: CouponsRoutesOptions,
): void {
  const { database, protectedHooks } = options;

  app.get('/coupons', { preHandler: protectedHooks }, async () => {
    await requireEntitlement(database, PlatformFeature.CAMPAIGNS);
    requireRole(UserRole.VIEWER);
    const coupons = await listCoupons(database);
    return { coupons };
  });

  app.post('/coupons', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(database, PlatformFeature.CAMPAIGNS);
    requireRole(UserRole.AGENT);
    const data = parseCreateCouponInput(request.body);
    const coupon = await createCoupon(database, data);
    reply.code(201);
    return { coupon };
  });

  app.post('/coupons/grants', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(database, PlatformFeature.CAMPAIGNS);
    requireRole(UserRole.AGENT);
    const data = parseGrantCouponInput(request.body);
    const grant = await grantCoupon(database, data);
    reply.code(201);
    return { grant };
  });

  app.post('/coupons/redemptions', { preHandler: protectedHooks }, async (request, reply) => {
    await requireEntitlement(database, PlatformFeature.CAMPAIGNS);
    requireRole(UserRole.AGENT);
    const data = parseRecordRedemptionInput(request.body);
    const redemption = await recordRedemption(database, data);
    reply.code(201);
    return { redemption };
  });
}

function parseCreateCouponInput(body: unknown): CreateCouponInput {
  const record = parseObjectBody(body);
  const code = parseRequiredString(record.code, 'code');
  const name = parseRequiredString(record.name, 'name');
  const type = parseRequiredString(record.type, 'type');

  const data: CreateCouponInput = { code, name, type: type as CreateCouponInput['type'] };

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
  const couponId = parseRequiredString(record.couponId, 'couponId');

  const data: GrantCouponInput = { couponId };

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
  const couponId = parseRequiredString(record.couponId, 'couponId');
  const customerId = parseRequiredString(record.customerId, 'customerId');

  const data: RecordRedemptionInput = { couponId, customerId };

  if (record.grantId !== undefined) data.grantId = parseRequiredString(record.grantId, 'grantId');
  if (record.proposalId !== undefined) data.proposalId = parseRequiredString(record.proposalId, 'proposalId');
  if (record.saleId !== undefined) data.saleId = parseRequiredString(record.saleId, 'saleId');
  if (record.amountApplied !== undefined) data.amountApplied = parseNonNegativeNumber(record.amountApplied, 'amountApplied');

  return data;
}
