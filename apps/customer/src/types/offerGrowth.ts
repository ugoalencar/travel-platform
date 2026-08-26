import type { Offer } from './offer';

export type AssetType = 'IMAGE' | 'VIDEO' | 'LOGO' | 'ICON' | 'DOCUMENT';
export type AssetSourceType =
  | 'PESCADOR'
  | 'UPLOAD'
  | 'AGENCY_LIBRARY'
  | 'SUPPLIER'
  | 'GENERATED'
  | 'EXTERNAL_CONNECTOR';
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'FINISHED' | 'CANCELLED';
export type PublicationStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'CANCELLED'
  | 'ARCHIVED';
export type PlatformFeature =
  | 'CREATIVE_STUDIO'
  | 'CAMPAIGNS'
  | 'SOCIAL_PUBLISHING'
  | 'SOCIAL_AUTOMATION'
  | 'COUPONS'
  | 'ANALYTICS';
export type AutomationTrigger = 'COMMENT_KEYWORD' | 'DIRECT_MESSAGE_KEYWORD';
export type AutomationStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type CouponType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'BENEFIT';

export interface Asset {
  id: string;
  agencyId: string;
  type: AssetType;
  source: AssetSourceType;
  sourceConnector?: string;
  sourceSupplier?: string;
  sourceOriginalUrl?: string;
  sourceLicense?: string;
  sourceAuthor?: string;
  sourceDedupeHash?: string;
  sourceUsageRestrictions?: string;
  sourceCaptureId?: string;
  metaWidth?: number;
  metaHeight?: number;
  metaMimeType?: string;
  metaTags: string[];
  metaVariants: unknown[];
  storageUrl?: string;
  localReference?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssetInput {
  type: AssetType;
  source: AssetSourceType;
  storageUrl?: string;
  localReference?: string;
  sourceCaptureId?: string;
  sourceOriginalUrl?: string;
  sourceLicense?: string;
  sourceAuthor?: string;
  metaTags?: string[];
}

export interface Campaign {
  id: string;
  agencyId: string;
  name: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  publicationStartsAt?: string;
  publicationEndsAt?: string;
  timezone: string;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignInput {
  name: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  publicationStartsAt?: string;
  publicationEndsAt?: string;
  timezone?: string;
  offerIds?: string[];
}

export interface Publication {
  id: string;
  agencyId: string;
  campaignId: string;
  offerId: string;
  creativeTemplateId?: string;
  channel: string;
  snapshot?: Record<string, unknown>;
  snapshotGeneratedAt?: string;
  scheduledAt?: string;
  publishedAt?: string;
  status: PublicationStatus;
  externalPublicationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePublicationInput {
  campaignId: string;
  offerId: string;
  channel: string;
  creativeTemplateId?: string;
  scheduledAt?: string;
}

export type AutomationAction =
  | { type: 'PUBLIC_REPLY'; message: string }
  | { type: 'PRIVATE_MESSAGE'; message: string }
  | {
      type: 'CREATE_COUPON';
      couponTemplate: {
        name: string;
        type: CouponType;
        value?: number;
        benefitDescription?: string;
        expiresInDays?: number;
        maxUses?: number;
        maxUsesPerCustomer?: number;
      };
    }
  | { type: 'SEND_COUPON'; couponId?: string; deliveryChannel?: string }
  | { type: 'CREATE_OPPORTUNITY'; pipelineId?: string; stageId?: string };

export interface Automation {
  id: string;
  agencyId: string;
  name: string;
  trigger: AutomationTrigger;
  status: AutomationStatus;
  channel?: string;
  campaignId?: string;
  publicationId?: string;
  keyword?: string;
  caseSensitive: boolean;
  actions: AutomationAction[];
  cooldownSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAutomationInput {
  name: string;
  trigger: AutomationTrigger;
  channel?: string;
  campaignId?: string;
  publicationId?: string;
  keyword?: string;
  caseSensitive?: boolean;
  actions: AutomationAction[];
  cooldownSeconds?: number;
}

export interface Coupon {
  id: string;
  agencyId: string;
  code: string;
  name: string;
  type: CouponType;
  value?: number;
  benefitDescription?: string;
  maxUses?: number;
  maxUsesPerCustomer?: number;
  campaignId?: string;
  offerId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCouponInput {
  code: string;
  name: string;
  type: CouponType;
  value?: number;
  benefitDescription?: string;
  maxUses?: number;
  maxUsesPerCustomer?: number;
  campaignId?: string;
  offerId?: string;
}

export interface AgencyEntitlement {
  feature: PlatformFeature;
  enabled: boolean;
  limits: Record<string, unknown>;
}

export interface AutomationExecutionOutcome {
  automationId: string;
  deduped: boolean;
  skippedReason?: string;
  executionId?: string;
  createdOpportunityId?: string;
  createdCouponId?: string;
}

export interface SimulateInternalCommentInput {
  channel: string;
  externalEventId?: string;
  externalUserId: string;
  content: string;
  campaignId?: string;
  publicationId?: string;
  offerId?: string;
}

export interface SimulatedEngagementResult {
  engagementId: string;
  executions: AutomationExecutionOutcome[];
}

export type CreativeBindingKind =
  | 'TITLE'
  | 'TEXT'
  | 'IMAGE'
  | 'PRICE'
  | 'PAYMENT'
  | 'LIST'
  | 'TABLE'
  | 'GRID'
  | 'CTA'
  | 'LOGO'
  | 'BADGE'
  | 'DIVIDER';

export interface CreativeBinding {
  key: string;
  kind: CreativeBindingKind;
  value: string;
  source: 'offer' | 'asset' | 'brand' | 'manual';
}

export interface CreativeBlock {
  id: string;
  kind: CreativeBindingKind;
  label: string;
  bindingKey: string;
}

export interface CreativePage {
  id: string;
  title: string;
  blocks: CreativeBlock[];
}

export interface CreativeTemplate {
  id: string;
  name: string;
  channel: string;
  pages: CreativePage[];
  bindings: CreativeBinding[];
  updatedAt: string;
}

export interface CancunDemoState {
  offer?: Offer;
  campaign?: Campaign;
  publication?: Publication;
  automation?: Automation;
  coupon?: Coupon;
  simulation?: SimulatedEngagementResult;
  duplicateSimulation?: SimulatedEngagementResult;
}
