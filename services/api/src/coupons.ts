import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import { CouponGrantStatus, CouponType } from '../../../packages/domain/types';
import type { Coupon, CouponGrant, CouponRedemption } from '../../../packages/domain/types';
import type { DatabaseRuntime, TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { recordAuditLog } from './offer-growth-audit';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface CouponRow {
  id: string;
  agency_id: string;
  code: string;
  name: string;
  type: CouponType;
  value: string | null;
  benefit_description: string | null;
  starts_at: string | null;
  expires_at: string | null;
  max_uses: number | null;
  max_uses_per_customer: number | null;
  campaign_id: string | null;
  offer_id: string | null;
  active: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CouponGrantRow {
  id: string;
  agency_id: string;
  coupon_id: string;
  campaign_id: string | null;
  publication_id: string | null;
  automation_id: string | null;
  customer_id: string | null;
  external_user_id: string | null;
  issued_at: string;
  expires_at: string | null;
  delivery_channel: string | null;
  status: CouponGrantStatus;
  created_at: string;
}

interface CouponRedemptionRow {
  id: string;
  agency_id: string;
  coupon_id: string;
  grant_id: string | null;
  customer_id: string;
  proposal_id: string | null;
  sale_id: string | null;
  amount_applied: string | null;
  redeemed_at: string;
  reversed_at: string | null;
  recorded_by_user_id: string | null;
  created_at: string;
}

export interface CreateCouponInput {
  code: string;
  name: string;
  type: CouponType;
  value?: number;
  benefitDescription?: string;
  startsAt?: Date;
  expiresAt?: Date;
  maxUses?: number;
  maxUsesPerCustomer?: number;
  campaignId?: string;
  offerId?: string;
}

export interface GrantCouponInput {
  couponId: string;
  campaignId?: string;
  publicationId?: string;
  automationId?: string;
  customerId?: string;
  externalUserId?: string;
  deliveryChannel?: string;
  expiresAt?: Date;
}

export interface RecordRedemptionInput {
  couponId: string;
  grantId?: string;
  customerId: string;
  proposalId?: string;
  saleId?: string;
  amountApplied?: number;
}

const COUPON_COLUMNS = `id, agency_id, code, name, type, value, benefit_description, starts_at,
  expires_at, max_uses, max_uses_per_customer, campaign_id, offer_id, active, created_by_user_id,
  created_at, updated_at`;
const GRANT_COLUMNS = `id, agency_id, coupon_id, campaign_id, publication_id, automation_id,
  customer_id, external_user_id, issued_at, expires_at, delivery_channel, status, created_at`;
const REDEMPTION_COLUMNS = `id, agency_id, coupon_id, grant_id, customer_id, proposal_id, sale_id,
  amount_applied, redeemed_at, reversed_at, recorded_by_user_id, created_at`;

export async function listCoupons(database: DatabaseRuntime): Promise<Coupon[]> {
  const agencyId = getAgencyId();
  return database.withTenantTransaction(async (client) => {
    const result = await client.query<CouponRow>(
      `SELECT ${COUPON_COLUMNS} FROM coupons WHERE agency_id = $1 ORDER BY created_at DESC`,
      [agencyId],
    );
    return result.rows.map(toCoupon);
  });
}

export async function createCoupon(database: DatabaseRuntime, data: CreateCouponInput): Promise<Coupon> {
  const agencyId = getAgencyId();
  const userId = getUserId();
  validateCreateCouponInput(data);

  return database.withTenantTransaction((client) => insertCoupon(client, agencyId, userId, data));
}

export async function insertCoupon(
  client: TenantTransactionClient,
  agencyId: string,
  userId: string | null,
  data: CreateCouponInput,
): Promise<Coupon> {
  try {
    const result = await client.query<CouponRow>(
      `INSERT INTO coupons
         (agency_id, code, name, type, value, benefit_description, starts_at, expires_at,
          max_uses, max_uses_per_customer, campaign_id, offer_id, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING ${COUPON_COLUMNS}`,
      [
        agencyId,
        data.code,
        data.name,
        data.type,
        data.value ?? null,
        data.benefitDescription ?? null,
        data.startsAt ?? null,
        data.expiresAt ?? null,
        data.maxUses ?? null,
        data.maxUsesPerCustomer ?? null,
        data.campaignId ?? null,
        data.offerId ?? null,
        userId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Coupon insert did not return a row');

    await recordAuditLog(client, {
      ...(userId !== null ? { actorUserId: userId } : {}),
      action: 'coupon.created',
      entityType: 'Coupon',
      entityId: row.id,
      metadata: { code: row.code, type: row.type },
    });

    return toCoupon(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('A coupon with this code already exists');
    }
    throw error;
  }
}

export async function grantCoupon(database: DatabaseRuntime, data: GrantCouponInput): Promise<CouponGrant> {
  const agencyId = getAgencyId();
  validateGrantInput(data);
  return database.withTenantTransaction((client) => insertGrant(client, agencyId, data));
}

export async function insertGrant(
  client: TenantTransactionClient,
  agencyId: string,
  data: GrantCouponInput,
): Promise<CouponGrant> {
  const result = await client.query<CouponGrantRow>(
    `INSERT INTO coupon_grants
       (agency_id, coupon_id, campaign_id, publication_id, automation_id, customer_id,
        external_user_id, delivery_channel, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${GRANT_COLUMNS}`,
    [
      agencyId,
      data.couponId,
      data.campaignId ?? null,
      data.publicationId ?? null,
      data.automationId ?? null,
      data.customerId ?? null,
      data.externalUserId ?? null,
      data.deliveryChannel ?? null,
      data.expiresAt ?? null,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('CouponGrant insert did not return a row');

  await recordAuditLog(client, {
    action: 'coupon.granted',
    entityType: 'CouponGrant',
    entityId: row.id,
    metadata: { couponId: data.couponId, externalUserId: data.externalUserId, customerId: data.customerId },
  });

  return toGrant(row);
}

// Manual "record a redemption" endpoint only -- deliberately NOT wired
// into Proposal/Sale pricing logic (sales.ts) in this batch.
export async function recordRedemption(
  database: DatabaseRuntime,
  data: RecordRedemptionInput,
): Promise<CouponRedemption> {
  const agencyId = getAgencyId();
  const userId = getUserId();
  validateRedemptionInput(data);

  return database.withTenantTransaction(async (client) => {
    const coupon = await client.query<CouponRow>(
      `SELECT ${COUPON_COLUMNS} FROM coupons WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
      [agencyId, data.couponId],
    );
    const couponRow = coupon.rows[0];
    if (!couponRow) throw new NotFoundError('Coupon not found');
    if (!couponRow.active) throw new ConflictError('Coupon is not active');

    const usesResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM coupon_redemptions
       WHERE agency_id = $1 AND coupon_id = $2 AND reversed_at IS NULL`,
      [agencyId, data.couponId],
    );
    const totalUses = Number(usesResult.rows[0]?.count ?? 0);
    if (couponRow.max_uses !== null && totalUses >= couponRow.max_uses) {
      throw new ConflictError('Coupon has reached its maximum uses');
    }

    const perCustomerResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM coupon_redemptions
       WHERE agency_id = $1 AND coupon_id = $2 AND customer_id = $3 AND reversed_at IS NULL`,
      [agencyId, data.couponId, data.customerId],
    );
    const customerUses = Number(perCustomerResult.rows[0]?.count ?? 0);
    if (
      couponRow.max_uses_per_customer !== null &&
      customerUses >= couponRow.max_uses_per_customer
    ) {
      throw new ConflictError('Customer has reached max uses for this coupon');
    }

    const result = await client.query<CouponRedemptionRow>(
      `INSERT INTO coupon_redemptions
         (agency_id, coupon_id, grant_id, customer_id, proposal_id, sale_id, amount_applied, recorded_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${REDEMPTION_COLUMNS}`,
      [
        agencyId,
        data.couponId,
        data.grantId ?? null,
        data.customerId,
        data.proposalId ?? null,
        data.saleId ?? null,
        data.amountApplied ?? null,
        userId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('CouponRedemption insert did not return a row');

    if (data.grantId) {
      await client.query(
        `UPDATE coupon_grants SET status = 'REDEEMED' WHERE agency_id = $1 AND id = $2`,
        [agencyId, data.grantId],
      );
    }

    await recordAuditLog(client, {
      actorUserId: userId,
      action: 'coupon.redeemed',
      entityType: 'CouponRedemption',
      entityId: row.id,
      metadata: { couponId: data.couponId, customerId: data.customerId },
    });

    return toRedemption(row);
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}

function validateCreateCouponInput(data: CreateCouponInput): void {
  if (typeof data.code !== 'string' || data.code.trim().length === 0) {
    throw new ValidationError('Field "code" is required');
  }
  if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    throw new ValidationError('Field "name" is required');
  }
  if (!Object.values(CouponType).includes(data.type)) {
    throw new ValidationError('Field "type" must be a valid CouponType');
  }
  if (data.type !== CouponType.BENEFIT && (data.value === undefined || data.value < 0)) {
    throw new ValidationError('Field "value" is required and must be non-negative for this coupon type');
  }
}

function validateGrantInput(data: GrantCouponInput): void {
  if (typeof data.couponId !== 'string' || data.couponId.trim().length === 0) {
    throw new ValidationError('Field "couponId" is required');
  }
  if (!data.customerId && !data.externalUserId) {
    throw new ValidationError('CouponGrant requires customerId or externalUserId');
  }
}

function validateRedemptionInput(data: RecordRedemptionInput): void {
  if (typeof data.couponId !== 'string' || data.couponId.trim().length === 0) {
    throw new ValidationError('Field "couponId" is required');
  }
  if (typeof data.customerId !== 'string' || data.customerId.trim().length === 0) {
    throw new ValidationError('Field "customerId" is required');
  }
}

function toCoupon(row: CouponRow): Coupon {
  return {
    id: row.id,
    agencyId: row.agency_id,
    code: row.code,
    name: row.name,
    type: row.type,
    active: row.active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.value !== null ? { value: Number(row.value) } : {}),
    ...(row.benefit_description !== null ? { benefitDescription: row.benefit_description } : {}),
    ...(row.starts_at !== null ? { startsAt: new Date(row.starts_at) } : {}),
    ...(row.expires_at !== null ? { expiresAt: new Date(row.expires_at) } : {}),
    ...(row.max_uses !== null ? { maxUses: row.max_uses } : {}),
    ...(row.max_uses_per_customer !== null ? { maxUsesPerCustomer: row.max_uses_per_customer } : {}),
    ...(row.campaign_id !== null ? { campaignId: row.campaign_id } : {}),
    ...(row.offer_id !== null ? { offerId: row.offer_id } : {}),
    ...(row.created_by_user_id !== null ? { createdByUserId: row.created_by_user_id } : {}),
  };
}

function toGrant(row: CouponGrantRow): CouponGrant {
  return {
    id: row.id,
    agencyId: row.agency_id,
    couponId: row.coupon_id,
    issuedAt: new Date(row.issued_at),
    status: row.status,
    createdAt: new Date(row.created_at),
    ...(row.campaign_id !== null ? { campaignId: row.campaign_id } : {}),
    ...(row.publication_id !== null ? { publicationId: row.publication_id } : {}),
    ...(row.automation_id !== null ? { automationId: row.automation_id } : {}),
    ...(row.customer_id !== null ? { customerId: row.customer_id } : {}),
    ...(row.external_user_id !== null ? { externalUserId: row.external_user_id } : {}),
    ...(row.expires_at !== null ? { expiresAt: new Date(row.expires_at) } : {}),
    ...(row.delivery_channel !== null ? { deliveryChannel: row.delivery_channel } : {}),
  };
}

function toRedemption(row: CouponRedemptionRow): CouponRedemption {
  return {
    id: row.id,
    agencyId: row.agency_id,
    couponId: row.coupon_id,
    customerId: row.customer_id,
    redeemedAt: new Date(row.redeemed_at),
    createdAt: new Date(row.created_at),
    ...(row.grant_id !== null ? { grantId: row.grant_id } : {}),
    ...(row.proposal_id !== null ? { proposalId: row.proposal_id } : {}),
    ...(row.sale_id !== null ? { saleId: row.sale_id } : {}),
    ...(row.amount_applied !== null ? { amountApplied: Number(row.amount_applied) } : {}),
    ...(row.reversed_at !== null ? { reversedAt: new Date(row.reversed_at) } : {}),
    ...(row.recorded_by_user_id !== null ? { recordedByUserId: row.recorded_by_user_id } : {}),
  };
}
