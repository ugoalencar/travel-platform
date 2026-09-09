-- Migration: Leads and Sales Pipeline
-- Purpose: Track leads from landing page through conversion
-- Status: SaaS sales management
-- Created: 2026-08-30

-- Lead status in sales funnel
CREATE TYPE lead_status AS ENUM (
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'DEMO_SCHEDULED',
  'TRIAL',
  'WON',
  'LOST'
);

-- Leads: Captured from landing page forms
CREATE TABLE leads (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- Contact information
  name TEXT NOT NULL,
  company_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  whatsapp TEXT,

  -- Qualification information
  user_count INT,                              -- Estimated number of staff
  customer_volume INT,                         -- Estimated number of travelers served

  -- Interest tracking
  interest TEXT,                               -- "10 users, 500 customers"
  source TEXT,                                 -- "landing_page", "cold_email", "referral", "partnership"

  -- UTM tracking (for attribution)
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  referral_code TEXT,

  -- Sales funnel
  status lead_status NOT NULL DEFAULT 'NEW',
  assigned_to TEXT REFERENCES platform_users(id) ON DELETE SET NULL,

  -- Relationship tracking
  converted_subscriber_id TEXT REFERENCES subscriber_tenants(id) ON DELETE SET NULL,  -- Links to subscriber if trial/paid created

  -- Notes
  notes TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contacted_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX leads_email_idx ON leads(email);
CREATE INDEX leads_status_idx ON leads(status);
CREATE INDEX leads_assigned_to_idx ON leads(assigned_to);
CREATE INDEX leads_created_idx ON leads(created_at);
CREATE INDEX leads_utm_campaign_idx ON leads(utm_campaign);
CREATE INDEX leads_converted_subscriber_idx ON leads(converted_subscriber_id);

-- Lead interactions: Activities and follow-ups
CREATE TABLE lead_interactions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  interaction_type TEXT NOT NULL,                -- "CALL", "EMAIL", "DEMO", "PROPOSAL", "VISIT"
  interaction_date TIMESTAMPTZ NOT NULL,

  notes TEXT,
  outcome TEXT,                                 -- "INTERESTED", "NOT_INTERESTED", "FOLLOW_UP", etc.

  interacted_by TEXT REFERENCES platform_users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX lead_interactions_lead_idx ON lead_interactions(lead_id);
CREATE INDEX lead_interactions_type_idx ON lead_interactions(interaction_type);
CREATE INDEX lead_interactions_date_idx ON lead_interactions(interaction_date);

-- Lead conversions: Audit trail of conversions
CREATE TABLE lead_conversions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  subscriber_tenant_id TEXT NOT NULL REFERENCES subscriber_tenants(id) ON DELETE CASCADE,

  conversion_type TEXT NOT NULL,                -- "TRIAL", "PAID", "DEMO"
  converted_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  converted_by TEXT REFERENCES platform_users(id)
);

CREATE INDEX lead_conversions_lead_idx ON lead_conversions(lead_id);
CREATE INDEX lead_conversions_subscriber_idx ON lead_conversions(subscriber_tenant_id);

-- Sales opportunities: Tracked pipelines
CREATE TABLE sales_opportunities (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,

  stage TEXT NOT NULL DEFAULT 'PROSPECTING',   -- PROSPECTING, INTEREST, QUALIFICATION, DEMO_SCHEDULED, PROPOSAL_SENT, NEGOTIATION, WON, LOST
  expected_value DECIMAL(12,2),                -- Estimated MRR if won
  close_date_forecast TIMESTAMPTZ,

  owner_id TEXT REFERENCES platform_users(id),

  notes TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sales_opportunities_lead_idx ON sales_opportunities(lead_id);
CREATE INDEX sales_opportunities_stage_idx ON sales_opportunities(stage);
CREATE INDEX sales_opportunities_owner_idx ON sales_opportunities(owner_id);

-- Sales demos: Scheduled demonstrations
CREATE TABLE sales_demos (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  opportunity_id TEXT NOT NULL REFERENCES sales_opportunities(id) ON DELETE CASCADE,

  scheduled_for TIMESTAMPTZ NOT NULL,
  attendees TEXT,                              -- "John Doe, Jane Smith"
  outcome TEXT,                                -- "RESCHEDULED", "NO_SHOW", "INTERESTED", "NOT_INTERESTED"
  outcome_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sales_demos_opportunity_idx ON sales_demos(opportunity_id);
CREATE INDEX sales_demos_scheduled_idx ON sales_demos(scheduled_for);

-- No RLS on lead tables (platform-scoped)

-- Down: Rollback
-- DROP TABLE sales_demos;
-- DROP TABLE sales_opportunities;
-- DROP TABLE lead_conversions;
-- DROP TABLE lead_interactions;
-- DROP TABLE leads;
-- DROP TYPE lead_status;
