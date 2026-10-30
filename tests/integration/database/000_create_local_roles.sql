-- Local-only runtime and platform roles must exist before migrations so
-- conditional grants in each migration are exercised by database tests.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime_local') THEN
    CREATE ROLE travel_app_runtime_local
      LOGIN PASSWORD 'travel_app_runtime_local_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_platform_local') THEN
    CREATE ROLE travel_app_platform_local
      LOGIN PASSWORD 'travel_app_platform_local_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
