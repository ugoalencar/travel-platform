-- ============================================================
-- PROPOSAL VISUAL 2.0 -- proposal_sections
-- ============================================================
-- Smallest structure that lets a Proposal be rich and ordered, per the
-- audit in docs/product/PROPOSAL_CONTENT_MODEL.md: Proposal ->
-- ProposalSection -> ProposalItem (090_proposal_items.sql). Not a
-- generic page builder -- `type` is a closed enum of the sections the
-- product actually uses; a proposal only has the sections staff add,
-- never all of them by default.
-- ============================================================

CREATE TYPE "ProposalSectionType" AS ENUM (
  'OVERVIEW',
  'DESTINATIONS',
  'TRANSPORT',
  'ACCOMMODATION',
  'EXPERIENCES',
  'ITINERARY',
  'INCLUSIONS',
  'EXCLUSIONS',
  'COMMERCIAL_TERMS',
  'PAYMENT_OPTIONS',
  'MEDIA',
  'DOCUMENTS',
  'NOTES'
);

CREATE TABLE proposal_sections (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id               TEXT NOT NULL,
  proposal_id             TEXT NOT NULL,
  type                    "ProposalSectionType" NOT NULL,
  title                   TEXT NOT NULL,
  description             TEXT,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  is_visible_to_customer  BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT proposal_sections_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT proposal_sections_proposal_tenant_fk
    FOREIGN KEY (agency_id, proposal_id) REFERENCES proposals (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT proposal_sections_title_not_blank_check CHECK (length(trim(title)) > 0),
  CONSTRAINT proposal_sections_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX proposal_sections_agency_proposal_idx
  ON proposal_sections (agency_id, proposal_id, sort_order);

ALTER TABLE proposal_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_sections FORCE ROW LEVEL SECURITY;

CREATE POLICY proposal_sections_select_tenant ON proposal_sections
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY proposal_sections_insert_tenant ON proposal_sections
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY proposal_sections_update_tenant ON proposal_sections
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY proposal_sections_delete_tenant ON proposal_sections
  FOR DELETE USING (agency_id = current_agency_id());

REVOKE ALL ON proposal_sections FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime_local') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON proposal_sections TO travel_app_runtime_local;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON proposal_sections TO travel_app_runtime;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
