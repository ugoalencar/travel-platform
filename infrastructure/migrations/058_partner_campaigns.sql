-- Migration: Partner Campaigns (Agent 10)
-- Purpose: Campaigns run BY an external commercial partner (advertiser),
-- attributed to that partner, placed across app surfaces.
--
-- IMPORTANT -- this is a DIFFERENT concept from the existing `campaigns`
-- table (see services/api/src/campaigns.ts), which is the agency's own
-- internal "offer growth" marketing campaigns. Do not confuse the two;
-- neither that file nor that table is touched by this migration.
--
-- FK note: `partner_id` below references a local `campaign_partner_stubs`
-- table rather than a real CommercialPartner table, because Agent 04
-- (feature/mega-partners) has not landed in this worktree/branch. When
-- that branch merges and a real `commercial_partners` table exists,
-- reconcile by migrating `campaign_partner_stubs` rows into it and
-- repointing the `partner_campaigns_partner_tenant_fk` constraint.
-- Created: 2026-09-11

DO $$ BEGIN
  CREATE TYPE partner_campaign_status AS ENUM (
    'DRAFT',
    'ACTIVE',
    'PAUSED',
    'COMPLETED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE partner_campaign_commercial_model AS ENUM (
    'CPA',
    'FLAT_FEE',
    'REVENUE_SHARE',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE campaign_placement_location AS ENUM (
    'STAFF_DASHBOARD',
    'PROPOSAL',
    'TRIP',
    'CUSTOMER_PORTAL',
    'CATALOG'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE campaign_attribution_event_type AS ENUM (
    'IMPRESSION',
    'CLICK'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Lightweight local stand-in for Agent 04's CommercialPartner. Tenant-scoped,
-- minimal (id + name), so PartnerCampaign tests in this worktree are
-- independently runnable without depending on feature/mega-partners.
CREATE TABLE IF NOT EXISTS campaign_partner_stubs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT campaign_partner_stubs_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT campaign_partner_stubs_agency_id_key UNIQUE (agency_id, id)
);

ALTER TABLE campaign_partner_stubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_partner_stubs FORCE ROW LEVEL SECURITY;

CREATE POLICY campaign_partner_stubs_select_tenant ON campaign_partner_stubs
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY campaign_partner_stubs_insert_tenant ON campaign_partner_stubs
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY campaign_partner_stubs_update_tenant ON campaign_partner_stubs
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY campaign_partner_stubs_delete_tenant ON campaign_partner_stubs
  FOR DELETE USING (agency_id = current_agency_id());

-- PartnerCampaign
CREATE TABLE IF NOT EXISTS partner_campaigns (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  partner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  destination TEXT,
  cta_text TEXT,
  cta_link TEXT,
  commercial_model partner_campaign_commercial_model NOT NULL DEFAULT 'OTHER',
  status partner_campaign_status NOT NULL DEFAULT 'DRAFT',
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT partner_campaigns_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_campaigns_partner_tenant_fk
    FOREIGN KEY (agency_id, partner_id) REFERENCES campaign_partner_stubs (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT partner_campaigns_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT partner_campaigns_period_check
    CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at <= ends_at)
);

CREATE INDEX partner_campaigns_agency_status_idx ON partner_campaigns (agency_id, status);

ALTER TABLE partner_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_campaigns FORCE ROW LEVEL SECURITY;

CREATE POLICY partner_campaigns_select_tenant ON partner_campaigns
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY partner_campaigns_insert_tenant ON partner_campaigns
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY partner_campaigns_update_tenant ON partner_campaigns
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY partner_campaigns_delete_tenant ON partner_campaigns
  FOR DELETE USING (agency_id = current_agency_id());

-- CampaignProduct: free-text product/offer description this campaign
-- promotes. Agent 07's TravelProduct catalog does not exist in this
-- worktree (separate branch); a real FK is a future reconciliation item.
CREATE TABLE IF NOT EXISTS campaign_products (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  product_description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT campaign_products_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT campaign_products_campaign_tenant_fk
    FOREIGN KEY (agency_id, campaign_id) REFERENCES partner_campaigns (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX campaign_products_agency_campaign_idx ON campaign_products (agency_id, campaign_id);

ALTER TABLE campaign_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_products FORCE ROW LEVEL SECURITY;

CREATE POLICY campaign_products_select_tenant ON campaign_products
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY campaign_products_insert_tenant ON campaign_products
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY campaign_products_update_tenant ON campaign_products
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY campaign_products_delete_tenant ON campaign_products
  FOR DELETE USING (agency_id = current_agency_id());

-- CampaignPlacement: WHERE a campaign is shown.
CREATE TABLE IF NOT EXISTS campaign_placements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  location campaign_placement_location NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT campaign_placements_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT campaign_placements_campaign_tenant_fk
    FOREIGN KEY (agency_id, campaign_id) REFERENCES partner_campaigns (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT campaign_placements_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT campaign_placements_unique_location UNIQUE (agency_id, campaign_id, location)
);

CREATE INDEX campaign_placements_agency_location_idx
  ON campaign_placements (agency_id, location) WHERE active;

ALTER TABLE campaign_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_placements FORCE ROW LEVEL SECURITY;

CREATE POLICY campaign_placements_select_tenant ON campaign_placements
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY campaign_placements_insert_tenant ON campaign_placements
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY campaign_placements_update_tenant ON campaign_placements
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY campaign_placements_delete_tenant ON campaign_placements
  FOR DELETE USING (agency_id = current_agency_id());

-- CampaignAttribution: server-recorded impression/click events, feeding a
-- basic impressions/clicks report per campaign. Application code MUST
-- validate the campaign/placement pair refers to a real, active placement
-- in the current tenant before inserting -- never trust a client-supplied
-- attribution blindly. Append-only: no UPDATE/DELETE policy is defined, so
-- FORCE RLS denies those operations for every role by default.
CREATE TABLE IF NOT EXISTS campaign_attributions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  placement_id TEXT NOT NULL,
  event_type campaign_attribution_event_type NOT NULL,
  customer_id TEXT,
  user_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}',

  CONSTRAINT campaign_attributions_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT campaign_attributions_campaign_tenant_fk
    FOREIGN KEY (agency_id, campaign_id) REFERENCES partner_campaigns (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT campaign_attributions_placement_tenant_fk
    FOREIGN KEY (agency_id, placement_id) REFERENCES campaign_placements (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX campaign_attributions_agency_campaign_idx
  ON campaign_attributions (agency_id, campaign_id, event_type);

ALTER TABLE campaign_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_attributions FORCE ROW LEVEL SECURITY;

CREATE POLICY campaign_attributions_select_tenant ON campaign_attributions
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY campaign_attributions_insert_tenant ON campaign_attributions
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
