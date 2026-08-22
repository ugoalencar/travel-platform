-- Local-only role setup for RLS validation.
-- Run after migration 002 against the disposable PostgreSQL database.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime_local'
  ) THEN
    CREATE ROLE travel_app_runtime_local
      LOGIN
      PASSWORD 'travel_app_runtime_local_password'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS;
  END IF;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO travel_app_runtime_local;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  agencies,
  users,
  brokers,
  customers,
  customer_accounts,
  wishes,
  offers,
  proposals,
  sales,
  commissions,
  trips
TO travel_app_runtime_local;

-- Transportation tables (routes/suppliers/transport_products/scheduled_departures)
-- only exist once migration 003_transportation.sql has been applied. This script
-- is shared by every domain's test suite, and most of them only apply migrations
-- 001+002, so the grant below must not fail when those tables are absent.
DO $$
BEGIN
  IF to_regclass('public.routes') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      routes,
      suppliers,
      transport_products,
      scheduled_departures
    TO travel_app_runtime_local;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION current_agency_id() TO travel_app_runtime_local;
GRANT EXECUTE ON FUNCTION current_user_id() TO travel_app_runtime_local;
GRANT EXECUTE ON FUNCTION set_tenant_context(TEXT, TEXT) TO travel_app_runtime_local;
GRANT EXECUTE ON FUNCTION clear_tenant_context() TO travel_app_runtime_local;

SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
FROM pg_roles
WHERE rolname = 'travel_app_runtime_local';
