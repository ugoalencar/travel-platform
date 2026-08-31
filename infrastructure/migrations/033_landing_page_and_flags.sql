-- Migration: Landing Page CMS and Feature Flags
-- Purpose: Configurable landing page content and feature rollout control
-- Status: Marketing and operations infrastructure
-- Created: 2026-08-30

-- Feature flag scope enum
CREATE TYPE feature_flag_scope AS ENUM (
  'GLOBAL',       -- Enabled for everyone
  'PLAN_ID',      -- Enabled for specific plans
  'TENANT_ID',    -- Enabled for specific subscribers
  'USER_ID'       -- Enabled for specific platform users
);

-- Landing page configuration: CMS data
CREATE TABLE landing_page_config (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- Section organization
  section TEXT NOT NULL,                       -- "hero", "features", "pricing", "testimonials", "faq", "footer"
  key TEXT NOT NULL,                           -- "title", "subtitle", "description"

  -- Value and metadata
  value TEXT,                                  -- JSON-encoded for complex values
  value_type TEXT,                             -- "text", "number", "json", "url", "image"
  is_published BOOLEAN DEFAULT false,

  -- Versions
  version INT DEFAULT 1,
  published_version INT,
  published_at TIMESTAMPTZ,
  draft_at TIMESTAMPTZ,

  -- Audit
  updated_by TEXT REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX landing_page_config_section_key_version_idx ON landing_page_config(section, key, version);
CREATE INDEX landing_page_config_section_idx ON landing_page_config(section);
CREATE INDEX landing_page_config_published_idx ON landing_page_config(is_published);

-- Landing page promotions: Dynamic promotional overlays/banners
CREATE TABLE landing_promotions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- Promotion type
  type TEXT NOT NULL,                          -- "GLOBAL_BANNER", "PLAN_BADGE", "TRIAL_CTA", "COUNTDOWN", "COUPON_DISPLAY"
  position TEXT,                               -- "TOP", "MIDDLE", "BOTTOM" (for banners)

  -- Content
  content JSONB NOT NULL,                      -- {"text": "Black Friday...", "color": "#FF0000", "ctaUrl": "..."}
  associated_coupon_id TEXT REFERENCES coupons(id) ON DELETE SET NULL,
  associated_campaign_id TEXT REFERENCES promotional_campaigns(id) ON DELETE SET NULL,

  -- Visibility control
  enabled BOOLEAN NOT NULL DEFAULT false,
  priority INT DEFAULT 0,                      -- Display order (higher = display first)

  -- Scheduling
  scheduled_from TIMESTAMPTZ,
  scheduled_until TIMESTAMPTZ,
  auto_disable_at TIMESTAMPTZ,

  -- Targeting
  target_plan_ids TEXT[],                      -- Empty = all plans
  target_new_visitors_only BOOLEAN DEFAULT false,

  -- Analytics
  impressions_count INT DEFAULT 0,
  clicks_count INT DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_by TEXT NOT NULL REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX landing_promotions_enabled_idx ON landing_promotions(enabled);
CREATE INDEX landing_promotions_type_idx ON landing_promotions(type);
CREATE INDEX landing_promotions_scheduled_from_idx ON landing_promotions(scheduled_from);
CREATE INDEX landing_promotions_scheduled_until_idx ON landing_promotions(scheduled_until);

-- Feature flags: Control feature rollout and A/B testing
CREATE TABLE feature_flags (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- Flag identification
  name TEXT NOT NULL UNIQUE,                   -- "ocr_beta", "dark_mode", "new_dashboard"
  description TEXT,

  -- Scope and targeting
  scope feature_flag_scope NOT NULL DEFAULT 'GLOBAL',
  target_id TEXT,                              -- Plan ID, Tenant ID, User ID depending on scope
  percentage_rollout INT,                      -- 0-100: percentage of users to enable for (if GLOBAL)

  -- Status
  enabled BOOLEAN NOT NULL DEFAULT false,

  -- Configuration
  config JSONB DEFAULT '{}',                   -- Optional config for this flag

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_by TEXT NOT NULL REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX feature_flags_name_idx ON feature_flags(name);
CREATE INDEX feature_flags_scope_idx ON feature_flags(scope);
CREATE INDEX feature_flags_enabled_idx ON feature_flags(enabled);
CREATE INDEX feature_flags_target_idx ON feature_flags(target_id);

-- Feature flag audit: Track all flag changes
CREATE TABLE feature_flag_audit (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  feature_flag_id TEXT NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,

  action TEXT NOT NULL,                        -- CREATED, ENABLED, DISABLED, UPDATED
  old_value JSONB,
  new_value JSONB,

  changed_by TEXT NOT NULL REFERENCES platform_users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX feature_flag_audit_flag_idx ON feature_flag_audit(feature_flag_id);
CREATE INDEX feature_flag_audit_changed_at_idx ON feature_flag_audit(changed_at);

-- No RLS on landing page/flags tables (platform-scoped)

-- Seed default feature flags (only if platform_users exist)
DO $$
DECLARE
  default_user_id TEXT;
BEGIN
  SELECT id INTO default_user_id FROM platform_users LIMIT 1;

  IF default_user_id IS NOT NULL THEN
    INSERT INTO feature_flags (name, scope, enabled, description, created_by)
    VALUES
      ('saas_control_plane_enabled', 'GLOBAL', true, 'Enable SaaS control plane for all users', default_user_id),
      ('landing_page_promotions', 'GLOBAL', true, 'Show promotional banners on landing page', default_user_id),
      ('billing_webhooks_enabled', 'GLOBAL', true, 'Process billing provider webhooks', default_user_id)
    ON CONFLICT (name) DO NOTHING;
  END IF;
END $$;

-- Down: Rollback
-- DROP TABLE feature_flag_audit;
-- DROP TABLE feature_flags;
-- DROP TABLE landing_promotions;
-- DROP TABLE landing_page_config;
-- DROP TYPE feature_flag_scope;
