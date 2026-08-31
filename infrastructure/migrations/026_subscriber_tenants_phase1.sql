-- Migration: Subscriber Tenants - Phase 1 Core
-- Purpose: Map subscription metadata to existing agencies
-- Status: Core SaaS multi-tenant subscription tracking
-- Created: 2026-08-30

-- Subscription status lifecycle
CREATE TYPE subscription_status AS ENUM (
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'GRACE_PERIOD',
  'SUSPENDED',
  'CANCELLED',
  'COURTESY'
);

-- Billing status (independent of subscription status)
CREATE TYPE billing_status AS ENUM (
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'FAILED'
);

-- Courtesy/free account status
CREATE TYPE courtesy_status AS ENUM (
  'NONE',
  'ACTIVE',
  'EXPIRED',
  'CONVERTED'
);

-- Billing interval options
CREATE TYPE billing_interval AS ENUM (
  'MONTHLY',
  'YEARLY',
  'QUARTERLY'
);

-- Main subscriber tenant table
-- Links existing agencies to SaaS subscription metadata
-- Note: No agency_id field (agency_id is in agencies table, referenced via FK)
CREATE TABLE subscriber_tenants (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  agency_id TEXT NOT NULL UNIQUE REFERENCES agencies(id) ON DELETE RESTRICT,

  -- Contact information (for billing/support)
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,

  -- Legal/company information
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  cnpj TEXT UNIQUE,

  -- Subscription state
  plan_id TEXT,                        -- References plans table (created in migration 028)
  subscription_status subscription_status NOT NULL DEFAULT 'TRIAL',
  trial_starts_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,

  -- Billing state
  billing_status billing_status NOT NULL DEFAULT 'ACTIVE',

  -- Courtesy/free tier state
  courtesy_status courtesy_status NOT NULL DEFAULT 'NONE',

  -- Lifecycle timestamps
  activated_at TIMESTAMPTZ,            -- When subscriber first activated (trial or paid)
  suspended_at TIMESTAMPTZ,            -- When suspended
  cancelled_at TIMESTAMPTZ,            -- When cancelled (soft delete)

  -- Usage tracking (updated by background jobs or application)
  storage_bytes_used BIGINT DEFAULT 0,
  user_count INT DEFAULT 0,
  customer_count INT DEFAULT 0,

  -- Metadata
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX subscriber_tenants_agency_idx ON subscriber_tenants(agency_id);
CREATE INDEX subscriber_tenants_status_idx ON subscriber_tenants(subscription_status);
CREATE INDEX subscriber_tenants_billing_status_idx ON subscriber_tenants(billing_status);
CREATE INDEX subscriber_tenants_created_idx ON subscriber_tenants(created_at);
CREATE INDEX subscriber_tenants_trial_ends_idx ON subscriber_tenants(trial_ends_at) WHERE subscription_status = 'TRIAL';

-- Audit table for subscriber tenant changes
CREATE TABLE subscriber_tenant_audit (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  subscriber_tenant_id TEXT NOT NULL REFERENCES subscriber_tenants(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES platform_users(id),  -- NULL if system action
  action TEXT NOT NULL,                          -- CREATED, STATUS_CHANGED, PLAN_CHANGED, SUSPENDED
  old_values JSONB,
  new_values JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX subscriber_tenant_audit_tenant_idx ON subscriber_tenant_audit(subscriber_tenant_id);
CREATE INDEX subscriber_tenant_audit_actor_idx ON subscriber_tenant_audit(actor_id);
CREATE INDEX subscriber_tenant_audit_created_idx ON subscriber_tenant_audit(created_at);

-- No RLS on subscriber_tenants (platform-scoped table)
-- Access control enforced via application code

-- Down: Rollback
-- DROP TABLE subscriber_tenant_audit;
-- DROP TABLE subscriber_tenants;
-- DROP TYPE courtesy_status;
-- DROP TYPE billing_status;
-- DROP TYPE subscription_status;
-- DROP TYPE billing_interval;
