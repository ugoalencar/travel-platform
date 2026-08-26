-- ============================================================
-- Offer & Growth Engine Foundation V1
-- Batch 04 backend foundation (no Creative Studio visual editor).
-- Additive-only. Implements: Asset, Campaign, Publication,
-- PlatformFeature/AgencyEntitlement, Engagement, Automation +
-- AutomationExecution (dedup), Coupon/CouponGrant/CouponRedemption,
-- CommercialOpportunity attribution columns, OfferGrowthAuditLog.
--
-- Follows the exact tenant pattern from 002_rls_policies.sql and
-- 013_pescador_foundation.sql: agency_id NOT NULL, @@unique(agency_id, id)
-- equivalent (UNIQUE (agency_id, id)), tenant-safe composite FKs,
-- ENABLE + FORCE ROW LEVEL SECURITY, 4-policy (select/insert/update/delete)
-- pattern using current_agency_id().
-- ============================================================

-- ============================================================
-- ASSET
-- ============================================================

CREATE TYPE "AssetType" AS ENUM ('IMAGE', 'VIDEO', 'LOGO', 'ICON', 'DOCUMENT');

CREATE TYPE "AssetSourceType" AS ENUM (
  'PESCADOR', 'UPLOAD', 'AGENCY_LIBRARY', 'SUPPLIER', 'GENERATED', 'EXTERNAL_CONNECTOR'
);

CREATE TABLE assets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  type "AssetType" NOT NULL,
  source "AssetSourceType" NOT NULL,

  -- AssetSource fields
  source_connector TEXT,
  source_supplier TEXT,
  source_original_url TEXT,
  source_license TEXT,
  source_author TEXT,
  source_dedupe_hash TEXT,
  source_usage_restrictions TEXT,
  -- Provenance back-reference when source = PESCADOR
  source_capture_id TEXT,

  -- AssetMetadata fields
  meta_width INTEGER,
  meta_height INTEGER,
  meta_duration_seconds NUMERIC(10, 2),
  meta_mime_type TEXT,
  meta_size_bytes BIGINT,
  meta_language TEXT,
  meta_tags JSONB NOT NULL DEFAULT '[]'::JSONB,
  meta_safe_area JSONB,
  meta_variants JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- V1 storage: URL-based only (external URL and/or local reference). No
  -- new cloud storage integration in this batch.
  storage_url TEXT,
  local_reference TEXT,

  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT assets_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT assets_created_by_user_tenant_fk
    FOREIGN KEY (agency_id, created_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT assets_source_capture_tenant_fk
    FOREIGN KEY (agency_id, source_capture_id) REFERENCES external_offer_captures (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT assets_storage_present_check
    CHECK (storage_url IS NOT NULL OR local_reference IS NOT NULL),
  CONSTRAINT assets_pescador_source_check
    CHECK (source <> 'PESCADOR' OR source_capture_id IS NOT NULL),
  CONSTRAINT assets_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX assets_agency_type_idx ON assets (agency_id, type);
CREATE INDEX assets_agency_source_idx ON assets (agency_id, source);
CREATE INDEX assets_agency_dedupe_hash_idx ON assets (agency_id, source_dedupe_hash);
CREATE INDEX assets_agency_capture_idx ON assets (agency_id, source_capture_id);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets FORCE ROW LEVEL SECURITY;

CREATE POLICY assets_select_tenant ON assets
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY assets_insert_tenant ON assets
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY assets_update_tenant ON assets
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY assets_delete_tenant ON assets
  FOR DELETE USING (agency_id = current_agency_id());

-- ============================================================
-- CAMPAIGN
-- ============================================================

CREATE TYPE "CampaignStatus" AS ENUM (
  'DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'FINISHED', 'CANCELLED'
);

CREATE TABLE campaigns (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  publication_starts_at TIMESTAMPTZ,
  publication_ends_at TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT campaigns_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT campaigns_created_by_user_tenant_fk
    FOREIGN KEY (agency_id, created_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT campaigns_name_not_blank_check CHECK (length(trim(name)) > 0),
  CONSTRAINT campaigns_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX campaigns_agency_status_idx ON campaigns (agency_id, status);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns FORCE ROW LEVEL SECURITY;

CREATE POLICY campaigns_select_tenant ON campaigns
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY campaigns_insert_tenant ON campaigns
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY campaigns_update_tenant ON campaigns
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY campaigns_delete_tenant ON campaigns
  FOR DELETE USING (agency_id = current_agency_id());

-- Campaign <-> Offer many-to-many (a Campaign can contain offers; an Offer
-- can appear in multiple campaigns).
CREATE TABLE campaign_offers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT campaign_offers_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT campaign_offers_campaign_tenant_fk
    FOREIGN KEY (agency_id, campaign_id) REFERENCES campaigns (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT campaign_offers_offer_tenant_fk
    FOREIGN KEY (agency_id, offer_id) REFERENCES offers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT campaign_offers_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT campaign_offers_unique UNIQUE (agency_id, campaign_id, offer_id)
);

CREATE INDEX campaign_offers_agency_campaign_idx ON campaign_offers (agency_id, campaign_id);
CREATE INDEX campaign_offers_agency_offer_idx ON campaign_offers (agency_id, offer_id);

ALTER TABLE campaign_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_offers FORCE ROW LEVEL SECURITY;

CREATE POLICY campaign_offers_select_tenant ON campaign_offers
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY campaign_offers_insert_tenant ON campaign_offers
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY campaign_offers_update_tenant ON campaign_offers
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY campaign_offers_delete_tenant ON campaign_offers
  FOR DELETE USING (agency_id = current_agency_id());

-- ============================================================
-- PUBLICATION
-- ============================================================

CREATE TYPE "PublicationStatus" AS ENUM (
  'DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED', 'ARCHIVED'
);

CREATE TABLE publications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  -- Creative Studio's real template model does not exist yet. Plain
  -- nullable reference id only -- never invent a template entity here.
  creative_template_id TEXT,
  channel TEXT NOT NULL,
  -- Immutable snapshot captured at generation time: resolved content,
  -- assets, price, text. Never re-derived from a later Offer edit; the
  -- application layer must treat this column as write-once (see
  -- publications.ts).
  snapshot JSONB,
  snapshot_generated_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  status "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
  external_publication_id TEXT,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT publications_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT publications_campaign_tenant_fk
    FOREIGN KEY (agency_id, campaign_id) REFERENCES campaigns (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT publications_offer_tenant_fk
    FOREIGN KEY (agency_id, offer_id) REFERENCES offers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT publications_created_by_user_tenant_fk
    FOREIGN KEY (agency_id, created_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT publications_channel_not_blank_check CHECK (length(trim(channel)) > 0),
  CONSTRAINT publications_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX publications_agency_status_idx ON publications (agency_id, status);
CREATE INDEX publications_agency_campaign_idx ON publications (agency_id, campaign_id);
CREATE INDEX publications_agency_offer_idx ON publications (agency_id, offer_id);
CREATE INDEX publications_agency_channel_idx ON publications (agency_id, channel);

ALTER TABLE publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE publications FORCE ROW LEVEL SECURITY;

CREATE POLICY publications_select_tenant ON publications
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY publications_insert_tenant ON publications
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY publications_update_tenant ON publications
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY publications_delete_tenant ON publications
  FOR DELETE USING (agency_id = current_agency_id());

-- ============================================================
-- ENTITLEMENTS (platform layer)
-- ============================================================

CREATE TYPE "PlatformFeature" AS ENUM (
  'PESCADOR', 'CREATIVE_STUDIO', 'CAMPAIGNS', 'SOCIAL_PUBLISHING', 'SOCIAL_AUTOMATION',
  -- Inert placeholders, not wired to any capability in this batch.
  'WHATSAPP', 'AI_ASSISTANT', 'ADVANCED_ANALYTICS', 'GDS'
);

-- No AgencyEntitlement row for a (agency, feature) pair means "not
-- entitled" (fail closed), matching security.md's fail-closed rule.
CREATE TABLE agency_entitlements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  feature "PlatformFeature" NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  limits JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Free-text identity of the platform-scoped actor who last wrote this
  -- row. Not a `users` FK: entitlement writes happen through the narrow
  -- platform stopgap path (see entitlements.ts), which is deliberately
  -- outside the normal agency user/role system.
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT agency_entitlements_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT agency_entitlements_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT agency_entitlements_unique UNIQUE (agency_id, feature)
);

CREATE INDEX agency_entitlements_agency_feature_idx ON agency_entitlements (agency_id, feature);

ALTER TABLE agency_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_entitlements FORCE ROW LEVEL SECURITY;

-- Entitlements are still tenant-owned rows (readable only by their own
-- agency) even though writes go through a separate platform-scoped code
-- path. RLS still applies the same 4-policy tenant pattern; the
-- write-side self-grant protection is enforced in application code
-- (entitlements.ts), because RLS alone cannot distinguish "platform
-- stopgap caller" from "ordinary agency caller" -- both run with the
-- same current_agency_id() for a given request.
CREATE POLICY agency_entitlements_select_tenant ON agency_entitlements
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY agency_entitlements_insert_tenant ON agency_entitlements
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY agency_entitlements_update_tenant ON agency_entitlements
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY agency_entitlements_delete_tenant ON agency_entitlements
  FOR DELETE USING (agency_id = current_agency_id());

-- ============================================================
-- ENGAGEMENT
-- ============================================================

CREATE TYPE "EngagementType" AS ENUM ('COMMENT', 'MESSAGE', 'CLICK', 'FORM', 'QR', 'COUPON_REQUEST');

CREATE TABLE engagements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  type "EngagementType" NOT NULL,
  channel TEXT NOT NULL,
  campaign_id TEXT,
  publication_id TEXT,
  offer_id TEXT,
  -- Opaque external-id string from the channel. Never trusted as an
  -- internal identity -- only ever compared/stored as opaque data.
  external_user_id TEXT,
  customer_id TEXT,
  opportunity_id TEXT,
  content TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT engagements_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT engagements_campaign_tenant_fk
    FOREIGN KEY (agency_id, campaign_id) REFERENCES campaigns (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT engagements_publication_tenant_fk
    FOREIGN KEY (agency_id, publication_id) REFERENCES publications (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT engagements_offer_tenant_fk
    FOREIGN KEY (agency_id, offer_id) REFERENCES offers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT engagements_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT engagements_channel_not_blank_check CHECK (length(trim(channel)) > 0),
  CONSTRAINT engagements_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX engagements_agency_campaign_idx ON engagements (agency_id, campaign_id);
CREATE INDEX engagements_agency_publication_idx ON engagements (agency_id, publication_id);
CREATE INDEX engagements_agency_type_idx ON engagements (agency_id, type);
CREATE INDEX engagements_agency_external_user_idx ON engagements (agency_id, external_user_id);

ALTER TABLE engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagements FORCE ROW LEVEL SECURITY;

CREATE POLICY engagements_select_tenant ON engagements
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY engagements_insert_tenant ON engagements
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY engagements_update_tenant ON engagements
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY engagements_delete_tenant ON engagements
  FOR DELETE USING (agency_id = current_agency_id());

-- ============================================================
-- AUTOMATION
-- ============================================================

CREATE TYPE "AutomationTrigger" AS ENUM (
  'COMMENT_KEYWORD', 'DIRECT_MESSAGE_KEYWORD',
  -- Inert placeholders, not evaluated by the V1 engine.
  'FORM_SUBMITTED', 'LINK_CLICKED', 'QR_SCANNED', 'COUPON_REQUESTED'
);

CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

CREATE TABLE automations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger "AutomationTrigger" NOT NULL,
  status "AutomationStatus" NOT NULL DEFAULT 'DRAFT',

  -- Conditions
  channel TEXT,
  campaign_id TEXT,
  publication_id TEXT,
  keyword TEXT,
  case_sensitive BOOLEAN NOT NULL DEFAULT FALSE,

  -- Actions: array of typed action objects, e.g.
  -- [{"type":"PUBLIC_REPLY","message":"..."},
  --  {"type":"CREATE_COUPON","couponId":"..."}]
  actions JSONB NOT NULL DEFAULT '[]'::JSONB,

  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  cooldown_seconds INTEGER NOT NULL DEFAULT 0,
  max_executions INTEGER,
  max_executions_per_external_user INTEGER,

  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT automations_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT automations_campaign_tenant_fk
    FOREIGN KEY (agency_id, campaign_id) REFERENCES campaigns (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT automations_publication_tenant_fk
    FOREIGN KEY (agency_id, publication_id) REFERENCES publications (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT automations_created_by_user_tenant_fk
    FOREIGN KEY (agency_id, created_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT automations_name_not_blank_check CHECK (length(trim(name)) > 0),
  CONSTRAINT automations_cooldown_non_negative_check CHECK (cooldown_seconds >= 0),
  CONSTRAINT automations_max_executions_positive_check CHECK (max_executions IS NULL OR max_executions > 0),
  CONSTRAINT automations_max_executions_per_user_positive_check
    CHECK (max_executions_per_external_user IS NULL OR max_executions_per_external_user > 0),
  CONSTRAINT automations_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX automations_agency_status_idx ON automations (agency_id, status);
CREATE INDEX automations_agency_campaign_idx ON automations (agency_id, campaign_id);
CREATE INDEX automations_agency_trigger_idx ON automations (agency_id, trigger);

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations FORCE ROW LEVEL SECURITY;

CREATE POLICY automations_select_tenant ON automations
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY automations_insert_tenant ON automations
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY automations_update_tenant ON automations
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY automations_delete_tenant ON automations
  FOR DELETE USING (agency_id = current_agency_id());

-- ------------------------------------------------------------
-- AUTOMATION EXECUTION (dedup)
-- ------------------------------------------------------------
-- Structural dedup: the exact key from automation-engine.md --
-- agencyId + automationId + channel + externalUserId + normalizedKeyword
-- + publicationId -- is enforced by a real UNIQUE constraint, not just an
-- application-level check, so concurrent duplicate webhook deliveries are
-- structurally impossible to double-process (same discipline as the
-- Field Operations checkpoint TOCTOU fix: WHERE ... IS NULL / unique
-- constraint guard, insert-and-catch-23505 rather than check-then-insert).
-- publication_id/external_user_id can legitimately be NULL for some
-- triggers; NULL is coalesced to a sentinel so the UNIQUE constraint
-- still applies uniformly (Postgres treats NULL <> NULL, so a raw NULL
-- column would NOT be deduped by a UNIQUE constraint).

CREATE TABLE automation_executions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  automation_id TEXT NOT NULL,
  engagement_id TEXT,
  channel TEXT NOT NULL,
  external_user_id TEXT NOT NULL DEFAULT '__none__',
  normalized_keyword TEXT NOT NULL DEFAULT '__none__',
  publication_id TEXT NOT NULL DEFAULT '__none__',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  result JSONB,

  CONSTRAINT automation_executions_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT automation_executions_automation_tenant_fk
    FOREIGN KEY (agency_id, automation_id) REFERENCES automations (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT automation_executions_engagement_tenant_fk
    FOREIGN KEY (agency_id, engagement_id) REFERENCES engagements (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT automation_executions_agency_id_key UNIQUE (agency_id, id),
  -- The dedup key itself, structurally enforced.
  CONSTRAINT automation_executions_dedup_key UNIQUE (
    agency_id, automation_id, channel, external_user_id, normalized_keyword, publication_id
  )
);

CREATE INDEX automation_executions_agency_automation_idx ON automation_executions (agency_id, automation_id);
CREATE INDEX automation_executions_agency_external_user_idx ON automation_executions (agency_id, external_user_id);

ALTER TABLE automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_executions FORCE ROW LEVEL SECURITY;

CREATE POLICY automation_executions_select_tenant ON automation_executions
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY automation_executions_insert_tenant ON automation_executions
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY automation_executions_update_tenant ON automation_executions
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY automation_executions_delete_tenant ON automation_executions
  FOR DELETE USING (agency_id = current_agency_id());

-- ============================================================
-- COUPON
-- ============================================================

CREATE TYPE "CouponType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE', 'BENEFIT');
CREATE TYPE "CouponGrantStatus" AS ENUM ('ISSUED', 'DELIVERED', 'REDEEMED', 'EXPIRED', 'REVOKED');

CREATE TABLE coupons (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type "CouponType" NOT NULL,
  value NUMERIC(10, 2),
  benefit_description TEXT,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  max_uses_per_customer INTEGER,
  campaign_id TEXT,
  offer_id TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT coupons_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupons_campaign_tenant_fk
    FOREIGN KEY (agency_id, campaign_id) REFERENCES campaigns (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupons_offer_tenant_fk
    FOREIGN KEY (agency_id, offer_id) REFERENCES offers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupons_created_by_user_tenant_fk
    FOREIGN KEY (agency_id, created_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupons_code_not_blank_check CHECK (length(trim(code)) > 0),
  CONSTRAINT coupons_value_check
    CHECK (type = 'BENEFIT' OR (value IS NOT NULL AND value >= 0)),
  CONSTRAINT coupons_max_uses_positive_check CHECK (max_uses IS NULL OR max_uses > 0),
  CONSTRAINT coupons_max_uses_per_customer_positive_check
    CHECK (max_uses_per_customer IS NULL OR max_uses_per_customer > 0),
  CONSTRAINT coupons_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT coupons_agency_code_key UNIQUE (agency_id, code)
);

CREATE INDEX coupons_agency_active_idx ON coupons (agency_id, active);
CREATE INDEX coupons_agency_campaign_idx ON coupons (agency_id, campaign_id);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons FORCE ROW LEVEL SECURITY;

CREATE POLICY coupons_select_tenant ON coupons
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY coupons_insert_tenant ON coupons
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY coupons_update_tenant ON coupons
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY coupons_delete_tenant ON coupons
  FOR DELETE USING (agency_id = current_agency_id());

CREATE TABLE coupon_grants (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  coupon_id TEXT NOT NULL,
  campaign_id TEXT,
  publication_id TEXT,
  automation_id TEXT,
  customer_id TEXT,
  external_user_id TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  delivery_channel TEXT,
  status "CouponGrantStatus" NOT NULL DEFAULT 'ISSUED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT coupon_grants_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupon_grants_coupon_tenant_fk
    FOREIGN KEY (agency_id, coupon_id) REFERENCES coupons (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupon_grants_campaign_tenant_fk
    FOREIGN KEY (agency_id, campaign_id) REFERENCES campaigns (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupon_grants_publication_tenant_fk
    FOREIGN KEY (agency_id, publication_id) REFERENCES publications (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupon_grants_automation_tenant_fk
    FOREIGN KEY (agency_id, automation_id) REFERENCES automations (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupon_grants_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupon_grants_recipient_check
    CHECK (customer_id IS NOT NULL OR external_user_id IS NOT NULL),
  CONSTRAINT coupon_grants_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX coupon_grants_agency_coupon_idx ON coupon_grants (agency_id, coupon_id);
CREATE INDEX coupon_grants_agency_status_idx ON coupon_grants (agency_id, status);
CREATE INDEX coupon_grants_agency_external_user_idx ON coupon_grants (agency_id, external_user_id);

ALTER TABLE coupon_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_grants FORCE ROW LEVEL SECURITY;

CREATE POLICY coupon_grants_select_tenant ON coupon_grants
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY coupon_grants_insert_tenant ON coupon_grants
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY coupon_grants_update_tenant ON coupon_grants
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY coupon_grants_delete_tenant ON coupon_grants
  FOR DELETE USING (agency_id = current_agency_id());

CREATE TABLE coupon_redemptions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  coupon_id TEXT NOT NULL,
  grant_id TEXT,
  customer_id TEXT NOT NULL,
  proposal_id TEXT,
  sale_id TEXT,
  amount_applied NUMERIC(10, 2),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at TIMESTAMPTZ,
  recorded_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT coupon_redemptions_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupon_redemptions_coupon_tenant_fk
    FOREIGN KEY (agency_id, coupon_id) REFERENCES coupons (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupon_redemptions_grant_tenant_fk
    FOREIGN KEY (agency_id, grant_id) REFERENCES coupon_grants (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupon_redemptions_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupon_redemptions_proposal_tenant_fk
    FOREIGN KEY (agency_id, proposal_id) REFERENCES proposals (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupon_redemptions_sale_tenant_fk
    FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupon_redemptions_recorded_by_user_tenant_fk
    FOREIGN KEY (agency_id, recorded_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT coupon_redemptions_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX coupon_redemptions_agency_coupon_idx ON coupon_redemptions (agency_id, coupon_id);
CREATE INDEX coupon_redemptions_agency_customer_idx ON coupon_redemptions (agency_id, customer_id);

ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions FORCE ROW LEVEL SECURITY;

CREATE POLICY coupon_redemptions_select_tenant ON coupon_redemptions
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY coupon_redemptions_insert_tenant ON coupon_redemptions
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY coupon_redemptions_update_tenant ON coupon_redemptions
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY coupon_redemptions_delete_tenant ON coupon_redemptions
  FOR DELETE USING (agency_id = current_agency_id());

-- ============================================================
-- CONNECTOR ACTION OUTBOX (real record for PUBLIC_REPLY/PRIVATE_MESSAGE
-- actions routed through a Channel Connector -- never a fake send).
-- ============================================================

CREATE TYPE "ConnectorActionType" AS ENUM ('PUBLIC_REPLY', 'PRIVATE_MESSAGE', 'PUBLISH', 'UPDATE_PUBLICATION');
CREATE TYPE "ConnectorActionStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE connector_actions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  type "ConnectorActionType" NOT NULL,
  automation_id TEXT,
  publication_id TEXT,
  engagement_id TEXT,
  external_user_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status "ConnectorActionStatus" NOT NULL DEFAULT 'PENDING',
  external_ref TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,

  CONSTRAINT connector_actions_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT connector_actions_automation_tenant_fk
    FOREIGN KEY (agency_id, automation_id) REFERENCES automations (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT connector_actions_publication_tenant_fk
    FOREIGN KEY (agency_id, publication_id) REFERENCES publications (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT connector_actions_engagement_tenant_fk
    FOREIGN KEY (agency_id, engagement_id) REFERENCES engagements (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT connector_actions_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX connector_actions_agency_status_idx ON connector_actions (agency_id, status);
CREATE INDEX connector_actions_agency_automation_idx ON connector_actions (agency_id, automation_id);

ALTER TABLE connector_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_actions FORCE ROW LEVEL SECURITY;

CREATE POLICY connector_actions_select_tenant ON connector_actions
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY connector_actions_insert_tenant ON connector_actions
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY connector_actions_update_tenant ON connector_actions
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY connector_actions_delete_tenant ON connector_actions
  FOR DELETE USING (agency_id = current_agency_id());

-- ============================================================
-- AUDIT LOG (append-only, no event sourcing)
-- ============================================================

CREATE TABLE offer_growth_audit_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT offer_growth_audit_log_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT offer_growth_audit_log_actor_user_tenant_fk
    FOREIGN KEY (agency_id, actor_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT offer_growth_audit_log_action_not_blank_check CHECK (length(trim(action)) > 0),
  CONSTRAINT offer_growth_audit_log_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX offer_growth_audit_log_agency_action_idx ON offer_growth_audit_log (agency_id, action, created_at);
CREATE INDEX offer_growth_audit_log_agency_entity_idx ON offer_growth_audit_log (agency_id, entity_type, entity_id);

ALTER TABLE offer_growth_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_growth_audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY offer_growth_audit_log_select_tenant ON offer_growth_audit_log
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY offer_growth_audit_log_insert_tenant ON offer_growth_audit_log
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
-- Append-only: no UPDATE/DELETE policy is created, so those operations
-- are denied by RLS default-deny even for the tenant that owns the rows.

-- ============================================================
-- COMMERCIAL OPPORTUNITY ATTRIBUTION (additive columns only; never
-- touches existing Opportunity semantics/columns).
-- ============================================================

ALTER TABLE commercial_opportunities
  ADD COLUMN source_channel TEXT,
  ADD COLUMN campaign_id TEXT,
  ADD COLUMN publication_id TEXT,
  ADD COLUMN offer_id TEXT,
  ADD COLUMN automation_id TEXT;

ALTER TABLE commercial_opportunities
  ADD CONSTRAINT commercial_opportunities_campaign_tenant_fk
    FOREIGN KEY (agency_id, campaign_id) REFERENCES campaigns (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT commercial_opportunities_publication_tenant_fk
    FOREIGN KEY (agency_id, publication_id) REFERENCES publications (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT commercial_opportunities_offer_tenant_fk
    FOREIGN KEY (agency_id, offer_id) REFERENCES offers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT commercial_opportunities_automation_tenant_fk
    FOREIGN KEY (agency_id, automation_id) REFERENCES automations (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX commercial_opportunities_agency_campaign_idx ON commercial_opportunities (agency_id, campaign_id);
CREATE INDEX commercial_opportunities_agency_publication_idx ON commercial_opportunities (agency_id, publication_id);

-- Dedup guard for automation-created opportunities: at most one
-- opportunity per (agency, automation, publication, external source)
-- when created by an automation execution. We reuse the
-- automation_executions unique key as the actual dedup boundary (an
-- execution row is inserted before CREATE_OPPORTUNITY runs), so no
-- additional unique constraint is required here -- see automations.ts.

-- ============================================================
-- Engagement -> opportunity FK (added after commercial_opportunities
-- attribution columns exist).
-- ============================================================

ALTER TABLE engagements
  ADD CONSTRAINT engagements_opportunity_tenant_fk
    FOREIGN KEY (agency_id, opportunity_id) REFERENCES commercial_opportunities (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
