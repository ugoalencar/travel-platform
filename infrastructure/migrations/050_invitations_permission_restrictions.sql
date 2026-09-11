-- ============================================================
-- INVITATIONS + PERMISSION RESTRICTIONS (Tenant Self-Service wave 2)
-- ============================================================
-- Part 1: `invitations` -- pending invite-by-email state for staff who
-- have not yet accepted (active members already live in `users`).
-- High-entropy token, only its sha256 hash is ever persisted, generic
-- rejection for invalid/expired/revoked tokens (see services/api/src/
-- invitations.ts), mirroring the enrollment_links token pattern.
--
-- Part 2: `permission_restrictions` -- additive-only, tenant-scoped
-- narrowing of what a role may do WITHIN THAT TENANT. Never expands base
-- RBAC; OWNER/ADMIN cannot be restricted by this table (enforced both in
-- application code and by a CHECK constraint) to prevent tenant
-- self-lockout.
-- ============================================================

-- PART 1: Invitations
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role "UserRole" NOT NULL,
  token_hash TEXT NOT NULL,
  invited_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CONSTRAINT invitations_status_check CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_user_id TEXT,
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT invitations_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies (id),
  CONSTRAINT invitations_token_hash_key UNIQUE (token_hash)
);

-- At most one PENDING invitation per (agency, email) -- re-inviting must
-- revoke/expire the previous one first.
CREATE UNIQUE INDEX IF NOT EXISTS invitations_agency_email_pending_uidx
  ON invitations (agency_id, lower(email))
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS invitations_agency_id_idx ON invitations (agency_id);
CREATE INDEX IF NOT EXISTS invitations_token_hash_idx ON invitations (token_hash);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invitations_select_tenant ON invitations;
DROP POLICY IF EXISTS invitations_insert_tenant ON invitations;
DROP POLICY IF EXISTS invitations_update_tenant ON invitations;
DROP POLICY IF EXISTS invitations_select_public_token ON invitations;
DROP POLICY IF EXISTS invitations_update_public_token ON invitations;

-- Staff (tenant context established): full visibility/management scoped
-- to their own agency only.
CREATE POLICY invitations_select_tenant ON invitations
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY invitations_insert_tenant ON invitations
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY invitations_update_tenant ON invitations
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

-- Public accept flow: no tenant context exists yet (the invitee is not a
-- staff user). Mirrors enrollment_links' app.enrollment_lookup_hash
-- pattern -- the caller sets app.invitation_lookup_hash to the sha256 of
-- the token they were given, and this policy only ever exposes/updates
-- the single row matching that exact hash. A caller who does not know
-- the token cannot enumerate or touch any invitation.
CREATE POLICY invitations_select_public_token ON invitations
  FOR SELECT
  USING (
    current_agency_id() IS NULL
    AND token_hash = NULLIF(current_setting('app.invitation_lookup_hash', TRUE), '')
  );

CREATE POLICY invitations_update_public_token ON invitations
  FOR UPDATE
  USING (
    current_agency_id() IS NULL
    AND token_hash = NULLIF(current_setting('app.invitation_lookup_hash', TRUE), '')
  )
  WITH CHECK (
    current_agency_id() IS NULL
    AND token_hash = NULLIF(current_setting('app.invitation_lookup_hash', TRUE), '')
  );

-- PART 2: Permission restrictions (additive-only, never expands RBAC)
CREATE TABLE IF NOT EXISTS permission_restrictions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  role "UserRole" NOT NULL
    CONSTRAINT permission_restrictions_role_not_owner_admin_check
    CHECK (role NOT IN ('OWNER', 'ADMIN')),
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT permission_restrictions_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies (id),
  CONSTRAINT permission_restrictions_unique_key UNIQUE (agency_id, role, resource, action)
);

CREATE INDEX IF NOT EXISTS permission_restrictions_agency_id_idx ON permission_restrictions (agency_id);

ALTER TABLE permission_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_restrictions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permission_restrictions_select_tenant ON permission_restrictions;
DROP POLICY IF EXISTS permission_restrictions_insert_tenant ON permission_restrictions;
DROP POLICY IF EXISTS permission_restrictions_delete_tenant ON permission_restrictions;

CREATE POLICY permission_restrictions_select_tenant ON permission_restrictions
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY permission_restrictions_insert_tenant ON permission_restrictions
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY permission_restrictions_delete_tenant ON permission_restrictions
  FOR DELETE
  USING (agency_id = current_agency_id());
