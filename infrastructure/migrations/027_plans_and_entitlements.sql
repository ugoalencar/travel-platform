-- Migration: Plans and Entitlements
-- Purpose: Define subscription plans with feature-level enforcement
-- Status: Core SaaS product offering
-- Created: 2026-08-30

-- Feature availability types
CREATE TYPE feature_type AS ENUM (
  'BOOLEAN',        -- Feature on/off
  'INTEGER',        -- Numeric limit
  'STRING',         -- Text value
  'JSON'            -- Complex config
);

-- Plans table: Define available subscription tiers
CREATE TABLE plans (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- Display information
  name TEXT NOT NULL UNIQUE,               -- "Free", "Professional", "Enterprise"
  slug TEXT NOT NULL UNIQUE,               -- URL-safe name "professional", "enterprise"
  description TEXT,

  -- Pricing
  price_amount DECIMAL(12,2) NOT NULL,     -- 99.90 for 99.90 BRL
  price_currency TEXT NOT NULL DEFAULT 'BRL',
  billing_interval billing_interval NOT NULL,  -- MONTHLY, YEARLY, QUARTERLY

  -- Plan limits (enforced by application)
  max_users INT,
  max_customers INT,
  storage_gb INT,

  -- Features as JSON for flexibility
  features JSONB DEFAULT '{}',            -- {"ocr": true, "marketing": false, "customer_portal": true}

  -- Status
  active BOOLEAN NOT NULL DEFAULT true,    -- Archived plans stay in DB for history

  -- Audit
  created_by TEXT REFERENCES platform_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX plans_name_idx ON plans(name);
CREATE INDEX plans_slug_idx ON plans(slug);
CREATE INDEX plans_active_idx ON plans(active);

-- Entitlements: Fine-grained feature/limit definitions per plan
CREATE TABLE entitlements (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,

  -- Feature identifier
  feature_key TEXT NOT NULL,               -- "MAX_USERS", "FEATURE_OCR", "STORAGE_GB"
  feature_type feature_type NOT NULL,      -- BOOLEAN, INTEGER, STRING, JSON

  -- Value and limit
  value JSONB,                             -- {"type": "integer", "value": 5} or {"type": "boolean", "value": true}
  limit_value INT,                         -- For INTEGER type: limit of this value

  -- Documentation
  description TEXT,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX entitlements_plan_feature_idx ON entitlements(plan_id, feature_key);
CREATE INDEX entitlements_plan_idx ON entitlements(plan_id);

-- Entitlement audit: Track changes to plan features
CREATE TABLE entitlement_changes (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  entitlement_id TEXT REFERENCES entitlements(id) ON DELETE SET NULL,

  action TEXT NOT NULL,                   -- CREATED, UPDATED, DELETED
  old_value JSONB,
  new_value JSONB,

  changed_by TEXT NOT NULL REFERENCES platform_users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX entitlement_changes_plan_idx ON entitlement_changes(plan_id);
CREATE INDEX entitlement_changes_changed_at_idx ON entitlement_changes(changed_at);

-- No RLS on plans/entitlements (platform-scoped tables)
-- Read access granted to all authenticated users (plans are public info)
-- Write access restricted to BILLING_ADMIN or PLATFORM_ADMIN

-- Seed default plans (can be customized later via UI)
INSERT INTO plans (name, slug, price_amount, billing_interval, max_users, max_customers, storage_gb, features, active)
VALUES
  ('Free', 'free', 0, 'MONTHLY', 2, 10, 1, '{"ocr": false, "marketing": false, "financial": false, "customer_portal": false, "reports": false}', true),
  ('Professional', 'professional', 99.90, 'MONTHLY', 20, 500, 10, '{"ocr": true, "marketing": true, "financial": true, "customer_portal": true, "reports": true}', true),
  ('Enterprise', 'enterprise', 299.90, 'MONTHLY', 999, 999999, 100, '{"ocr": true, "marketing": true, "financial": true, "customer_portal": true, "reports": true, "custom_domain": true, "sso": true}', true)
ON CONFLICT (name) DO NOTHING;

-- Populate entitlements for each seeded plan
-- Free plan
INSERT INTO entitlements (plan_id, feature_key, feature_type, value, limit_value, description)
SELECT id, 'MAX_USERS', 'INTEGER', '{"value": 2}', 2, 'Maximum users in free tier'
FROM plans WHERE slug = 'free'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO entitlements (plan_id, feature_key, feature_type, value, limit_value, description)
SELECT id, 'MAX_CUSTOMERS', 'INTEGER', '{"value": 10}', 10, 'Maximum customers in free tier'
FROM plans WHERE slug = 'free'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- Professional plan
INSERT INTO entitlements (plan_id, feature_key, feature_type, value, limit_value, description)
SELECT id, 'MAX_USERS', 'INTEGER', '{"value": 20}', 20, 'Maximum users in professional tier'
FROM plans WHERE slug = 'professional'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO entitlements (plan_id, feature_key, feature_type, value, limit_value, description)
SELECT id, 'MAX_CUSTOMERS', 'INTEGER', '{"value": 500}', 500, 'Maximum customers in professional tier'
FROM plans WHERE slug = 'professional'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- Enterprise plan
INSERT INTO entitlements (plan_id, feature_key, feature_type, value, limit_value, description)
SELECT id, 'MAX_USERS', 'INTEGER', '{"value": 999}', 999, 'Unlimited-like users in enterprise tier'
FROM plans WHERE slug = 'enterprise'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO entitlements (plan_id, feature_key, feature_type, value, limit_value, description)
SELECT id, 'MAX_CUSTOMERS', 'INTEGER', '{"value": 999999}', 999999, 'Unlimited-like customers in enterprise tier'
FROM plans WHERE slug = 'enterprise'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- Down: Rollback
-- DROP TABLE entitlement_changes;
-- DROP TABLE entitlements;
-- DROP TABLE plans;
-- DROP TYPE feature_type;
