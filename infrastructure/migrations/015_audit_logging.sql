-- ============================================================
-- SECURITY AUDIT LOGGING
-- Additive, tenant-scoped, append-only evidence for sensitive actions.
-- Runtime access is intentionally limited to SELECT and INSERT by the
-- runtime-role provisioning procedure; no UPDATE or DELETE policy exists.
-- ============================================================

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  outcome TEXT NOT NULL DEFAULT 'SUCCESS',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  CONSTRAINT audit_logs_actor_type_check
    CHECK (actor_type IN ('USER', 'CUSTOMER', 'SYSTEM', 'ANONYMOUS', 'PLATFORM')),
  CONSTRAINT audit_logs_event_type_check
    CHECK (event_type ~ '^[A-Z][A-Z0-9_]{2,127}$'),
  CONSTRAINT audit_logs_entity_type_check
    CHECK (entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT audit_logs_outcome_check
    CHECK (outcome IN ('SUCCESS', 'FAILURE', 'BLOCKED')),
  CONSTRAINT audit_logs_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX audit_logs_agency_occurred_at_idx
  ON audit_logs (agency_id, occurred_at DESC, id DESC);
CREATE INDEX audit_logs_agency_event_occurred_at_idx
  ON audit_logs (agency_id, event_type, occurred_at DESC, id DESC);
CREATE INDEX audit_logs_agency_entity_occurred_at_idx
  ON audit_logs (agency_id, entity_type, entity_id, occurred_at DESC, id DESC)
  WHERE entity_id IS NOT NULL;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select_tenant ON audit_logs
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY audit_logs_insert_tenant ON audit_logs
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

-- New tables have no implicit public data privileges. Runtime role
-- provisioning must grant only SELECT and INSERT on audit_logs; UPDATE and
-- DELETE remain revoked so audit evidence cannot be modified or erased by
-- application traffic.
REVOKE ALL ON audit_logs FROM PUBLIC;
