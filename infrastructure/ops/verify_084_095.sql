-- ============================================================
-- OPERATIONAL (not a migration): read-only verification for 084..095
-- ============================================================
-- Every row is one check with result PASS/FAIL. Nothing is modified.
-- Production:
--   psql "$DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 \
--        -v runtime_role=travel_app_runtime -v platform_role=travel_app_platform \
--        -f infrastructure/ops/verify_084_095.sql
-- Local rehearsal: runtime_role=travel_app_runtime_local platform_role=travel_app_platform_local
-- See docs/release/REMOTE_MIGRATION_RUNBOOK_084_095.md.
-- ============================================================

\set ON_ERROR_STOP on
BEGIN READ ONLY;

WITH expected_columns(migration, tbl, col) AS (
  VALUES
    ('084', 'offers', 'featured'),
    ('084', 'offers', 'show_on_customer_app'),
    ('084', 'offers', 'target_segment_id'),
    ('084', 'offers', 'display_priority'),
    ('084', 'offers', 'image_url'),
    ('087', 'engagements', 'proposal_id'),
    ('087', 'engagements', 'trip_id'),
    ('087', 'engagements', 'communication_id'),
    ('088', 'proposals', 'title'),
    ('088', 'proposals', 'published_at'),
    ('093', 'offers', 'cover_media_asset_id'),
    ('093', 'agency_communications', 'cover_media_asset_id')
),
expected_tables(migration, tbl, should_exist) AS (
  VALUES
    ('085', 'agency_communications', true),
    ('089', 'proposal_sections', true),
    ('090', 'proposal_items', true),
    ('092', 'media_assets', true),
    ('092', 'media_asset_links', true),
    ('094', 'proposal_media', false)
),
new_tenant_tables(tbl) AS (
  VALUES ('agency_communications'), ('proposal_sections'), ('proposal_items'),
         ('media_assets'), ('media_asset_links')
),
checks AS (
  SELECT 'schema' AS area, migration || ' column ' || tbl || '.' || col AS item,
         EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = 'public' AND c.table_name = e.tbl AND c.column_name = e.col) AS ok
    FROM expected_columns e
  UNION ALL
  SELECT 'schema', migration || ' table ' || tbl || CASE WHEN should_exist THEN ' exists' ELSE ' dropped' END,
         (to_regclass('public.' || tbl) IS NOT NULL) = should_exist
    FROM expected_tables
  UNION ALL
  SELECT 'schema', '086 EngagementType has ' || v,
         EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                  WHERE t.typname = 'EngagementType' AND e.enumlabel = v)
    FROM unnest(ARRAY['OFFER_VIEWED', 'OFFER_REVISITED', 'PROPOSAL_VIEWED', 'PROPOSAL_REVISITED',
                      'COMMUNICATION_VIEWED', 'COMMUNICATION_CTA_CLICKED', 'CUSTOMER_HOME_VIEWED',
                      'TRIP_VIEWED']) AS v
  UNION ALL
  SELECT 'rls', 'ENABLE+FORCE RLS on ' || tbl,
         COALESCE((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
                    WHERE oid = to_regclass('public.' || tbl)), false)
    FROM new_tenant_tables
  UNION ALL
  SELECT 'rls', '4 tenant policies on ' || tbl,
         (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = tbl) >= 4
    FROM new_tenant_tables
  UNION ALL
  SELECT 'grants', :'runtime_role' || ' can SELECT/INSERT/UPDATE/DELETE ' || tbl,
         to_regclass('public.' || tbl) IS NOT NULL
         AND has_table_privilege(:'runtime_role', 'public.' || tbl, 'SELECT,INSERT,UPDATE,DELETE')
    FROM new_tenant_tables
  UNION ALL
  SELECT 'grants', '095 ' || :'runtime_role' || ' has NO access to platform_users',
         NOT has_table_privilege(:'runtime_role', 'public.platform_users', 'SELECT')
  UNION ALL
  SELECT 'grants', '095 ' || :'platform_role' || ' can SELECT platform_users',
         EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'platform_role')
         AND has_table_privilege(:'platform_role', 'public.platform_users', 'SELECT')
  UNION ALL
  SELECT 'grants', '095 ' || :'platform_role' || ' inherited tenant grant on offers',
         EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'platform_role')
         AND has_table_privilege(:'platform_role', 'public.offers', 'SELECT')
  UNION ALL
  SELECT 'roles', r || ' is NOSUPERUSER/NOBYPASSRLS/LOGIN',
         EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
                   AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
    FROM unnest(ARRAY[:'runtime_role', :'platform_role']) AS r
  UNION ALL
  SELECT 'roles', 'runtime and platform roles are distinct', :'runtime_role' <> :'platform_role'
)
SELECT area, item, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*) FILTER (WHERE NOT ok) OVER () AS total_failures,
       count(*) OVER () AS total_checks
  FROM checks
 ORDER BY (CASE WHEN ok THEN 1 ELSE 0 END), area, item;

ROLLBACK;
