-- Grants de runtime ausentes nas migrations 103, 104, 108 e 109.
-- Apenas os verbos usados pela API; tabelas append-only permanecem sem UPDATE/DELETE.
-- GRANT pode ser repetido. As politicas RLS e os triggers permanecem inalterados.
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['travel_app_runtime', 'travel_app_runtime_local'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT, INSERT, DELETE ON user_permission_overrides TO %I', role_name);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON customer_field_settings, payment_method_receipt_rules, dashboard_layouts TO %I', role_name);
      EXECUTE format('GRANT SELECT, INSERT ON commission_financial_profiles, commission_release_events TO %I', role_name);
    END IF;
  END LOOP;
END $$;

INSERT INTO schema_migrations (version) VALUES ('111') ON CONFLICT (version) DO NOTHING;
