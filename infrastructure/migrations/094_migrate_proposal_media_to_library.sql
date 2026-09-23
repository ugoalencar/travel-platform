-- ============================================================
-- MEDIA LIBRARY -- migrate proposal_media into the central library
-- ============================================================
-- proposal_media (091_proposal_media.sql) was Proposal Visual 2.0's
-- per-proposal-only upload table -- superseded by the Media Library.
-- Confirmed via audit: no demo-seed script ever populated
-- proposal_media (grep across scripts/seed-*.cjs found zero
-- references), so this is the newest, least-depended-on table in the
-- schema. Even so, this migration copies any existing rows (e.g. from
-- local manual QA) into media_assets + media_asset_links rather than
-- assuming the table is empty -- no data is dropped.
--
-- Each proposal_media row becomes:
--   1. a media_assets row (title falls back to the original file_name,
--      since proposal_media never had a title field)
--   2. a media_asset_links row (entity_type = 'PROPOSAL',
--      entity_id = proposal_id, usage = COVER if is_cover else
--      GALLERY, same sort_order)
--
-- proposal_media is then dropped -- services/api/src/media-library.ts
-- is now the only path for proposal media (see
-- services/api/src/proposal-content.ts, which no longer defines its
-- own media functions after this round).
-- ============================================================

INSERT INTO media_assets
  (id, agency_id, title, asset_type, mime_type, file_size_bytes, secure_file_key,
   status, source, created_at, updated_at, archived_at)
SELECT
  id,
  agency_id,
  file_name,
  'IMAGE',
  file_mime_type,
  file_size_bytes,
  secure_file_key,
  CASE WHEN deleted_at IS NULL THEN 'ACTIVE' ELSE 'ARCHIVED' END::"MediaAssetStatus",
  'UPLOAD',
  created_at,
  created_at,
  deleted_at
FROM proposal_media;

INSERT INTO media_asset_links
  (agency_id, media_asset_id, entity_type, entity_id, usage, sort_order, created_at)
SELECT
  agency_id,
  id,
  'PROPOSAL',
  proposal_id,
  CASE WHEN is_cover THEN 'COVER' ELSE 'GALLERY' END::"MediaAssetUsageKind",
  sort_order,
  created_at
FROM proposal_media
WHERE deleted_at IS NULL;

DROP TABLE proposal_media;
