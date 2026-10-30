-- ============================================================
-- USER PERMISSION OVERRIDES (SEC-01, ADR-009)
-- ============================================================
-- Per-user GRANT/REVOKE on top of the fixed role hierarchy.
-- Precedence (enforced in services/api/src/permissions/resolver.ts):
--   restriction (permission_restrictions / REVOKE) > GRANT > role.
-- GRANT and REVOKE for the same key cannot coexist (UNIQUE).
-- OWNER/ADMIN users cannot hold overrides (trigger below + API check).
-- No UPDATE policy: changing an override is DELETE + INSERT (audited).
-- Additive only; agent_area_grants and permission_restrictions are untouched.
-- ============================================================

CREATE TABLE user_permission_overrides (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('GRANT', 'REVOKE')),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 300),
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_permission_overrides_user_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT user_permission_overrides_unique UNIQUE (agency_id, user_id, resource, action)
);

CREATE INDEX user_permission_overrides_user_idx
  ON user_permission_overrides (agency_id, user_id);

CREATE OR REPLACE FUNCTION user_permission_overrides_reject_privileged()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users
     WHERE agency_id = NEW.agency_id AND id = NEW.user_id AND role IN ('OWNER', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'OWNER/ADMIN users cannot hold permission overrides'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_permission_overrides_reject_privileged_trg
  BEFORE INSERT ON user_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION user_permission_overrides_reject_privileged();

ALTER TABLE user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permission_overrides FORCE ROW LEVEL SECURITY;

CREATE POLICY user_permission_overrides_select_tenant ON user_permission_overrides
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY user_permission_overrides_insert_tenant ON user_permission_overrides
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY user_permission_overrides_delete_tenant ON user_permission_overrides
  FOR DELETE USING (agency_id = current_agency_id());

REVOKE ALL ON user_permission_overrides FROM PUBLIC;

INSERT INTO schema_migrations (version) VALUES ('103') ON CONFLICT (version) DO NOTHING;
