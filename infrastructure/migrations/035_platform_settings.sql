-- Platform Settings Table
-- Stores platform-wide configuration
CREATE TABLE IF NOT EXISTS platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enable_trials BOOLEAN DEFAULT true,
  trial_duration_days INTEGER DEFAULT 14,
  auto_suspend_past_due BOOLEAN DEFAULT true,
  suspend_after_days_past_due INTEGER DEFAULT 30,
  require_mfa_for_platform BOOLEAN DEFAULT false,
  max_storage_gb_default INTEGER DEFAULT 100,
  max_users_default INTEGER DEFAULT 10,
  max_customers_default INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ(6) DEFAULT now(),
  updated_at TIMESTAMPTZ(6) DEFAULT now()
);

-- Only one row of settings should exist
ALTER TABLE platform_settings ADD CONSTRAINT platform_settings_single_row CHECK (id IS NOT NULL);

-- Create index on id for quick lookup
CREATE UNIQUE INDEX platform_settings_id_idx ON platform_settings(id);

-- Note: audit logging for platform_settings can be added later if needed

-- Insert default settings
INSERT INTO platform_settings (
  id,
  enable_trials,
  trial_duration_days,
  auto_suspend_past_due,
  suspend_after_days_past_due,
  require_mfa_for_platform,
  max_storage_gb_default,
  max_users_default,
  max_customers_default
) VALUES (
  '00000000-0000-0000-0000-000000000001'::UUID,
  true,
  14,
  true,
  30,
  false,
  100,
  10,
  100
) ON CONFLICT DO NOTHING;
