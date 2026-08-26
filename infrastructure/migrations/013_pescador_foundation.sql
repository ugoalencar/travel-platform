-- ============================================================
-- Pescador Foundation V1
-- ============================================================

CREATE TYPE "ExternalOfferCaptureStatus" AS ENUM (
  'CAPTURED',
  'NORMALIZED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'PUBLISHED'
);

CREATE TABLE external_offer_captures (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_content TEXT NOT NULL,
  normalized_title TEXT,
  normalized_description TEXT,
  found_price NUMERIC(10,2),
  currency TEXT,
  valid_until TIMESTAMPTZ,
  status "ExternalOfferCaptureStatus" NOT NULL DEFAULT 'CAPTURED',
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id TEXT,
  published_offer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT external_offer_captures_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT external_offer_captures_reviewed_by_user_tenant_fk
    FOREIGN KEY (agency_id, reviewed_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT external_offer_captures_published_offer_tenant_fk
    FOREIGN KEY (agency_id, published_offer_id) REFERENCES offers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT external_offer_captures_source_url_not_blank_check
    CHECK (length(trim(source_url)) > 0),
  CONSTRAINT external_offer_captures_source_name_not_blank_check
    CHECK (length(trim(source_name)) > 0),
  CONSTRAINT external_offer_captures_raw_content_not_blank_check
    CHECK (length(trim(raw_content)) > 0),
  CONSTRAINT external_offer_captures_found_price_non_negative_check
    CHECK (found_price IS NULL OR found_price >= 0),
  CONSTRAINT external_offer_captures_publish_check
    CHECK (
      (status <> 'PUBLISHED' AND published_offer_id IS NULL)
      OR (status = 'PUBLISHED' AND published_offer_id IS NOT NULL)
    ),
  CONSTRAINT external_offer_captures_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT external_offer_captures_agency_source_url_key UNIQUE (agency_id, source_url)
);

CREATE INDEX external_offer_captures_agency_status_idx
  ON external_offer_captures (agency_id, status, created_at);
CREATE INDEX external_offer_captures_agency_reviewed_by_idx
  ON external_offer_captures (agency_id, reviewed_by_user_id);
CREATE INDEX external_offer_captures_agency_published_offer_idx
  ON external_offer_captures (agency_id, published_offer_id);

ALTER TABLE external_offer_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_offer_captures FORCE ROW LEVEL SECURITY;

CREATE POLICY external_offer_captures_select_tenant ON external_offer_captures
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY external_offer_captures_insert_tenant ON external_offer_captures
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY external_offer_captures_update_tenant ON external_offer_captures
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY external_offer_captures_delete_tenant ON external_offer_captures
  FOR DELETE USING (agency_id = current_agency_id());
