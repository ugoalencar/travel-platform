-- ============================================================
-- PROPOSAL VISUAL 2.0 -- cover fields
-- ============================================================
-- Proposal Visual 2.0: evolves `proposals` from a simple commercial
-- record into a rich visual proposal. This migration adds only the
-- cover/summary fields (Fase 2) -- all nullable, purely additive, so
-- every existing proposal keeps working unchanged. The cover *image*
-- itself is NOT a column here -- it lives in `proposal_media`
-- (090_proposal_media.sql) as the row with is_cover = true, reusing
-- the trip_photos secure_file_key pattern instead of a raw URL column.
--
-- `published_at` supports Fase 10 (minimal immutability): set once,
-- when a proposal is first sent, and never cleared. It is NOT a full
-- versioning/snapshot engine -- see docs/product/PROPOSAL_VISUAL_2.md
-- for the documented, deliberately minimal decision: once a proposal
-- leaves DRAFT/SENT (i.e. becomes ACCEPTED/DECLINED/CANCELLED/EXPIRED),
-- its content (sections/items/media) becomes immutable, enforced in
-- application code (services/api/src/proposal-content.ts), not by a
-- database trigger.
-- ============================================================

ALTER TABLE proposals ADD COLUMN title TEXT;
ALTER TABLE proposals ADD COLUMN subtitle TEXT;
ALTER TABLE proposals ADD COLUMN destination_summary TEXT;
ALTER TABLE proposals ADD COLUMN travel_period TEXT;
ALTER TABLE proposals ADD COLUMN traveler_summary TEXT;
ALTER TABLE proposals ADD COLUMN intro_text TEXT;
ALTER TABLE proposals ADD COLUMN published_at TIMESTAMPTZ;
