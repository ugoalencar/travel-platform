-- Migration: Courtesy Accounts
-- Purpose: Track free/promotional subscriptions for partners, acquisitions
-- Status: SaaS business requirement
-- Created: 2026-08-30

CREATE TABLE courtesy_accounts (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- Links
  subscriber_tenant_id TEXT NOT NULL UNIQUE REFERENCES subscriber_tenants(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,

  -- Granting
  reason TEXT NOT NULL,                           -- "Launch partner", "Co-marketing agreement", "Acquisition"
  granted_by TEXT NOT NULL REFERENCES platform_users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Duration
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,

  -- Auto-conversion behavior
  auto_convert_to_paid BOOLEAN DEFAULT false,    -- Auto-activate paid subscription on expiry?

  -- Notes
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX courtesy_accounts_subscriber_idx ON courtesy_accounts(subscriber_tenant_id);
CREATE INDEX courtesy_accounts_expires_idx ON courtesy_accounts(expires_at);
CREATE INDEX courtesy_accounts_granted_by_idx ON courtesy_accounts(granted_by);

-- Audit: Track all courtesy grant/revoke actions
CREATE TABLE courtesy_account_audit (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  courtesy_account_id TEXT REFERENCES courtesy_accounts(id) ON DELETE CASCADE,

  action TEXT NOT NULL,                           -- GRANTED, EXTENDED, EXPIRED, CONVERTED, REVOKED
  old_values JSONB,
  new_values JSONB,

  actor_id TEXT NOT NULL REFERENCES platform_users(id),
  reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX courtesy_account_audit_courtesy_idx ON courtesy_account_audit(courtesy_account_id);
CREATE INDEX courtesy_account_audit_actor_idx ON courtesy_account_audit(actor_id);
CREATE INDEX courtesy_account_audit_created_idx ON courtesy_account_audit(created_at);

-- No RLS on courtesy tables (platform-scoped)

-- Down: Rollback
-- DROP TABLE courtesy_account_audit;
-- DROP TABLE courtesy_accounts;
