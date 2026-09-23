-- ============================================================
-- MEDIA LIBRARY -- Offer/Communication cover asset reference
-- ============================================================
-- Offer.image_url and AgencyCommunication.image_url are kept as-is
-- (raw URL columns, Fase 8/9's "não remover compatibilidade
-- imediatamente") -- they remain a manual-URL fallback. This adds a
-- nullable cover_media_asset_id so staff can instead select a Media
-- Library asset as the cover; application code prefers the resolved
-- asset over the raw URL when both are present (see
-- docs/product/MEDIA_ASSET_USAGE.md).
-- ============================================================

ALTER TABLE offers ADD COLUMN cover_media_asset_id TEXT;
ALTER TABLE offers
  ADD CONSTRAINT offers_cover_media_asset_tenant_fk
    FOREIGN KEY (agency_id, cover_media_asset_id) REFERENCES media_assets (agency_id, id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE agency_communications ADD COLUMN cover_media_asset_id TEXT;
ALTER TABLE agency_communications
  ADD CONSTRAINT agency_communications_cover_media_asset_tenant_fk
    FOREIGN KEY (agency_id, cover_media_asset_id) REFERENCES media_assets (agency_id, id)
    ON DELETE SET NULL ON UPDATE CASCADE;
