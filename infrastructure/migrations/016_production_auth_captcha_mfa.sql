-- ============================================================
-- SECURITY: PRODUCTION AUTH + CAPTCHA + MFA
-- Agent 06: Complete Security Area
-- ============================================================

-- ============================================================
-- S1: PRODUCTION AUTH SESSION & STATE
-- ============================================================

-- Authorization states for production auth flow:
-- PRIMARY_AUTHENTICATED (OIDC/OAuth2 verified) →
-- MFA_REQUIRED (if MFA is mandatory) →
-- FULLY_AUTHENTICATED (ready for privileged routes)
CREATE TYPE auth_state AS ENUM (
  'PRIMARY_AUTHENTICATED',
  'MFA_REQUIRED',
  'FULLY_AUTHENTICATED'
);

-- Sessions: OIDC/OAuth2 backed, immutable principal context
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Principal context captured at authentication time
  principal_type TEXT NOT NULL DEFAULT 'STAFF' CHECK (principal_type IN ('STAFF', 'CUSTOMER')),

  -- OAuth2/OIDC context (immutable)
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,  -- OAuth2 'sub' claim
  audience TEXT NOT NULL, -- OAuth2 'aud' claim

  -- Session state for MFA readiness
  auth_state auth_state NOT NULL DEFAULT 'PRIMARY_AUTHENTICATED',

  -- Signature verification context (for replay detection)
  nonce TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Logout flag (soft delete style)
  invalidated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT auth_sessions_user_agency_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT auth_sessions_validity_check
    CHECK (invalidated_at IS NULL OR invalidated_at > created_at)
);

CREATE INDEX auth_sessions_user_state_idx
  ON auth_sessions (user_id, auth_state)
  WHERE invalidated_at IS NULL;
CREATE INDEX auth_sessions_agency_expires_idx
  ON auth_sessions (agency_id, expires_at DESC)
  WHERE invalidated_at IS NULL;

ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY auth_sessions_select_tenant ON auth_sessions
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY auth_sessions_insert_tenant ON auth_sessions
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

-- ============================================================
-- S3: MFA (TOTP + Recovery Codes)
-- ============================================================

-- TOTP secrets: stored at rest, shown only at enrollment
CREATE TABLE mfa_totp_secrets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Encrypted TOTP secret (never logged or audited with value)
  secret_encrypted TEXT NOT NULL,

  -- Metadata for recovery / key rotation
  algorithm TEXT NOT NULL DEFAULT 'SHA1' CHECK (algorithm IN ('SHA1', 'SHA256', 'SHA512')),
  digits INTEGER NOT NULL DEFAULT 6 CHECK (digits >= 6 AND digits <= 8),
  period INTEGER NOT NULL DEFAULT 30 CHECK (period > 0 AND period <= 60),

  -- Validity tracking: enabled only after successful verification at setup
  verified_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mfa_totp_secrets_user_agency_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  -- Enforce one active TOTP per user
  CONSTRAINT mfa_totp_secrets_one_active_per_user
    UNIQUE (agency_id, user_id) WHERE verified_at IS NOT NULL AND disabled_at IS NULL
);

CREATE INDEX mfa_totp_secrets_user_active_idx
  ON mfa_totp_secrets (user_id, verified_at DESC)
  WHERE verified_at IS NOT NULL AND disabled_at IS NULL;

-- TOTP verification audit: every failed and successful attempt for forensics
CREATE TABLE mfa_totp_attempts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  secret_id TEXT NOT NULL REFERENCES mfa_totp_secrets(id) ON DELETE RESTRICT,

  -- Never store the actual code; only success/failure + timing
  outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILURE')),

  -- Optional context for abuse detection
  ip_address TEXT,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mfa_totp_attempts_user_agency_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX mfa_totp_attempts_user_outcome_idx
  ON mfa_totp_attempts (user_id, outcome, created_at DESC);
CREATE INDEX mfa_totp_attempts_user_created_idx
  ON mfa_totp_attempts (user_id, created_at DESC);

ALTER TABLE mfa_totp_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_totp_attempts FORCE ROW LEVEL SECURITY;

CREATE POLICY mfa_totp_attempts_select_tenant ON mfa_totp_attempts
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY mfa_totp_attempts_insert_tenant ON mfa_totp_attempts
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

-- Recovery codes: one-time use, hashed, single-use enforcement
CREATE TABLE mfa_recovery_codes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret_id TEXT NOT NULL REFERENCES mfa_totp_secrets(id) ON DELETE CASCADE,

  -- Code hash (never store plaintext)
  code_hash TEXT NOT NULL,

  -- Single-use enforcement
  used_at TIMESTAMPTZ,

  -- Tracking for recovery
  position INTEGER NOT NULL CHECK (position >= 1 AND position <= 16),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mfa_recovery_codes_user_agency_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  -- Enforce unique codes per secret
  CONSTRAINT mfa_recovery_codes_unique_per_secret
    UNIQUE (secret_id, position)
);

CREATE INDEX mfa_recovery_codes_user_unused_idx
  ON mfa_recovery_codes (user_id)
  WHERE used_at IS NULL;
CREATE INDEX mfa_recovery_codes_code_hash_idx
  ON mfa_recovery_codes (code_hash)
  WHERE used_at IS NULL;

-- ============================================================
-- S2: CAPTCHA / ABUSE VERIFICATION
-- ============================================================

-- CAPTCHA verification state: tracks what has been verified server-side.
-- Client cannot bypass this; server decides what CAPTCHA events require.
CREATE TABLE captcha_verifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- Challenge context (IP, account hash, etc from login abuse protector)
  context_key TEXT NOT NULL,  -- IP or account hash

  -- Vendor token & verification outcome
  provider TEXT NOT NULL CHECK (provider IN ('RECAPTCHA_V3', 'HCAPTCHA', 'CLOUDFLARE', 'CUSTOM')),
  provider_token TEXT NOT NULL,

  -- Server-side verification result
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_score NUMERIC(3, 2),  -- For v3-style captchas (0.0-1.0)

  -- Timestamp for abuse detection
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT captcha_verifications_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT captcha_verifications_context_provider_key
    UNIQUE (agency_id, context_key, provider, provider_token)
);

CREATE INDEX captcha_verifications_verified_created_idx
  ON captcha_verifications (verified, created_at DESC);
CREATE INDEX captcha_verifications_context_created_idx
  ON captcha_verifications (context_key, created_at DESC);

ALTER TABLE captcha_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE captcha_verifications FORCE ROW LEVEL SECURITY;

CREATE POLICY captcha_verifications_select_tenant ON captcha_verifications
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY captcha_verifications_insert_tenant ON captcha_verifications
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

-- ============================================================
-- MFA REQUIREMENT POLICY
-- ============================================================

-- Defines which roles require MFA at which agencies
CREATE TABLE mfa_requirements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- User role that requires MFA
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'VIEWER')),

  -- Enforcement level
  required BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mfa_requirements_agency_role_key
    UNIQUE (agency_id, role)
);

-- Default MFA requirements: OWNER and ADMIN mandatory
INSERT INTO mfa_requirements (agency_id, role, required)
SELECT
  id,
  role,
  role IN ('OWNER', 'ADMIN')
FROM (
  SELECT DISTINCT id FROM agencies
) AS a
CROSS JOIN (
  SELECT * FROM (VALUES ('OWNER'), ('ADMIN'), ('MANAGER'), ('AGENT'), ('VIEWER')) AS roles(role)
) AS roles
ON CONFLICT (agency_id, role) DO UPDATE SET required = EXCLUDED.required;

-- ============================================================
-- AUDIT LOGGING INTEGRATION
-- ============================================================

-- Auth and MFA events are logged to audit_logs with special handling:
-- - Never log secret values or TOTP codes
-- - Log session state transitions
-- - Log MFA enable/disable/verification events
-- - Log CAPTCHA challenge and verification events

-- See audit_logs table in 015_audit_logging.sql for structure
-- Event types: AUTH_SESSION_CREATE, AUTH_SESSION_INVALIDATE, AUTH_STATE_TRANSITION,
--              MFA_ENABLED, MFA_DISABLED, MFA_CHALLENGE, MFA_VERIFICATION_SUCCESS,
--              MFA_VERIFICATION_FAILURE, CAPTCHA_REQUIRED, CAPTCHA_VERIFIED

REVOKE ALL ON auth_sessions FROM PUBLIC;
REVOKE ALL ON mfa_totp_secrets FROM PUBLIC;
REVOKE ALL ON mfa_totp_attempts FROM PUBLIC;
REVOKE ALL ON mfa_recovery_codes FROM PUBLIC;
REVOKE ALL ON captcha_verifications FROM PUBLIC;
REVOKE ALL ON mfa_requirements FROM PUBLIC;
