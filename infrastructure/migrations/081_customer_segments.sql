-- Migration: Segmentação Avançada de Clientes
-- Purpose: New tenant-scoped domain -- audited: no existing table stores
--          reusable customer filter rules (commercial_opportunities/
--          proposals/wishes/customer_interactions are all record-level
--          domains, not saved-filter domains). customer_segments is a
--          genuinely new, narrow table -- it does NOT duplicate
--          commercial_opportunities, commercial_partners, or any other
--          existing structure.
--
-- Segments store RULES (filter_definition JSONB), never a frozen member
-- list -- membership is always recomputed at read time by the backend
-- query builder in services/api/src/customer-segmentation.ts, which is
-- the only place allowed to turn filter_definition into SQL (allowlisted
-- fields/operators, always parameterized -- see that file's header).
-- Direction: up

CREATE TYPE customer_segment_scope AS ENUM ('PERSONAL', 'SHARED');

CREATE TABLE customer_segments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  scope customer_segment_scope NOT NULL DEFAULT 'PERSONAL',
  owner_employee_id TEXT,
  -- Kept for symmetry with `scope`; a SHARED segment with is_shared=false
  -- is meaningless, enforced below.
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  filter_definition JSONB NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,

  CONSTRAINT customer_segments_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_segments_owner_employee_tenant_fk
    FOREIGN KEY (agency_id, owner_employee_id) REFERENCES employees (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_segments_created_by_tenant_fk
    FOREIGN KEY (agency_id, created_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT customer_segments_name_not_blank_check
    CHECK (length(trim(name)) > 0),
  CONSTRAINT customer_segments_scope_is_shared_check
    CHECK (
      (scope = 'SHARED' AND is_shared = TRUE)
      OR
      (scope = 'PERSONAL' AND is_shared = FALSE)
    ),
  CONSTRAINT customer_segments_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX customer_segments_agency_idx ON customer_segments (agency_id);
CREATE INDEX customer_segments_agency_owner_idx ON customer_segments (agency_id, owner_employee_id);
CREATE INDEX customer_segments_agency_scope_idx ON customer_segments (agency_id, scope);
-- GIN index to support future JSONB field lookups/debugging; not required
-- by the current query builder (it never queries INTO filter_definition,
-- only reads it out to rebuild the WHERE clause in application code).
CREATE INDEX customer_segments_filter_definition_gin_idx
  ON customer_segments USING GIN (filter_definition);

ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_segments FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_segments_select_tenant ON customer_segments
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY customer_segments_insert_tenant ON customer_segments
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY customer_segments_update_tenant ON customer_segments
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY customer_segments_delete_tenant ON customer_segments
  FOR DELETE USING (agency_id = current_agency_id());

-- ============================================================
-- AUDIT LOG -- spec: "Registrar segment.created/updated/archived/shared".
-- Reuses the existing audit_logs table (see 001_initial_schema.sql /
-- 0xx audit migrations) rather than inventing a parallel audit table --
-- application code (customer-segments.ts) writes into audit_logs with
-- entity_type = 'customer_segment'.
-- ============================================================

-- Structured filter/city lookups: customer_addresses has no index on
-- (agency_id, city) today (audited); segmentation is the first caller
-- to filter by city at volume, so add it here rather than prematurely
-- guessing before this feature existed.
CREATE INDEX IF NOT EXISTS customer_addresses_agency_city_idx
  ON customer_addresses (agency_id, city)
  WHERE deleted_at IS NULL;

-- ============================================================
-- GRANTS -- same runtime role pattern as every prior migration.
-- ============================================================

DO $$
DECLARE
  runtime_role TEXT;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['travel_app_runtime_local', 'travel_app_runtime']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON customer_segments TO %I',
        runtime_role
      );
    END IF;
  END LOOP;
END $$;

-- DROP INDEX customer_addresses_agency_city_idx;
-- DROP TABLE customer_segments;
-- DROP TYPE customer_segment_scope;
