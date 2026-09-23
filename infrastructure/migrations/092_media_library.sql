-- ============================================================
-- MEDIA LIBRARY -- central, agency-owned asset library
-- ============================================================
-- Corrects the direction taken by Proposal Visual 2.0's proposal_media
-- (091): media should not be owned exclusively by a single Proposal.
-- It belongs to a central library the agency (Marketing/staff)
-- administers, and Offer/Proposal/Communication (and future banners)
-- reference it -- the same file is never duplicated in storage for
-- reuse across entities.
--
-- Reuses the existing secure_file_key + file-storage.ts contract
-- (same one trip_photos/proposal_media/document_attachments already
-- use) -- no new storage abstraction, no DAM system.
--
-- Two tables:
--   media_assets       -- the asset itself (one row per uploaded file)
--   media_asset_links  -- "this asset is used by this entity, this way"
--
-- entity_id in media_asset_links is intentionally NOT a foreign key --
-- it is polymorphic across Offer/Proposal/Communication, and a single
-- composite FK cannot target "one of several tables". Ownership of the
-- referenced entity is re-validated in application code
-- (services/api/src/media-library.ts) before any link is created.
-- ============================================================

CREATE TYPE "MediaAssetType" AS ENUM ('IMAGE');
-- VIDEO/DOCUMENT documented as future asset types (Fase 1) -- not
-- implemented now, no real use identified yet.

CREATE TYPE "MediaAssetStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TYPE "MediaAssetSource" AS ENUM ('UPLOAD');
-- IMPORT/SUPPLIER/SYSTEM documented as future sources -- not
-- implemented now.

CREATE TYPE "MediaAssetUsageContext" AS ENUM ('OFFER', 'PROPOSAL', 'COMMUNICATION');

CREATE TYPE "MediaAssetUsageKind" AS ENUM ('COVER', 'GALLERY');

CREATE TABLE media_assets (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id        TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  asset_type       "MediaAssetType" NOT NULL DEFAULT 'IMAGE',
  mime_type        TEXT NOT NULL,
  file_size_bytes  BIGINT NOT NULL,
  secure_file_key  TEXT NOT NULL,
  width            INTEGER,
  height           INTEGER,
  alt_text         TEXT,
  tags             TEXT[] NOT NULL DEFAULT '{}',
  status           "MediaAssetStatus" NOT NULL DEFAULT 'ACTIVE',
  source           "MediaAssetSource" NOT NULL DEFAULT 'UPLOAD',
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at      TIMESTAMPTZ,

  CONSTRAINT media_assets_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT media_assets_created_by_tenant_fk
    FOREIGN KEY (agency_id, created_by) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT media_assets_title_not_blank_check CHECK (length(trim(title)) > 0),
  CONSTRAINT media_assets_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX media_assets_agency_status_idx ON media_assets (agency_id, status, created_at DESC);
CREATE INDEX media_assets_agency_tags_idx ON media_assets USING GIN (tags);

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets FORCE ROW LEVEL SECURITY;

CREATE POLICY media_assets_select_tenant ON media_assets
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY media_assets_insert_tenant ON media_assets
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY media_assets_update_tenant ON media_assets
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY media_assets_delete_tenant ON media_assets
  FOR DELETE USING (agency_id = current_agency_id());

REVOKE ALL ON media_assets FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime_local') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON media_assets TO travel_app_runtime_local;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON media_assets TO travel_app_runtime;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- media_asset_links -- "asset X is used by entity Y, as Z"
-- ============================================================

CREATE TABLE media_asset_links (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id       TEXT NOT NULL,
  media_asset_id  TEXT NOT NULL,
  entity_type     "MediaAssetUsageContext" NOT NULL,
  entity_id       TEXT NOT NULL,
  usage           "MediaAssetUsageKind" NOT NULL DEFAULT 'GALLERY',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT media_asset_links_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT media_asset_links_asset_tenant_fk
    FOREIGN KEY (agency_id, media_asset_id) REFERENCES media_assets (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT media_asset_links_agency_id_key UNIQUE (agency_id, id)
);

-- A given asset can only be linked once to the same entity in the same
-- usage slot (prevents accidental duplicate gallery entries and makes
-- "set cover" a plain upsert-by-conflict).
CREATE UNIQUE INDEX media_asset_links_unique_slot_idx
  ON media_asset_links (agency_id, entity_type, entity_id, media_asset_id, usage);

CREATE INDEX media_asset_links_entity_idx
  ON media_asset_links (agency_id, entity_type, entity_id, sort_order);
CREATE INDEX media_asset_links_asset_idx
  ON media_asset_links (agency_id, media_asset_id);

ALTER TABLE media_asset_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_asset_links FORCE ROW LEVEL SECURITY;

CREATE POLICY media_asset_links_select_tenant ON media_asset_links
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY media_asset_links_insert_tenant ON media_asset_links
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY media_asset_links_update_tenant ON media_asset_links
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY media_asset_links_delete_tenant ON media_asset_links
  FOR DELETE USING (agency_id = current_agency_id());

REVOKE ALL ON media_asset_links FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime_local') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON media_asset_links TO travel_app_runtime_local;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON media_asset_links TO travel_app_runtime;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
