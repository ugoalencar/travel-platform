-- ============================================================
-- P0 SECURITY FIX: ENABLE RLS ON MFA TABLES
-- ============================================================
-- Three MFA tables (mfa_totp_secrets, mfa_recovery_codes, mfa_requirements)
-- were missing Row-Level Security enforcement despite containing sensitive
-- authentication data. This migration adds RLS with proper tenant-scoped
-- policies to prevent cross-tenant data leakage.
--
-- Timeline:
-- - mfa_totp_secrets: stores TOTP secrets per user
-- - mfa_recovery_codes: stores recovery codes per MFA secret
-- - mfa_requirements: stores MFA policy per agency/role
--
-- All three now enforce agency-scoped isolation via RLS policies.
-- ============================================================

-- ============================================================
-- MFA TOTP SECRETS: ENABLE RLS
-- ============================================================

ALTER TABLE mfa_totp_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_totp_secrets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mfa_totp_secrets_select_tenant ON mfa_totp_secrets;
CREATE POLICY mfa_totp_secrets_select_tenant ON mfa_totp_secrets
  FOR SELECT
  USING (agency_id = current_agency_id());

DROP POLICY IF EXISTS mfa_totp_secrets_insert_tenant ON mfa_totp_secrets;
CREATE POLICY mfa_totp_secrets_insert_tenant ON mfa_totp_secrets
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

DROP POLICY IF EXISTS mfa_totp_secrets_update_tenant ON mfa_totp_secrets;
CREATE POLICY mfa_totp_secrets_update_tenant ON mfa_totp_secrets
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

DROP POLICY IF EXISTS mfa_totp_secrets_delete_tenant ON mfa_totp_secrets;
CREATE POLICY mfa_totp_secrets_delete_tenant ON mfa_totp_secrets
  FOR DELETE
  USING (agency_id = current_agency_id());

-- ============================================================
-- MFA RECOVERY CODES: ENABLE RLS
-- ============================================================

ALTER TABLE mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_recovery_codes FORCE ROW LEVEL SECURITY;

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
-- MFA REQUIREMENTS: ENABLE RLS
-- ============================================================

ALTER TABLE mfa_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_requirements FORCE ROW LEVEL SECURITY;

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
