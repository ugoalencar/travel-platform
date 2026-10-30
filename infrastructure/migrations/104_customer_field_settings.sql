-- ============================================================
-- CUSTOMER FIELD SETTINGS (Frente 2, ADR-008)
-- ============================================================
-- Per-agency configuration of the customer registration form: which
-- fields are enabled and which are required. The field registry lives in
-- code (services/api/src/customer-field-settings.ts); no row means
-- "enabled, optional". `name` is locked and never stored here.
-- Disabling a field never deletes stored customer data. Additive only.
-- ============================================================

CREATE TABLE customer_field_settings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL REFERENCES agencies (id),
  field_key TEXT NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]*$' AND field_key <> 'name'),
  enabled BOOLEAN NOT NULL DEFAULT true,
  required BOOLEAN NOT NULL DEFAULT false,
  updated_by_user_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT customer_field_settings_required_enabled_check CHECK (NOT required OR enabled),
  CONSTRAINT customer_field_settings_unique UNIQUE (agency_id, field_key)
);

ALTER TABLE customer_field_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_field_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_field_settings_select_tenant ON customer_field_settings
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY customer_field_settings_insert_tenant ON customer_field_settings
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY customer_field_settings_update_tenant ON customer_field_settings
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());

REVOKE ALL ON customer_field_settings FROM PUBLIC;

INSERT INTO schema_migrations (version) VALUES ('104') ON CONFLICT (version) DO NOTHING;
