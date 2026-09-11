-- ============================================================
-- AGENCY BRANDING + DEPARTMENTS (Tenant Self-Service wave 1)
-- ============================================================
-- Branding fields are additive columns on `agencies` (already tenant-
-- scoped via RLS in 002_rls_policies.sql, keyed on id = agency).
-- `departments` is a new tenant-scoped table with its own RLS.
-- ============================================================

-- PART 1: Branding fields on agencies
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS primary_color TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS onboarding_step TEXT;

-- PART 2: Departments (tenant-scoped)
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT departments_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies (id),
  CONSTRAINT departments_agency_name_key UNIQUE (agency_id, name)
);

CREATE INDEX IF NOT EXISTS departments_agency_id_idx ON departments (agency_id);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS departments_select_tenant ON departments;
DROP POLICY IF EXISTS departments_insert_tenant ON departments;
DROP POLICY IF EXISTS departments_update_tenant ON departments;
DROP POLICY IF EXISTS departments_delete_tenant ON departments;

CREATE POLICY departments_select_tenant ON departments
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY departments_insert_tenant ON departments
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY departments_update_tenant ON departments
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY departments_delete_tenant ON departments
  FOR DELETE
  USING (agency_id = current_agency_id());
