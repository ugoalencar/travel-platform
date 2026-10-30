-- Commission engine cutover and explicit progressive tier calculation mode.
CREATE TABLE agency_commission_engine_settings (
  agency_id TEXT PRIMARY KEY REFERENCES agencies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  cutover_date DATE,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE employee_commission_rule_versions
  DROP CONSTRAINT ecrv_tier_mode_check,
  ADD CONSTRAINT ecrv_tier_mode_check CHECK (tier_mode IN ('MARGINAL', 'TOTAL'));

DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['travel_app_runtime', 'travel_app_runtime_local'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON agency_commission_engine_settings TO %I', role_name);
      EXECUTE format('GRANT INSERT ON employee_commission_rule_versions TO %I', role_name);
    END IF;
  END LOOP;
END $$;

ALTER TABLE agency_commission_engine_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_commission_engine_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_commission_engine_settings_select_tenant ON agency_commission_engine_settings
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY agency_commission_engine_settings_insert_tenant ON agency_commission_engine_settings
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY agency_commission_engine_settings_update_tenant ON agency_commission_engine_settings
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
REVOKE ALL ON agency_commission_engine_settings FROM PUBLIC;

INSERT INTO schema_migrations (version) VALUES ('112') ON CONFLICT (version) DO NOTHING;
