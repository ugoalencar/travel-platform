-- ============================================================
-- CUSTOMER + PLATFORM ADMIN LOCAL AUTH (Frontend Auth & Session track,
-- decided 2026-09-14: build all three backend login surfaces --
-- STAFF/CUSTOMER/PLATFORM -- with the same real pattern before any
-- frontend work starts).
--
-- auth_sessions.user_id carries TWO foreign keys straight to users(id) /
-- users(agency_id, id) (016_production_auth_captcha_mfa.sql) -- even
-- though its principal_type CHECK already allows 'CUSTOMER', that value
-- was never actually usable for a real customer_accounts row, since
-- customer_accounts.customer_id points at customers, not users. Rather
-- than hack a second, nullable FK column onto a table every other
-- domain also relies on, customer sessions get their own dedicated
-- table below -- same tenant-scoped RLS shape as everything else, just
-- pointed at customer_accounts instead of users.
--
-- Platform Admin is architecturally different again, not just "another
-- principal_type": platform_users (025_platform_super_admin_authorization.sql)
-- has no agency_id at all (platform-wide, not tenant-scoped) and
-- deliberately has no RLS ("Access control enforced via application
-- code"). Forcing it into agency_id-NOT-NULL, RLS-protected
-- auth_sessions would either require a nullable agency_id hack across a
-- tenant-scoped table used by every other domain, or silently weaken
-- the RLS reasoning everyone else relies on. Cleaner and safer: a
-- separate, dedicated platform_sessions table matching platform_users'
-- own (no-RLS, no-tenant) security model exactly.
-- ============================================================

-- customer_accounts never got the matching UNIQUE(agency_id, id) that
-- users/customers/etc. all have (001_initial_schema.sql); add it before
-- any FK below can reference it.
ALTER TABLE customer_accounts
  ADD CONSTRAINT customer_accounts_agency_id_key UNIQUE (agency_id, id);

CREATE TABLE customer_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  customer_account_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  invalidated_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT customer_sessions_account_fk
    FOREIGN KEY (agency_id, customer_account_id) REFERENCES customer_accounts (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT customer_sessions_validity_check
    CHECK (invalidated_at IS NULL OR invalidated_at > created_at)
);

CREATE UNIQUE INDEX customer_sessions_token_hash_key ON customer_sessions (session_token_hash);
CREATE INDEX customer_sessions_account_active_idx
  ON customer_sessions (customer_account_id)
  WHERE invalidated_at IS NULL;

ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_sessions_select_tenant ON customer_sessions
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY customer_sessions_insert_tenant ON customer_sessions
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY customer_sessions_update_tenant ON customer_sessions
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());

CREATE POLICY customer_sessions_select_public_token ON customer_sessions
  FOR SELECT
  USING (
    current_agency_id() IS NULL
    AND session_token_hash = NULLIF(current_setting('app.session_lookup_hash', TRUE), '')
  );
CREATE POLICY customer_sessions_update_public_token ON customer_sessions
  FOR UPDATE
  USING (
    current_agency_id() IS NULL
    AND session_token_hash = NULLIF(current_setting('app.session_lookup_hash', TRUE), '')
  )
  WITH CHECK (
    current_agency_id() IS NULL
    AND session_token_hash = NULLIF(current_setting('app.session_lookup_hash', TRUE), '')
  );

REVOKE ALL ON customer_sessions FROM PUBLIC;

CREATE TABLE platform_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  platform_user_id TEXT NOT NULL REFERENCES platform_users (id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL,
  -- MFA_PENDING rows are an MFA challenge token only -- resolvePlatformSessionByToken()
  -- must never treat one as a usable session, or MFA becomes bypassable
  -- just by presenting the pre-verification token.
  state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('MFA_PENDING', 'ACTIVE')),
  expires_at TIMESTAMPTZ NOT NULL,
  invalidated_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT platform_sessions_validity_check
    CHECK (invalidated_at IS NULL OR invalidated_at > created_at)
);

CREATE UNIQUE INDEX platform_sessions_token_hash_key ON platform_sessions (session_token_hash);
CREATE INDEX platform_sessions_user_active_idx
  ON platform_sessions (platform_user_id)
  WHERE invalidated_at IS NULL;

-- No RLS: matches platform_users' own documented model exactly (platform
-- staff are not tenant-scoped; access control is application-code only,
-- gated on PlatformAuthProvider / requirePlatformRole()).
REVOKE ALL ON platform_sessions FROM PUBLIC;

-- ============================================================
-- Customer Portal forgot/reset password. password_reset_tokens (staff)
-- FKs to users(agency_id, id); customer resets get their own table,
-- FK'd to customer_accounts(agency_id, id) via the UNIQUE constraint
-- added above.
-- ============================================================
CREATE TABLE customer_password_reset_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  customer_account_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  requested_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT customer_password_reset_tokens_account_fk
    FOREIGN KEY (agency_id, customer_account_id) REFERENCES customer_accounts (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT customer_password_reset_tokens_token_hash_key UNIQUE (token_hash)
);

CREATE INDEX customer_password_reset_tokens_account_active_idx
  ON customer_password_reset_tokens (customer_account_id)
  WHERE used_at IS NULL;

ALTER TABLE customer_password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_password_reset_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_password_reset_tokens_select_tenant ON customer_password_reset_tokens
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY customer_password_reset_tokens_insert_tenant ON customer_password_reset_tokens
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY customer_password_reset_tokens_update_tenant ON customer_password_reset_tokens
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());

CREATE POLICY customer_password_reset_tokens_select_public_token ON customer_password_reset_tokens
  FOR SELECT
  USING (
    current_agency_id() IS NULL
    AND token_hash = NULLIF(current_setting('app.password_reset_lookup_hash', TRUE), '')
  );

CREATE POLICY customer_password_reset_tokens_update_public_token ON customer_password_reset_tokens
  FOR UPDATE
  USING (
    current_agency_id() IS NULL
    AND token_hash = NULLIF(current_setting('app.password_reset_lookup_hash', TRUE), '')
  )
  WITH CHECK (
    current_agency_id() IS NULL
    AND token_hash = NULLIF(current_setting('app.password_reset_lookup_hash', TRUE), '')
  );

REVOKE ALL ON customer_password_reset_tokens FROM PUBLIC;
