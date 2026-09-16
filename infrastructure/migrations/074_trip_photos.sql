-- ============================================================
-- TRIP PHOTOS
-- ============================================================
-- Requested directly, as part of the customer-portal gap analysis: "o
-- cliente gosta de imagens... cada viagem que ele consultar ter um
-- carrossel de fotos que veio da agência". Neither Trip nor any of its
-- related tables (AirService, LandService, Excursion) had any image
-- concept -- this adds a small photo gallery per trip that the agency
-- staff uploads and the customer portal renders as a carousel.
--
-- Metadata-only, same pattern as document_attachments: bytes live in
-- whatever object store file-storage.ts is configured against, addressed
-- by a server-minted secure_file_key never derived from the client's
-- filename. trip_id uses ON DELETE CASCADE (not SET NULL) since a
-- photo has no meaning once its trip is gone, and CASCADE on a composite
-- tenant FK does not hit the NOT NULL footgun ON DELETE SET NULL does
-- (see migration 073's fix note) -- it just deletes the row.
-- ============================================================

CREATE TABLE trip_photos (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id       TEXT NOT NULL,
  trip_id         TEXT NOT NULL,
  secure_file_key TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  file_mime_type  TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  caption         TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT trip_photos_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT trip_photos_trip_tenant_fk
    FOREIGN KEY (agency_id, trip_id) REFERENCES trips (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX trip_photos_trip_idx ON trip_photos (agency_id, trip_id, sort_order) WHERE deleted_at IS NULL;

ALTER TABLE trip_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_photos FORCE ROW LEVEL SECURITY;

CREATE POLICY trip_photos_select_tenant ON trip_photos
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY trip_photos_insert_tenant ON trip_photos
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY trip_photos_update_tenant ON trip_photos
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY trip_photos_delete_tenant ON trip_photos
  FOR DELETE USING (agency_id = current_agency_id());

REVOKE ALL ON trip_photos FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime_local') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON trip_photos TO travel_app_runtime_local;
  END IF;
END $$;
