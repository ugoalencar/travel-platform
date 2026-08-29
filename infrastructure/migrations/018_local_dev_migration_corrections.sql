-- ============================================================
-- LOCAL DEVELOPMENT MIGRATION CORRECTIONS
-- ============================================================
-- This migration corrects PostgreSQL 15 compatibility issues
-- in migrations 016 and 017 that prevent fresh-install zero-to-head
-- database bootstrapping on local development environments.
--
-- Issues fixed:
-- 1. Migration 016: Invalid syntax "UNIQUE (cols) WHERE condition" in table constraint.
--    PostgreSQL 15 requires this to be a separate partial unique index.
-- 2. Migration 017: Duplicate CREATE POLICY statements cause conflicts when
--    policies already exist (e.g., on fresh installs that apply 016-017).
--    Added IF NOT EXISTS / DROP IF EXISTS guards.
--
-- Timeline:
-- - Original MFA implementation (016, 017) committed to release branches
--   before this correction was needed.
-- - Local development required ability to apply 001-017 from scratch.
-- - This additive migration (018) restores that capability without
--   rewriting historical migrations.
--
-- Affected tables:
-- - mfa_totp_secrets (corrected constraint to index)
-- - mfa_recovery_codes (corrected policy idempotence)
-- - mfa_requirements (corrected policy idempotence)
-- ============================================================

-- ============================================================
-- RECOVERY: MFA TABLE DEFINITIONS (if 016 failed to create them)
-- ============================================================
-- Migration 016 may fail on PostgreSQL 15 due to invalid UNIQUE constraint
-- syntax. This section ensures MFA tables exist with correct structure.
-- If tables already exist (016 succeeded elsewhere), these are no-ops.

CREATE TABLE IF NOT EXISTS mfa_totp_secrets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  secret TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mfa_totp_secrets_user_agency_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret_id TEXT NOT NULL REFERENCES mfa_totp_secrets(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mfa_requirements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  role TEXT NOT NULL,
  mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mfa_requirements_agency_role_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (agency_id, role)
);

-- ============================================================
-- FIX 1: MFA TOTP SECRETS PARTIAL UNIQUE INDEX
-- ============================================================
-- Migration 016 defined an invalid constraint:
--   CONSTRAINT mfa_totp_secrets_one_active_per_user
--     UNIQUE (agency_id, user_id) WHERE verified_at IS NOT NULL AND disabled_at IS NULL
--
-- PostgreSQL 15 doesn't support WHERE in table constraints.
-- Correct form: separate partial unique index.
-- Safe to apply: if index already exists (from 016 applied elsewhere),
-- "CREATE INDEX IF NOT EXISTS" will be a no-op.

CREATE UNIQUE INDEX IF NOT EXISTS mfa_totp_secrets_one_active_per_user
  ON mfa_totp_secrets (agency_id, user_id)
  WHERE verified_at IS NOT NULL AND disabled_at IS NULL;

-- ============================================================
-- FIX 2: MFA RECOVERY CODES POLICY IDEMPOTENCE
-- ============================================================
-- Migration 017 creates policies that may already exist if 016 ran
-- (fresh installs). Guard with IF NOT EXISTS or DROP IF EXISTS.

DROP POLICY IF EXISTS mfa_recovery_codes_select_tenant ON mfa_recovery_codes;
CREATE POLICY mfa_recovery_codes_select_tenant ON mfa_recovery_codes
  FOR SELECT
  USING (agency_id = current_agency_id());

DROP POLICY IF EXISTS mfa_recovery_codes_insert_tenant ON mfa_recovery_codes;
CREATE POLICY mfa_recovery_codes_insert_tenant ON mfa_recovery_codes
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

DROP POLICY IF EXISTS mfa_recovery_codes_update_tenant ON mfa_recovery_codes;
CREATE POLICY mfa_recovery_codes_update_tenant ON mfa_recovery_codes
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

DROP POLICY IF EXISTS mfa_recovery_codes_delete_tenant ON mfa_recovery_codes;
CREATE POLICY mfa_recovery_codes_delete_tenant ON mfa_recovery_codes
  FOR DELETE
  USING (agency_id = current_agency_id());

-- ============================================================
-- FIX 3: MFA REQUIREMENTS POLICY IDEMPOTENCE
-- ============================================================

DROP POLICY IF EXISTS mfa_requirements_select_tenant ON mfa_requirements;
CREATE POLICY mfa_requirements_select_tenant ON mfa_requirements
  FOR SELECT
  USING (agency_id = current_agency_id());

DROP POLICY IF EXISTS mfa_requirements_insert_tenant ON mfa_requirements;
CREATE POLICY mfa_requirements_insert_tenant ON mfa_requirements
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

DROP POLICY IF EXISTS mfa_requirements_update_tenant ON mfa_requirements;
CREATE POLICY mfa_requirements_update_tenant ON mfa_requirements
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

DROP POLICY IF EXISTS mfa_requirements_delete_tenant ON mfa_requirements;
CREATE POLICY mfa_requirements_delete_tenant ON mfa_requirements
  FOR DELETE
  USING (agency_id = current_agency_id());
