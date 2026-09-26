-- ============================================================
-- OPERATIONAL (not a migration): read-only verification for 096
-- ============================================================
-- Catalog-only (has_*_privilege accounts for PUBLIC); safe in production.
--   psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 \
--        -v runtime_role=travel_app_runtime -v platform_role=travel_app_platform \
--        -f infrastructure/ops/verify_096_data_api.sql
-- Behavioral SET ROLE tests live in test_096_data_api_roles.sql (clone only).
-- ============================================================

\set ON_ERROR_STOP on
BEGIN READ ONLY;

WITH api_roles(r) AS (VALUES ('anon'), ('authenticated')),
rels AS (
  SELECT c.oid, c.relname, c.relkind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
),
checks AS (
  SELECT 'data-api' AS area,
         r || ' has no privilege on any public table/view (' || count(*) FILTER (WHERE relkind <> 'S') || ' objects)' AS item,
         bool_and(relkind = 'S' OR NOT (
           has_table_privilege(r, oid, 'SELECT') OR has_table_privilege(r, oid, 'INSERT') OR
           has_table_privilege(r, oid, 'UPDATE') OR has_table_privilege(r, oid, 'DELETE') OR
           has_table_privilege(r, oid, 'TRUNCATE') OR has_table_privilege(r, oid, 'REFERENCES') OR
           has_table_privilege(r, oid, 'TRIGGER'))) AS ok
    FROM api_roles CROSS JOIN rels
   WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
   GROUP BY r
  UNION ALL
  SELECT 'data-api', r || ' has no privilege on any public sequence',
         bool_and(relkind <> 'S' OR NOT (
           has_sequence_privilege(r, oid, 'USAGE') OR has_sequence_privilege(r, oid, 'SELECT') OR
           has_sequence_privilege(r, oid, 'UPDATE')))
    FROM api_roles CROSS JOIN rels
   WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
   GROUP BY r
  UNION ALL
  SELECT 'data-api', r || ' cannot EXECUTE platform_search_agencies (SECURITY DEFINER)',
         NOT has_function_privilege(r, 'public.platform_search_agencies(text)', 'EXECUTE')
    FROM api_roles
   WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
  UNION ALL
  SELECT 'data-api', 'no SECURITY DEFINER function in public executable by ' || r,
         NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                      WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege(r, p.oid, 'EXECUTE'))
    FROM api_roles
   WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
  UNION ALL
  SELECT 'data-api', 'default privileges of ' || current_user || ' grant nothing to ' || r,
         NOT EXISTS (SELECT 1 FROM pg_default_acl d, aclexplode(d.defaclacl) a
                      WHERE d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = current_user)
                        AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = r))
    FROM api_roles
   WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
  UNION ALL
  SELECT 'regression', :'runtime_role' || ' still reads tenant table offers',
         has_table_privilege(:'runtime_role', 'public.offers', 'SELECT')
  UNION ALL
  SELECT 'regression', :'runtime_role' || ' can EXECUTE current_agency_id() (RLS helper)',
         has_function_privilege(:'runtime_role', 'public.current_agency_id()', 'EXECUTE')
  UNION ALL
  SELECT 'regression', :'platform_role' || ' still reads platform_users',
         EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'platform_role')
         AND has_table_privilege(:'platform_role', 'public.platform_users', 'SELECT')
  UNION ALL
  SELECT 'regression', :'platform_role' || ' can EXECUTE platform_search_agencies',
         EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'platform_role')
         AND has_function_privilege(:'platform_role', 'public.platform_search_agencies(text)', 'EXECUTE')
  UNION ALL
  SELECT 'regression', 'service_role privileges untouched (reads platform_users)',
         NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
         OR has_table_privilege('service_role', 'public.platform_users', 'SELECT')
)
SELECT area, item, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*) FILTER (WHERE NOT ok) OVER () AS total_failures,
       count(*) OVER () AS total_checks
  FROM checks
 ORDER BY (CASE WHEN ok THEN 1 ELSE 0 END), area, item;

ROLLBACK;
