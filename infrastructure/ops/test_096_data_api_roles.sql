-- ============================================================
-- OPERATIONAL TEST (not a migration): behavioral Data API role test
-- ============================================================
-- NEVER run against production. It EXECUTES SELECT/INSERT/UPDATE/DELETE/
-- TRUNCATE as anon and authenticated on every public table (each attempt
-- inside a savepoint, whole run rolled back). Intended for the PG17 clone
-- of the production schema used by the dry run:
--   psql -v ON_ERROR_STOP=1 -v i_am_not_production=yes \
--        -v runtime_role=travel_app_runtime -v platform_role=travel_app_platform \
--        -f infrastructure/ops/test_096_data_api_roles.sql
-- Output: one row per role/operation with attempts / denied / allowed.
-- Expected after 096: allowed = 0 everywhere; regression rows = OK.
-- ============================================================

\set ON_ERROR_STOP on
\if :{?i_am_not_production}
\else
  \echo 'Refusing to run: pass -v i_am_not_production=yes (clone only).'
  \quit
\endif

BEGIN;

CREATE TEMP TABLE data_api_results (role TEXT, op TEXT, relname TEXT, outcome TEXT) ON COMMIT DROP;
GRANT INSERT ON data_api_results TO PUBLIC;

DO $$
DECLARE
  api_role TEXT;
  t RECORD;
  op TEXT;
  first_col TEXT;
  stmt TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY 1 LOOP
      SELECT quote_ident(attname) INTO first_col FROM pg_attribute
       WHERE attrelid = format('public.%I', t.relname)::regclass AND attnum > 0 AND NOT attisdropped
       ORDER BY attnum LIMIT 1;
      FOREACH op IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
        stmt := CASE op
          WHEN 'SELECT' THEN format('SELECT 1 FROM public.%I LIMIT 1', t.relname)
          WHEN 'INSERT' THEN format('INSERT INTO public.%I DEFAULT VALUES', t.relname)
          WHEN 'UPDATE' THEN format('UPDATE public.%I SET %s = %s WHERE false', t.relname, first_col, first_col)
          WHEN 'DELETE' THEN format('DELETE FROM public.%I WHERE false', t.relname)
          WHEN 'TRUNCATE' THEN format('TRUNCATE public.%I', t.relname)
        END;
        BEGIN
          EXECUTE format('SET LOCAL ROLE %I', api_role);
          EXECUTE stmt;
          RESET ROLE;
          INSERT INTO data_api_results VALUES (api_role, op, t.relname, 'ALLOWED');
          -- undo any effect of an allowed statement
          RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rollback-allowed';
        EXCEPTION
          WHEN insufficient_privilege THEN
            RESET ROLE;
            INSERT INTO data_api_results VALUES (api_role, op, t.relname, 'DENIED');
          WHEN raise_exception THEN
            RESET ROLE;
            INSERT INTO data_api_results VALUES (api_role, op, t.relname, 'ALLOWED');
          WHEN OTHERS THEN
            -- RLS policies are expanded at planning time, before the
            -- executor's privilege check, so a policy error (e.g. 42704 from
            -- current_setting without missing_ok) can surface first. Decide
            -- from the catalog whether the privilege itself exists.
            RESET ROLE;
            INSERT INTO data_api_results VALUES (api_role, op, t.relname,
              CASE WHEN has_table_privilege(api_role, format('public.%I', t.relname), op)
                   THEN 'ALLOWED(' || SQLSTATE || ')'
                   ELSE 'DENIED(planning ' || SQLSTATE || ')' END);
        END;
      END LOOP;
    END LOOP;

    -- SECURITY DEFINER RPC surface
    BEGIN
      EXECUTE format('SET LOCAL ROLE %I', api_role);
      PERFORM * FROM public.platform_search_agencies('');
      RESET ROLE;
      INSERT INTO data_api_results VALUES (api_role, 'EXECUTE', 'platform_search_agencies', 'ALLOWED');
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO data_api_results VALUES (api_role, 'EXECUTE', 'platform_search_agencies', 'DENIED');
    END;
  END LOOP;
END $$;

SELECT role, op,
       count(*) AS attempts,
       count(*) FILTER (WHERE outcome LIKE 'DENIED%') AS denied,
       count(*) FILTER (WHERE outcome NOT LIKE 'DENIED%') AS allowed
  FROM data_api_results
 GROUP BY role, op
 ORDER BY role, op;

SELECT role, op, relname, outcome FROM data_api_results WHERE outcome NOT LIKE 'DENIED%' ORDER BY 1, 2, 3 LIMIT 50;

-- Regression: legitimate roles keep working.
SET LOCAL ROLE :"runtime_role";
SELECT set_tenant_context('00000000-0000-0000-0000-000000000000', NULL);
SELECT 'runtime: set_tenant_context + SELECT offers' AS check_name,
       (SELECT count(*) >= 0 FROM public.offers) AS ok;
RESET ROLE;
SET LOCAL ROLE :"platform_role";
SELECT 'platform: SELECT platform_users + platform_search_agencies' AS check_name,
       (SELECT count(*) >= 0 FROM public.platform_users) AND
       (SELECT count(*) >= 0 FROM public.platform_search_agencies('')) AS ok;
RESET ROLE;
SELECT 'admin/migration role: SELECT platform_users' AS check_name,
       (SELECT count(*) >= 0 FROM public.platform_users) AS ok;

ROLLBACK;
