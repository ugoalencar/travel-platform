// Partner Campaigns (Agent 10): campaigns run BY an external commercial
// partner (advertiser), attributed to that partner, placed across app
// surfaces (staff dashboard, proposal, trip, customer portal, catalog).
//
// NOT the same concept as services/api/src/campaigns.ts (the agency's own
// internal "offer growth" marketing campaigns, backed by the `campaigns`
// table). Do not merge these modules or their tables.
//
// `partner_id` now references Agent 04's real `commercial_partners` model
// via migration 054. `campaign_partner_stubs` remains only as a historical
// compatibility table for rows created before the reconciliation.
import { getAgencyId, getUserId } from '../../../packages/domain/tenant-context';
import type { TenantTransactionClient } from './database';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { AuditEventType, recordAuditEvent } from './audit-log';

export const PartnerCampaignStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
} as const;
export type PartnerCampaignStatus =
  (typeof PartnerCampaignStatus)[keyof typeof PartnerCampaignStatus];

// Explicit lifecycle state machine, mirroring campaigns.ts's pattern --
// only listed transitions are valid.
const PARTNER_CAMPAIGN_STATUS_TRANSITIONS: Record<PartnerCampaignStatus, PartnerCampaignStatus[]> = {
  DRAFT: [PartnerCampaignStatus.ACTIVE],
  ACTIVE: [PartnerCampaignStatus.PAUSED, PartnerCampaignStatus.COMPLETED],
  PAUSED: [PartnerCampaignStatus.ACTIVE, PartnerCampaignStatus.COMPLETED],
  COMPLETED: [],
};

export const CampaignCommercialModel = {
  CPA: 'CPA',
  FLAT_FEE: 'FLAT_FEE',
  REVENUE_SHARE: 'REVENUE_SHARE',
  OTHER: 'OTHER',
} as const;
export type CampaignCommercialModel =
  (typeof CampaignCommercialModel)[keyof typeof CampaignCommercialModel];

export const CampaignPlacementLocation = {
  STAFF_DASHBOARD: 'STAFF_DASHBOARD',
  PROPOSAL: 'PROPOSAL',
  TRIP: 'TRIP',
  CUSTOMER_PORTAL: 'CUSTOMER_PORTAL',
  CATALOG: 'CATALOG',
} as const;
export type CampaignPlacementLocation =
  (typeof CampaignPlacementLocation)[keyof typeof CampaignPlacementLocation];

export const CampaignAttributionEventType = {
  IMPRESSION: 'IMPRESSION',
  CLICK: 'CLICK',
} as const;
export type CampaignAttributionEventType =
  (typeof CampaignAttributionEventType)[keyof typeof CampaignAttributionEventType];

export interface PartnerCampaign {
  id: string;
  agencyId: string;
  partnerId: string;
  name: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  destination: string | null;
  ctaText: string | null;
  ctaLink: string | null;
  commercialModel: CampaignCommercialModel;
  status: PartnerCampaignStatus;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignPlacement {
  id: string;
  agencyId: string;
  campaignId: string;
  location: CampaignPlacementLocation;
  active: boolean;
  createdAt: string;
}

export interface CampaignProduct {
  id: string;
  agencyId: string;
  campaignId: string;
  productDescription: string;
  createdAt: string;
}

export interface CampaignAttributionSummary {
  campaignId: string;
  impressions: number;
  clicks: number;
}

export interface CreatePartnerCampaignInput {
  partnerId: string;
  name: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  destination?: string;
  ctaText?: string;
  ctaLink?: string;
  commercialModel?: CampaignCommercialModel;
  productDescriptions?: string[];
}

const CAMPAIGN_COLUMNS = `id, agency_id, partner_id, name, description, starts_at, ends_at,
  destination, cta_text, cta_link, commercial_model, status, created_by_user_id,
  created_at, updated_at`;

interface PartnerCampaignRow {
  id: string;
  agency_id: string;
  partner_id: string;
  name: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  destination: string | null;
  cta_text: string | null;
  cta_link: string | null;
  commercial_model: CampaignCommercialModel;
  status: PartnerCampaignStatus;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Campaign partner directory (lightweight alias over CommercialPartner)
// ============================================================

export interface CampaignPartnerStub {
  id: string;
  agencyId: string;
  name: string;
  createdAt: string;
}

export async function listCampaignPartnerStubs(
  client: TenantTransactionClient,
): Promise<CampaignPartnerStub[]> {
  const agencyId = getAgencyId();
  const result = await client.query<{ id: string; agency_id: string; name: string; created_at: string }>(
    `SELECT id, agency_id, name, created_at FROM commercial_partners
     WHERE agency_id = $1 AND status = 'ACTIVE'
     ORDER BY name ASC`,
    [agencyId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    agencyId: row.agency_id,
    name: row.name,
    createdAt: row.created_at,
  }));
}

export async function createCampaignPartnerStub(
  client: TenantTransactionClient,
  name: string,
): Promise<CampaignPartnerStub> {
  const agencyId = getAgencyId();
  const trimmed = name?.trim();
  if (!trimmed) {
    throw new ValidationError('Field "name" is required');
  }
  const result = await client.query<{ id: string; agency_id: string; name: string; created_at: string }>(
    `INSERT INTO commercial_partners (agency_id, partner_type, name)
     VALUES ($1, 'PJ', $2)
     RETURNING id, agency_id, name, created_at`,
    [agencyId, trimmed],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Partner stub insert did not return a row');
  return { id: row.id, agencyId: row.agency_id, name: row.name, createdAt: row.created_at };
}

// ============================================================
// PartnerCampaign
// ============================================================

export async function listPartnerCampaigns(
  client: TenantTransactionClient,
): Promise<PartnerCampaign[]> {
  const agencyId = getAgencyId();
  const result = await client.query<PartnerCampaignRow>(
    `SELECT ${CAMPAIGN_COLUMNS} FROM partner_campaigns WHERE agency_id = $1 ORDER BY created_at DESC`,
    [agencyId],
  );
  return result.rows.map(toPartnerCampaign);
}

export async function getPartnerCampaignById(
  client: TenantTransactionClient,
  id: string,
): Promise<PartnerCampaign> {
  const agencyId = getAgencyId();
  return loadPartnerCampaign(client, agencyId, id);
}

export async function createPartnerCampaign(
  client: TenantTransactionClient,
  data: CreatePartnerCampaignInput,
): Promise<PartnerCampaign> {
  const agencyId = getAgencyId();
  const userId = getUserId();
  validateCreatePartnerCampaignInput(data);

  const result = await client.query<PartnerCampaignRow>(
    `INSERT INTO partner_campaigns
       (agency_id, partner_id, name, description, starts_at, ends_at, destination,
        cta_text, cta_link, commercial_model, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${CAMPAIGN_COLUMNS}`,
    [
      agencyId,
      data.partnerId,
      data.name.trim(),
      data.description ?? null,
      data.startsAt ?? null,
      data.endsAt ?? null,
      data.destination ?? null,
      data.ctaText ?? null,
      data.ctaLink ?? null,
      data.commercialModel ?? CampaignCommercialModel.OTHER,
      userId,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Partner campaign insert did not return a row');

  if (data.productDescriptions) {
    for (const description of data.productDescriptions) {
      const trimmed = description.trim();
      if (!trimmed) continue;
      await client.query(
        `INSERT INTO campaign_products (agency_id, campaign_id, product_description)
         VALUES ($1, $2, $3)`,
        [agencyId, row.id, trimmed],
      );
    }
  }

  await recordAuditEvent(client, {
    eventType: AuditEventType.PARTNER_CAMPAIGN_CREATED,
    entityType: 'PartnerCampaign',
    entityId: row.id,
    metadata: { name: row.name, partnerId: row.partner_id },
  });

  return toPartnerCampaign(row);
}

export async function transitionPartnerCampaignStatus(
  client: TenantTransactionClient,
  id: string,
  toStatus: PartnerCampaignStatus,
): Promise<PartnerCampaign> {
  const agencyId = getAgencyId();

  if (!Object.values(PartnerCampaignStatus).includes(toStatus)) {
    throw new ValidationError('Field "status" must be a valid PartnerCampaignStatus');
  }

  const current = await lockPartnerCampaign(client, agencyId, id);
  if (current.status === toStatus) {
    return current;
  }
  const allowed = PARTNER_CAMPAIGN_STATUS_TRANSITIONS[current.status] ?? [];
  if (!allowed.includes(toStatus)) {
    throw new ConflictError(`PartnerCampaign cannot transition from ${current.status} to ${toStatus}`);
  }

  const result = await client.query<PartnerCampaignRow>(
    `UPDATE partner_campaigns SET status = $3, updated_at = now()
     WHERE agency_id = $1 AND id = $2 RETURNING ${CAMPAIGN_COLUMNS}`,
    [agencyId, id, toStatus],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Partner campaign transition did not return a row');

  await recordAuditEvent(client, {
    eventType: AuditEventType.PARTNER_CAMPAIGN_STATUS_CHANGED,
    entityType: 'PartnerCampaign',
    entityId: row.id,
    metadata: { from: current.status, to: toStatus },
  });

  return toPartnerCampaign(row);
}

export async function listCampaignProducts(
  client: TenantTransactionClient,
  campaignId: string,
): Promise<CampaignProduct[]> {
  const agencyId = getAgencyId();
  await loadPartnerCampaign(client, agencyId, campaignId);
  const result = await client.query<{
    id: string;
    agency_id: string;
    campaign_id: string;
    product_description: string;
    created_at: string;
  }>(
    `SELECT id, agency_id, campaign_id, product_description, created_at
     FROM campaign_products WHERE agency_id = $1 AND campaign_id = $2 ORDER BY created_at ASC`,
    [agencyId, campaignId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    agencyId: row.agency_id,
    campaignId: row.campaign_id,
    productDescription: row.product_description,
    createdAt: row.created_at,
  }));
}

// ============================================================
// CampaignPlacement
// ============================================================

export async function createCampaignPlacement(
  client: TenantTransactionClient,
  campaignId: string,
  location: CampaignPlacementLocation,
): Promise<CampaignPlacement> {
  const agencyId = getAgencyId();
  await loadPartnerCampaign(client, agencyId, campaignId);

  if (!Object.values(CampaignPlacementLocation).includes(location)) {
    throw new ValidationError('Field "location" must be a valid CampaignPlacementLocation');
  }

  const result = await client.query<{
    id: string;
    agency_id: string;
    campaign_id: string;
    location: CampaignPlacementLocation;
    active: boolean;
    created_at: string;
  }>(
    `INSERT INTO campaign_placements (agency_id, campaign_id, location)
     VALUES ($1, $2, $3)
     ON CONFLICT (agency_id, campaign_id, location) DO UPDATE SET active = true
     RETURNING id, agency_id, campaign_id, location, active, created_at`,
    [agencyId, campaignId, location],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Placement insert did not return a row');

  await recordAuditEvent(client, {
    eventType: AuditEventType.CAMPAIGN_PLACEMENT_CREATED,
    entityType: 'CampaignPlacement',
    entityId: row.id,
    metadata: { campaignId, location },
  });

  return {
    id: row.id,
    agencyId: row.agency_id,
    campaignId: row.campaign_id,
    location: row.location,
    active: row.active,
    createdAt: row.created_at,
  };
}

export async function listCampaignPlacements(
  client: TenantTransactionClient,
  campaignId: string,
): Promise<CampaignPlacement[]> {
  const agencyId = getAgencyId();
  const result = await client.query<{
    id: string;
    agency_id: string;
    campaign_id: string;
    location: CampaignPlacementLocation;
    active: boolean;
    created_at: string;
  }>(
    `SELECT id, agency_id, campaign_id, location, active, created_at
     FROM campaign_placements WHERE agency_id = $1 AND campaign_id = $2 ORDER BY created_at ASC`,
    [agencyId, campaignId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    agencyId: row.agency_id,
    campaignId: row.campaign_id,
    location: row.location,
    active: row.active,
    createdAt: row.created_at,
  }));
}

// Server-side "what should currently be shown at this placement location"
// query -- used by staff/customer-facing surfaces to render a live
// placement. Only ACTIVE campaigns with an active placement at the given
// location, within their date window (when set), are eligible.
export async function listActiveCampaignsForLocation(
  client: TenantTransactionClient,
  location: CampaignPlacementLocation,
): Promise<Array<PartnerCampaign & { placementId: string }>> {
  const agencyId = getAgencyId();
  const result = await client.query<PartnerCampaignRow & { placement_id: string }>(
    `SELECT c.id, c.agency_id, c.partner_id, c.name, c.description, c.starts_at, c.ends_at,
            c.destination, c.cta_text, c.cta_link, c.commercial_model, c.status,
            c.created_by_user_id, c.created_at, c.updated_at, p.id AS placement_id
     FROM partner_campaigns c
     JOIN campaign_placements p ON p.campaign_id = c.id AND p.agency_id = c.agency_id
     WHERE c.agency_id = $1
       AND p.location = $2
       AND p.active
       AND c.status = 'ACTIVE'
       AND (c.starts_at IS NULL OR c.starts_at <= now())
       AND (c.ends_at IS NULL OR c.ends_at >= now())
     ORDER BY c.created_at DESC`,
    [agencyId, location],
  );
  return result.rows.map((row) => ({ ...toPartnerCampaign(row), placementId: row.placement_id }));
}

// ============================================================
// CampaignAttribution
// ============================================================

export interface RecordCampaignAttributionInput {
  campaignId: string;
  placementId: string;
  eventType: CampaignAttributionEventType;
  customerId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

// Server-recorded only. Never trust a client-supplied campaign/placement
// pair blindly -- validate the placement actually belongs to the campaign,
// is active, and both are in the current tenant (the composite FKs +
// RLS-scoped SELECT below enforce tenant isolation; the explicit
// campaign_id match enforces placement/campaign consistency).
export async function recordCampaignAttribution(
  client: TenantTransactionClient,
  input: RecordCampaignAttributionInput,
): Promise<void> {
  const agencyId = getAgencyId();

  if (!Object.values(CampaignAttributionEventType).includes(input.eventType)) {
    throw new ValidationError('Field "eventType" must be a valid CampaignAttributionEventType');
  }

  const placementResult = await client.query<{ id: string; campaign_id: string; active: boolean }>(
    `SELECT id, campaign_id, active FROM campaign_placements WHERE agency_id = $1 AND id = $2`,
    [agencyId, input.placementId],
  );
  const placement = placementResult.rows[0];
  if (!placement) {
    throw new NotFoundError('Campaign placement not found');
  }
  if (placement.campaign_id !== input.campaignId) {
    throw new ValidationError('placementId does not belong to campaignId');
  }
  if (!placement.active) {
    throw new ConflictError('Campaign placement is not active');
  }

  // Confirms the campaign is a real, currently-visible campaign in this
  // tenant (also guards against a stale/completed campaign being credited).
  await loadPartnerCampaign(client, agencyId, input.campaignId);

  await client.query(
    `INSERT INTO campaign_attributions
       (agency_id, campaign_id, placement_id, event_type, customer_id, user_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      agencyId,
      input.campaignId,
      input.placementId,
      input.eventType,
      input.customerId ?? null,
      input.userId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function getCampaignAttributionSummary(
  client: TenantTransactionClient,
  campaignId: string,
): Promise<CampaignAttributionSummary> {
  const agencyId = getAgencyId();
  await loadPartnerCampaign(client, agencyId, campaignId);

  const result = await client.query<{ event_type: CampaignAttributionEventType; count: string }>(
    `SELECT event_type, COUNT(*)::text AS count FROM campaign_attributions
     WHERE agency_id = $1 AND campaign_id = $2 GROUP BY event_type`,
    [agencyId, campaignId],
  );

  let impressions = 0;
  let clicks = 0;
  for (const row of result.rows) {
    if (row.event_type === CampaignAttributionEventType.IMPRESSION) impressions = Number(row.count);
    if (row.event_type === CampaignAttributionEventType.CLICK) clicks = Number(row.count);
  }

  return { campaignId, impressions, clicks };
}

// ============================================================
// Internal helpers
// ============================================================

async function loadPartnerCampaign(
  client: TenantTransactionClient,
  agencyId: string,
  id: string,
): Promise<PartnerCampaign> {
  const result = await client.query<PartnerCampaignRow>(
    `SELECT ${CAMPAIGN_COLUMNS} FROM partner_campaigns WHERE agency_id = $1 AND id = $2`,
    [agencyId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Partner campaign not found');
  return toPartnerCampaign(row);
}

async function lockPartnerCampaign(
  client: TenantTransactionClient,
  agencyId: string,
  id: string,
): Promise<PartnerCampaign> {
  const result = await client.query<PartnerCampaignRow>(
    `SELECT ${CAMPAIGN_COLUMNS} FROM partner_campaigns WHERE agency_id = $1 AND id = $2 FOR UPDATE`,
    [agencyId, id],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Partner campaign not found');
  return toPartnerCampaign(row);
}

function validateCreatePartnerCampaignInput(data: CreatePartnerCampaignInput): void {
  if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    throw new ValidationError('Field "name" is required');
  }
  if (typeof data.partnerId !== 'string' || data.partnerId.trim().length === 0) {
    throw new ValidationError('Field "partnerId" is required');
  }
  if (
    data.commercialModel !== undefined &&
    !Object.values(CampaignCommercialModel).includes(data.commercialModel)
  ) {
    throw new ValidationError('Field "commercialModel" must be a valid CampaignCommercialModel');
  }
  if (data.startsAt && data.endsAt && data.startsAt > data.endsAt) {
    throw new ValidationError('Field "startsAt" must not be after "endsAt"');
  }
}

function toPartnerCampaign(row: PartnerCampaignRow): PartnerCampaign {
  return {
    id: row.id,
    agencyId: row.agency_id,
    partnerId: row.partner_id,
    name: row.name,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    destination: row.destination,
    ctaText: row.cta_text,
    ctaLink: row.cta_link,
    commercialModel: row.commercial_model,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
