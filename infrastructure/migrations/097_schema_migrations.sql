-- ============================================================
-- 097: minimal applied-migrations registry (schema_migrations)
-- ============================================================
-- Until now there was no record of which migrations were applied: the
-- state was inferred from schema fingerprints, and GET /version could only
-- report the migration files shipped in the container. This table records
-- the schema version actually applied to THIS database; /version reads
-- max(version) from it.
--
-- Backfill: migrations are applied strictly in order and numbered without
-- gaps (001..096 exist), so when 097 runs every earlier migration has
-- already been applied. In production that was proven before this
-- migration by verify_084_095.sql (47/47) and verify_096_data_api.sql
-- (15/15). 097 registers itself as well.
--
-- Convention from 098 on: each migration ends with
--   INSERT INTO schema_migrations (version) VALUES ('NNN') ON CONFLICT DO NOTHING;
-- inside the same transaction, so the row exists only if the migration
-- committed.
--
-- Access: read-only for the application roles (the API reads it through
-- the platform pool; local single-pool setups use the runtime role).
-- Never granted to the Supabase Data API roles (anon/authenticated).
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY CHECK (version ~ '^[0-9]{3}$'),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version)
SELECT lpad(n::text, 3, '0')
FROM generate_series(1, 97) AS n
ON CONFLICT (version) DO NOTHING;

REVOKE ALL ON schema_migrations FROM PUBLIC;

DO $$
DECLARE
  app_role TEXT;
  api_role TEXT;
BEGIN
  FOREACH app_role IN ARRAY ARRAY[
    'travel_app_runtime', 'travel_app_platform',
    'travel_app_runtime_local', 'travel_app_platform_local'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
      EXECUTE format('GRANT SELECT ON schema_migrations TO %I', app_role);
    END IF;
  END LOOP;

  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON schema_migrations FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
