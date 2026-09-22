-- ============================================================
-- PROPOSAL VISUAL 2.0 -- proposal_items
-- ============================================================
-- Content inside a proposal_section. Only the fields the audit found a
-- real use for -- no metadata JSONB, no start_time/end_time/quantity,
-- per the explicit "não adicionar campos cegamente" instruction.
--
-- day_number is specific to ITINERARY_DAY items ("Dia 1", "Dia 2" --
-- the simple commercial itinerary summary from Fase 5, NOT the full
-- operational Day-by-Day, which is a separate future round).
--
-- reference_type/reference_id let an item optionally point at an
-- existing entity (e.g. an Excursion) without copying its content --
-- deliberately NOT a foreign key, since it is polymorphic across
-- different tenant-scoped tables (a single composite FK can't target
-- "any of several tables"); ownership of the referenced entity is
-- re-validated in application code when reference_id is set. price is
-- captured on the item itself at the time it's added -- this IS the
-- commercial snapshot (see docs/product/PROPOSAL_CONTENT_MODEL.md):
-- if the referenced entity's price changes later, the already-built
-- proposal never silently changes.
-- ============================================================

CREATE TYPE "ProposalItemType" AS ENUM (
  'TEXT',
  'DESTINATION',
  'TRANSPORT',
  'ACCOMMODATION',
  'EXPERIENCE',
  'ITINERARY_DAY',
  'INCLUSION',
  'EXCLUSION',
  'CONDITION',
  'PAYMENT_OPTION',
  'IMAGE'
);

CREATE TABLE proposal_items (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id             TEXT NOT NULL,
  proposal_section_id   TEXT NOT NULL,
  type                  "ProposalItemType" NOT NULL,
  title                 TEXT,
  description           TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  day_number            INTEGER,
  location_name         TEXT,
  price                 NUMERIC(10, 2),
  reference_type        TEXT,
  reference_id          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT proposal_items_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT proposal_items_section_tenant_fk
    FOREIGN KEY (agency_id, proposal_section_id) REFERENCES proposal_sections (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT proposal_items_price_non_negative_check CHECK (price IS NULL OR price >= 0),
  CONSTRAINT proposal_items_day_number_positive_check CHECK (day_number IS NULL OR day_number > 0),
  CONSTRAINT proposal_items_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX proposal_items_agency_section_idx
  ON proposal_items (agency_id, proposal_section_id, sort_order);

ALTER TABLE proposal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_items FORCE ROW LEVEL SECURITY;

CREATE POLICY proposal_items_select_tenant ON proposal_items
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY proposal_items_insert_tenant ON proposal_items
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY proposal_items_update_tenant ON proposal_items
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY proposal_items_delete_tenant ON proposal_items
  FOR DELETE USING (agency_id = current_agency_id());

REVOKE ALL ON proposal_items FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime_local') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON proposal_items TO travel_app_runtime_local;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON proposal_items TO travel_app_runtime;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
