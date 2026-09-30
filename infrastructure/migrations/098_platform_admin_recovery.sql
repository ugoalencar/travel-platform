-- ============================================================
-- 098: Platform Admin account recovery (password reset + MFA recovery)
-- ============================================================
-- platform_users had no self-service recovery: a forgotten password or a
-- lost authenticator locked the only PLATFORM_OWNER out (break-glass only).
--
--   * platform_password_reset_tokens -- single-use, expiring password-reset
--     tokens. Only a SHA-256 hash of the token is stored.
--   * platform_mfa_recovery_codes -- one-time MFA recovery codes issued at
--     enrollment (the TOTP generator already produced them; platform
--     enrollment used to discard them). Only SHA-256 hashes are stored.
--   * platform_sessions.mfa_failed_attempts -- a pending MFA challenge is
--     invalidated after repeated wrong codes (brute-force bound).
--
-- Like every platform_* table (095), these belong to the platform role
-- only: no RLS (platform principals have no agency), no runtime grant, and
-- never exposed to the Supabase Data API roles.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_password_reset_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  platform_user_id TEXT NOT NULL REFERENCES platform_users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  requested_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_password_reset_tokens_user_idx
  ON platform_password_reset_tokens (platform_user_id);

CREATE TABLE IF NOT EXISTS platform_mfa_recovery_codes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  platform_user_id TEXT NOT NULL REFERENCES platform_users (id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  position INTEGER NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_mfa_recovery_codes_user_idx
  ON platform_mfa_recovery_codes (platform_user_id);

ALTER TABLE platform_sessions
  ADD COLUMN IF NOT EXISTS mfa_failed_attempts INTEGER NOT NULL DEFAULT 0;

REVOKE ALL ON platform_password_reset_tokens, platform_mfa_recovery_codes FROM PUBLIC;

DO $$
DECLARE
  platform_role TEXT;
  denied_role TEXT;
BEGIN
  FOREACH platform_role IN ARRAY ARRAY['travel_app_platform', 'travel_app_platform_local']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = platform_role) THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON platform_password_reset_tokens, platform_mfa_recovery_codes TO %I',
        platform_role
      );
    END IF;
  END LOOP;

  FOREACH denied_role IN ARRAY ARRAY['travel_app_runtime', 'travel_app_runtime_local', 'anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = denied_role) THEN
      EXECUTE format(
        'REVOKE ALL ON platform_password_reset_tokens, platform_mfa_recovery_codes FROM %I',
        denied_role
      );
    END IF;
  END LOOP;
END $$;

INSERT INTO schema_migrations (version) VALUES ('098') ON CONFLICT (version) DO NOTHING;
