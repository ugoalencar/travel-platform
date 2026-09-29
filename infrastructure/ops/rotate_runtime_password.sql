-- ============================================================
-- OPERATIONAL (not a migration): rotate the tenant runtime role password
-- ============================================================
-- Run as the database owner (Supabase: `postgres`) in step T2 of
-- docs/release/REMOTE_MIGRATION_RUNBOOK_084_095.md, BEFORE the API's
-- DATABASE_URL is switched to travel_app_runtime (T2.5). The previous
-- password lived in local .env files and is discarded.
--
-- Production logs DDL (log_statement = ddl): the plaintext password must
-- never be sent. Pass only the SCRAM-SHA-256 verifier computed locally:
--
--   RUNTIME_SCRAM="$(printf '%s' "$TRAVEL_APP_RUNTIME_PASSWORD" | node infrastructure/ops/scram_verifier.cjs)"
--   psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 \
--        -v runtime_password_scram="$RUNTIME_SCRAM" \
--        -f infrastructure/ops/rotate_runtime_password.sql
--
-- Refuses to run without the variable, with a non-verifier value, if the
-- role is missing, or if it has unsafe attributes. Only the password
-- changes: LOGIN/NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/
-- NOREPLICATION are asserted before and after.
-- ============================================================

\set ON_ERROR_STOP on
\set ECHO none

\if :{?runtime_password_scram}
\else
  \echo 'Refusing to run: pass -v runtime_password_scram=... (see header).'
  \quit
\endif

SELECT (:'runtime_password_scram' ~ '^SCRAM-SHA-256\$[0-9]+:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$') AS is_scram_verifier \gset
\if :is_scram_verifier
\else
  \echo 'Refusing to run: runtime_password_scram is not a SCRAM-SHA-256 verifier (plaintext is never accepted).'
  \quit
\endif

-- Fail before touching anything if the role is not exactly as required.
DO $$
DECLARE
  r RECORD;
BEGIN
  SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
    INTO r
    FROM pg_roles
   WHERE rolname = 'travel_app_runtime';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'travel_app_runtime does not exist';
  END IF;
  IF NOT r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole
     OR r.rolreplication OR r.rolbypassrls THEN
    RAISE EXCEPTION
      'travel_app_runtime has unsafe attributes (login=%, super=%, createdb=%, createrole=%, replication=%, bypassrls=%)',
      r.rolcanlogin, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls;
  END IF;
END $$;

ALTER ROLE travel_app_runtime PASSWORD :'runtime_password_scram';

SELECT rolname, rolcanlogin AS login, rolsuper AS super, rolbypassrls AS bypassrls,
       rolcreatedb AS createdb, rolcreaterole AS createrole, rolreplication AS replication
  FROM pg_roles
 WHERE rolname = 'travel_app_runtime'
   AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
   AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication;
