-- Agency-level optional module availability. No row means enabled to preserve
-- behavior for every existing and newly created agency.

CREATE TABLE agency_module_settings (
  agency_id TEXT NOT NULL,
  module_key TEXT NOT NULL CHECK (module_key IN (
    'PIPELINE', 'PESCADOR', 'CUSTOMER_INSIGHTS', 'INSURANCE', 'CAMPAIGNS',
    'CREATIVE_STUDIO', 'SOCIAL_PUBLISHING', 'SOCIAL_AUTOMATION',
    'COMMUNICATIONS', 'SALES_IMPORT', 'TRAVEL_OPERATIONS'
  )),
  enabled BOOLEAN NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agency_module_settings_pk PRIMARY KEY (agency_id, module_key),
  CONSTRAINT agency_module_settings_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE RESTRICT
);

ALTER TABLE agency_module_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_module_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY agency_module_settings_select_tenant ON agency_module_settings
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY agency_module_settings_insert_tenant ON agency_module_settings
  FOR INSERT WITH CHECK (agency_id = current_agency_id() AND updated_by = current_user_id());
CREATE POLICY agency_module_settings_update_tenant ON agency_module_settings
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id() AND updated_by = current_user_id());

REVOKE ALL ON agency_module_settings FROM PUBLIC;
DO $$
DECLARE runtime_role TEXT;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['travel_app_runtime', 'travel_app_runtime_local'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON agency_module_settings TO %I', runtime_role);
    END IF;
  END LOOP;
END $$;

INSERT INTO schema_migrations (version) VALUES ('117') ON CONFLICT (version) DO NOTHING;
