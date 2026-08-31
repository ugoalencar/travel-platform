-- Migration: Coupons and Promotional Campaigns
-- Purpose: Discount codes and marketing campaigns
-- Status: SaaS marketing/sales
-- Created: 2026-08-30

-- Discount type for coupons
CREATE TYPE discount_type AS ENUM (
  'PERCENTAGE',
  'FIXED_AMOUNT',
  'FREE_TRIAL_EXTENSION'
);

-- Coupon status
CREATE TYPE coupon_status AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'EXPIRED',
  'EXHAUSTED'
);

-- Campaign status
CREATE TYPE campaign_status AS ENUM (
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED'
);

-- Coupons: Promotional discount codes
CREATE TABLE coupons (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- Coupon code
  code TEXT NOT NULL UNIQUE,                   -- "LAUNCH20", "BLACKFRIDAY"

  -- Discount
  discount_type discount_type NOT NULL,        -- PERCENTAGE, FIXED_AMOUNT, FREE_TRIAL_EXTENSION
  discount_value DECIMAL(12,2) NOT NULL,       -- 20 for 20%, or 100 for 100 BRL off, or 30 for 30 days trial extension
  currency TEXT DEFAULT 'BRL',

  -- Validity
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,

  -- Usage limits
  max_uses INT,                                 -- Total redemptions allowed
  uses_count INT DEFAULT 0,                     -- Current redemptions
  max_uses_per_tenant INT DEFAULT 1,            -- Per subscriber limit

  -- Plan eligibility
  min_plan_id TEXT REFERENCES plans(id),       -- Minimum plan required
  eligible_plan_ids TEXT[] DEFAULT '{}',       -- Specific plans allowed (empty = all)

  -- Referral tracking
  referrer_id TEXT REFERENCES platform_users(id),  -- Who created/is responsible for this coupon

  -- Status
  status coupon_status NOT NULL DEFAULT 'ACTIVE',

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_by TEXT NOT NULL REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX coupons_code_idx ON coupons(code);
CREATE INDEX coupons_status_idx ON coupons(status);
CREATE INDEX coupons_valid_until_idx ON coupons(valid_until);
CREATE INDEX coupons_created_at_idx ON coupons(created_at);

-- Coupon redemptions: Track which tenants used which coupons
CREATE TABLE coupon_redemptions (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  coupon_id TEXT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  subscriber_tenant_id TEXT NOT NULL REFERENCES subscriber_tenants(id) ON DELETE CASCADE,

  redemption_date TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Amount applied
  discount_amount_applied DECIMAL(12,2),
  trial_extension_days INT,

  -- Which invoice/payment this applies to
  invoice_id TEXT REFERENCES billing_invoices(id) ON DELETE SET NULL,

  -- Notes
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX coupon_redemptions_coupon_idx ON coupon_redemptions(coupon_id);
CREATE INDEX coupon_redemptions_subscriber_idx ON coupon_redemptions(subscriber_tenant_id);
CREATE INDEX coupon_redemptions_date_idx ON coupon_redemptions(redemption_date);

-- Promotional campaigns: Marketing campaigns using coupons
CREATE TABLE promotional_campaigns (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),

  -- Campaign info
  name TEXT NOT NULL,
  description TEXT,
  campaign_type TEXT,                          -- "LAUNCH", "SEASONAL", "PARTNERSHIP", "REFERRAL"

  -- Duration
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,

  -- Budget and performance
  budget DECIMAL(12,2),
  expected_participants INT,

  -- Associated coupons
  coupon_ids TEXT[] DEFAULT '{}',

  -- Status
  status campaign_status NOT NULL DEFAULT 'DRAFT',

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_by TEXT NOT NULL REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX promotional_campaigns_status_idx ON promotional_campaigns(status);
CREATE INDEX promotional_campaigns_start_date_idx ON promotional_campaigns(start_date);
CREATE INDEX promotional_campaigns_end_date_idx ON promotional_campaigns(end_date);

-- Campaign audit: Track campaign changes
CREATE TABLE campaign_audit (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  campaign_id TEXT NOT NULL REFERENCES promotional_campaigns(id) ON DELETE CASCADE,

  action TEXT NOT NULL,                        -- CREATED, ACTIVATED, PAUSED, COMPLETED
  old_values JSONB,
  new_values JSONB,

  changed_by TEXT NOT NULL REFERENCES platform_users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX campaign_audit_campaign_idx ON campaign_audit(campaign_id);
CREATE INDEX campaign_audit_changed_at_idx ON campaign_audit(changed_at);

-- No RLS on coupon/campaign tables (platform-scoped)

-- Down: Rollback
-- DROP TABLE campaign_audit;
-- DROP TABLE promotional_campaigns;
-- DROP TABLE coupon_redemptions;
-- DROP TABLE coupons;
-- DROP TYPE campaign_status;
-- DROP TYPE coupon_status;
-- DROP TYPE discount_type;
