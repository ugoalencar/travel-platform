-- ============================================================
-- OPERATIONAL (not a migration): create the production platform role
-- ============================================================
-- Run ONCE per environment, as the database owner (Supabase: `postgres`),
-- BEFORE migration 095_platform_role_separation.sql. See
-- docs/release/REMOTE_MIGRATION_RUNBOOK_084_095.md.
--
-- Grants are intentionally absent: 095 clones the runtime role's grants
-- onto this role and adds the platform-table grants. Creating the role
-- grants nothing beyond LOGIN (plus the default PUBLIC privileges).
--
-- The password is never stored in this file. Supply it as a psql variable:
--
--   psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 \
--        -v platform_password="$TRAVEL_APP_PLATFORM_PASSWORD" \
--        -f infrastructure/ops/create_platform_role.sql
--
-- Re-running is safe: an existing role is left untouched (the script only
-- asserts its attributes afterwards).
-- ============================================================

\set ON_ERROR_STOP on

SELECT (NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_platform')) AS create_platform_role \gset

\if :create_platform_role
  CREATE ROLE travel_app_platform
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    NOBYPASSRLS
    PASSWORD :'platform_password';
\else
  \echo 'travel_app_platform already exists -- not modified.'
\endif

-- Fail loudly if the role (new or pre-existing) is not exactly as required.
DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
    INTO r
    FROM pg_roles
   WHERE rolname = 'travel_app_platform';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'travel_app_platform was not created';
  END IF;
  IF NOT r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole
     OR r.rolreplication OR r.rolbypassrls THEN
    RAISE EXCEPTION
      'travel_app_platform has unsafe attributes (login=%, super=%, createdb=%, createrole=%, replication=%, bypassrls=%)',
      r.rolcanlogin, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls;
  END IF;
END $$;

SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
  FROM pg_roles
 WHERE rolname IN ('travel_app_runtime', 'travel_app_platform')
 ORDER BY rolname;
