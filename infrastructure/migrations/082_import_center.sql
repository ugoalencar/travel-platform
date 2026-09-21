-- ============================================================
-- MIGRATION 082: Import Center — import_jobs + import_mapping_templates
-- ============================================================
-- Tracks file import jobs for the Centro de Implantação.
-- Each job is tenant-scoped, auditable, and idempotent.
--
-- Pipeline: Upload → Parse → Map → Normalize → Validate →
--           DryRun → Preview → Confirm → Import → Audit
--
-- SECURITY: RLS enforced via travel_app_runtime role grants.
-- ============================================================

-- ENUM for import job status
DO $$ BEGIN
  CREATE TYPE import_job_status AS ENUM (
    'UPLOADING',      -- File uploaded, not yet parsed
    'PARSING',        -- File being parsed (CSV/XLSX)
    'MAPPED',         -- Column mapping applied
    'VALIDATING',     -- Business rules validation
    'DRY_RUN',        -- Dry run complete, preview available
    'CONFIRMED',      -- User confirmed import
    'IMPORTING',      -- Rows being inserted
    'COMPLETED',      -- Import finished successfully
    'FAILED',         -- Import failed
    'CANCELLED'       -- User cancelled before confirm
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ENUM for import entity type
DO $$ BEGIN
  CREATE TYPE import_entity_type AS ENUM (
    'CUSTOMER',
    'SUPPLIER',
    'EMPLOYEE',
    'TAG',
    'WISH',
    'OFFER',
    'PROPOSAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ENUM for row classification during import
DO $$ BEGIN
  CREATE TYPE import_row_class AS ENUM (
    'NEW',              -- No match found; will create
    'MATCHED',          -- Exact match by unique identifier
    'POSSIBLE_DUPLICATE', -- Similar but not exact; needs review
    'INVALID'           -- Failed validation; will be skipped
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- import_jobs: One row per file upload / import attempt
-- ============================================================
CREATE TABLE IF NOT EXISTS import_jobs (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id       TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by      TEXT NOT NULL REFERENCES users(id),

  -- Source file info
  entity_type     import_entity_type NOT NULL,
  source_system   TEXT,                          -- e.g. 'csv', 'xlsx', 'salesforce', 'hubspot'
  original_filename TEXT NOT NULL,               -- User's original file name
  storage_key     TEXT NOT NULL,                 -- Supabase Storage key (bucket/path)

  -- Status tracking
  status          import_job_status NOT NULL DEFAULT 'UPLOADING',

  -- Mapping (JSON: { "source_column": "target_field" })
  mapping         JSONB DEFAULT '{}'::jsonb,

  -- Row counts
  total_rows      INTEGER DEFAULT 0,
  valid_rows      INTEGER DEFAULT 0,
  warning_rows    INTEGER DEFAULT 0,
  error_rows      INTEGER DEFAULT 0,
  created_rows    INTEGER DEFAULT 0,
  updated_rows    INTEGER DEFAULT 0,
  skipped_rows    INTEGER DEFAULT 0,

  -- Error details (JSON array of { row, column, message, severity })
  errors          JSONB DEFAULT '[]'::jsonb,

  -- Dry run preview (JSON array of first N rows with classification)
  preview         JSONB DEFAULT '[]'::jsonb,

  -- Audit
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE import_jobs IS 'Tracks file import jobs for the Centro de Implantação. Tenant-scoped via agency_id RLS.';

-- ============================================================
-- import_mapping_templates: Reusable column mappings
-- ============================================================
CREATE TABLE IF NOT EXISTS import_mapping_templates (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id       TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by      TEXT NOT NULL REFERENCES users(id),

  name            TEXT NOT NULL,                  -- e.g. 'Clientes Salesforce'
  entity_type     import_entity_type NOT NULL,
  mapping         JSONB NOT NULL,                 -- { "source_column": "target_field" }
  source_system   TEXT,                           -- e.g. 'salesforce', 'csv', 'manual'

  is_default      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (agency_id, name, entity_type)
);

COMMENT ON TABLE import_mapping_templates IS 'Reusable column mapping templates for import jobs.';

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_import_jobs_agency_status ON import_jobs (agency_id, status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_agency_entity ON import_jobs (agency_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_by ON import_jobs (created_by);
CREATE INDEX IF NOT EXISTS idx_import_mapping_templates_agency ON import_mapping_templates (agency_id, entity_type);

-- ============================================================
-- RLS policies
-- ============================================================
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE import_mapping_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_mapping_templates FORCE ROW LEVEL SECURITY;

-- Tenant isolation policies (same pattern as 081_customer_segments.sql)
CREATE POLICY import_jobs_select_tenant ON import_jobs
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY import_jobs_insert_tenant ON import_jobs
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY import_jobs_update_tenant ON import_jobs
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY import_jobs_delete_tenant ON import_jobs
  FOR DELETE USING (agency_id = current_agency_id());

CREATE POLICY import_mapping_templates_select_tenant ON import_mapping_templates
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY import_mapping_templates_insert_tenant ON import_mapping_templates
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY import_mapping_templates_update_tenant ON import_mapping_templates
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY import_mapping_templates_delete_tenant ON import_mapping_templates
  FOR DELETE USING (agency_id = current_agency_id());

-- ============================================================
-- Grants (same pattern as migrations 077-081)
-- ============================================================
DO $$ DECLARE
  runtime_role TEXT;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['travel_app_runtime_local', 'travel_app_runtime']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON import_jobs TO %I', runtime_role);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON import_mapping_templates TO %I', runtime_role);
      EXECUTE format('GRANT USAGE ON TYPE import_job_status TO %I', runtime_role);
      EXECUTE format('GRANT USAGE ON TYPE import_entity_type TO %I', runtime_role);
      EXECUTE format('GRANT USAGE ON TYPE import_row_class TO %I', runtime_role);
    END IF;
  END LOOP;
END $$;
