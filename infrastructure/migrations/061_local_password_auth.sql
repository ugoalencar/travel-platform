-- ============================================================
-- LOCAL PASSWORD AUTH (Pilot Delivery Gap Closure -- Agent 02/Identity)
--
-- auth_sessions, mfa_totp_secrets/attempts/recovery_codes, and
-- mfa_requirements (016_production_auth_captcha_mfa.sql) already exist but
-- were never wired to an HTTP surface: there is no working login anywhere
-- in the product today. Invitation acceptance sets `users.password_hash`
-- to an unusable random placeholder (see invitations.ts) -- the flow was
-- scaffolded for an external OIDC/OAuth2 identity provider that was never
-- integrated. Standing up an external IdP is out of scope for the pilot;
-- this migration closes the gap with local email+password auth instead,
-- reusing every table/RLS/crypto primitive already in place.
-- ============================================================

-- auth_sessions was designed OIDC-only (issuer/subject/audience NOT NULL,
-- no token column at all -- an OIDC access token is self-describing and
-- was never meant to be stored). Local sessions need an opaque,
-- high-entropy session token the client holds, hashed at rest (same
-- pattern as invitation/partner-link tokens). The table has zero rows in
-- any environment (never written to), so these are safe in-place changes,
-- not a backfill.
ALTER TABLE auth_sessions
  ALTER COLUMN issuer DROP NOT NULL,
  ALTER COLUMN subject DROP NOT NULL,
  ALTER COLUMN audience DROP NOT NULL;

ALTER TABLE auth_sessions
  ADD COLUMN session_token_hash TEXT,
  ADD COLUMN revoked_reason TEXT;

ALTER TABLE auth_sessions
  ADD CONSTRAINT auth_sessions_local_requires_token_check
    CHECK (
      (principal_type = 'STAFF' AND issuer IS NULL AND session_token_hash IS NOT NULL)
      OR (issuer IS NOT NULL AND subject IS NOT NULL AND audience IS NOT NULL)
    );

CREATE UNIQUE INDEX auth_sessions_token_hash_key
  ON auth_sessions (session_token_hash)
  WHERE session_token_hash IS NOT NULL;

-- Sessions must be invalidatable (logout, password reset, admin revoke,
-- suspend/disable) -- the table only had SELECT/INSERT policies before.
CREATE POLICY auth_sessions_update_tenant ON auth_sessions
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

-- Authenticating an incoming request from its Bearer session token has no
-- tenant context yet (that's the whole point -- the token is how tenant
-- context gets established). Same session-local-GUC exact-match pattern
-- as the other public lookups above.
CREATE POLICY auth_sessions_select_public_token ON auth_sessions
  FOR SELECT
  USING (
    current_agency_id() IS NULL
    AND session_token_hash = NULLIF(current_setting('app.session_lookup_hash', TRUE), '')
  );

-- ============================================================
-- Forgot/reset password: high-entropy, hashed, single-use, short expiry.
-- Mirrors the enrollment_links / invitations token pattern exactly.
-- ============================================================
CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  requested_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT password_reset_tokens_user_agency_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash)
);

CREATE INDEX password_reset_tokens_user_active_idx
  ON password_reset_tokens (user_id)
  WHERE used_at IS NULL;

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY password_reset_tokens_select_tenant ON password_reset_tokens
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY password_reset_tokens_insert_tenant ON password_reset_tokens
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY password_reset_tokens_update_tenant ON password_reset_tokens
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());

-- Public reset flow: the caller (an anonymous visitor with a raw token
-- from their email) has no tenant context yet. Mirrors invitations'
-- app.invitation_lookup_hash pattern exactly -- only the single row whose
-- token_hash matches the session-local lookup hash is ever exposed or
-- updatable, so a caller who doesn't know the token cannot enumerate or
-- touch any reset request.
CREATE POLICY password_reset_tokens_select_public_token ON password_reset_tokens
  FOR SELECT
  USING (
    current_agency_id() IS NULL
    AND token_hash = NULLIF(current_setting('app.password_reset_lookup_hash', TRUE), '')
  );

CREATE POLICY password_reset_tokens_update_public_token ON password_reset_tokens
  FOR UPDATE
  USING (
    current_agency_id() IS NULL
    AND token_hash = NULLIF(current_setting('app.password_reset_lookup_hash', TRUE), '')
  )
  WITH CHECK (
    current_agency_id() IS NULL
    AND token_hash = NULLIF(current_setting('app.password_reset_lookup_hash', TRUE), '')
  );

REVOKE ALL ON password_reset_tokens FROM PUBLIC;

-- ============================================================
-- Login needs to resolve "which agency" before any tenant context
-- exists. Same session-local-GUC exact-match pattern as the token
-- lookups above, applied to agencies.slug: the caller sets
-- app.agency_slug_lookup to the exact slug they were given, and only
-- that single row is ever exposed -- not a scan, not an enumerable
-- listing. (Once the agency_id is resolved, every subsequent query in
-- the login flow uses withAgencyTransaction/set_tenant_context, so the
-- ordinary tenant-scoped users_select_tenant policy applies to reading
-- the user row -- no separate public users policy is needed.)
-- ============================================================
CREATE POLICY agencies_select_public_slug ON agencies
  FOR SELECT
  USING (
    current_agency_id() IS NULL
    AND slug = NULLIF(current_setting('app.agency_slug_lookup', TRUE), '')
  );

