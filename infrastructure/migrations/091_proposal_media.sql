-- ============================================================
-- PROPOSAL VISUAL 2.0 -- proposal_media
-- ============================================================
-- Cover image + gallery for a proposal. Exact same pattern as
-- trip_photos (074_trip_photos.sql): metadata only, bytes live under a
-- server-minted secure_file_key via file-storage.ts. No new storage
-- abstraction, no DAM system -- this is the smallest structure that
-- fits, per Fase 3's explicit instruction.
--
-- is_cover marks the single image used as the proposal's cover; the
-- application layer enforces at most one cover per proposal (not a
-- DB constraint, to keep "set a new cover" a simple two-statement
-- update rather than needing deferred constraints).
-- ============================================================

CREATE TABLE proposal_media (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id         TEXT NOT NULL,
  proposal_id       TEXT NOT NULL,
  secure_file_key   TEXT NOT NULL,
  file_name         TEXT NOT NULL,
  file_mime_type    TEXT NOT NULL,
  file_size_bytes   BIGINT NOT NULL,
  caption           TEXT,
  is_cover          BOOLEAN NOT NULL DEFAULT false,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,

  CONSTRAINT proposal_media_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT proposal_media_proposal_tenant_fk
    FOREIGN KEY (agency_id, proposal_id) REFERENCES proposals (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT proposal_media_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX proposal_media_proposal_idx
  ON proposal_media (agency_id, proposal_id, sort_order) WHERE deleted_at IS NULL;

ALTER TABLE proposal_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_media FORCE ROW LEVEL SECURITY;

CREATE POLICY proposal_media_select_tenant ON proposal_media
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY proposal_media_insert_tenant ON proposal_media
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY proposal_media_update_tenant ON proposal_media
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY proposal_media_delete_tenant ON proposal_media
  FOR DELETE USING (agency_id = current_agency_id());

REVOKE ALL ON proposal_media FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime_local') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON proposal_media TO travel_app_runtime_local;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON proposal_media TO travel_app_runtime;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
