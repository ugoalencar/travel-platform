-- ============================================================
-- OCR: PER-FIELD CONFIDENCE
-- ============================================================
-- NON_NEGOTIABLES.md (OCR section) requires confidence to be tracked per
-- field, not only as a single overall score, so a reviewer can tell a
-- 98%-confidence document number apart from a 40%-confidence birth date
-- extracted off the same document. This is purely additive: the existing
-- `confidence` column keeps carrying the provider's overall score, and this
-- column is nullable so providers that only report an overall score (the
-- mock included) keep working unchanged.

ALTER TABLE document_extractions
  ADD COLUMN field_confidence JSONB;

COMMENT ON COLUMN document_extractions.field_confidence IS
  'Optional per-field confidence map (0-100) keyed by the same field names as extracted_data. Null when the provider only reports one overall confidence score.';
