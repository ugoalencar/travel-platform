-- Migration: Platform Admin agency search (Fechamento da META 01 --
--            seletor de agência na tela de Créditos)
-- Purpose: Give Platform Admin a safe, narrow, cross-tenant read of
--          agencies (id/name/slug/status only) for a searchable selector,
--          without weakening `agencies`' RLS in any way.
--
-- Why this needs a function instead of a plain SELECT: `agencies` has
-- FORCE ROW LEVEL SECURITY (002_rls_policies.sql) with
-- `agencies_select_tenant` allowing SELECT only WHERE id = current_agency_id().
-- The platform runtime role (travel_app_runtime_local/travel_app_runtime)
-- has no BYPASSRLS attribute (ADR-005, confirmed again here: rolbypassrls
-- = false) and platform transactions
-- (DatabaseRuntime.withPlatformTransaction) never set a tenant context --
-- so a direct `SELECT * FROM agencies` from Platform Admin code always
-- returns zero rows, by design, no matter which agency.
--
-- Standard, minimal-blast-radius fix: a SECURITY DEFINER function owned
-- by the migration-running role (which has BYPASSRLS -- confirmed:
-- travel_staging_admin/travel_test are superusers). A SECURITY DEFINER
-- function executes with its OWNER's privileges, so it can read across
-- all agencies -- but it can only ever return the 4 non-sensitive columns
-- this function selects (id, name, slug, status). It does NOT touch, does
-- NOT weaken, and does NOT bypass the existing agencies_select_tenant/
-- insert/update/delete policies -- every other code path (tenant runtime
-- queries, RLS enforcement tests) is completely unaffected. This is the
-- standard Postgres pattern for "narrow admin escape hatch without RLS
-- changes" -- see PostgreSQL docs on SECURITY DEFINER + RLS interaction.
--
-- search_path is pinned to keep this function immune to search_path
-- injection (a SECURITY DEFINER function without a fixed search_path is
-- a well-known privilege-escalation vector).
-- Direction: up

CREATE FUNCTION platform_search_agencies(search_query TEXT DEFAULT '')
RETURNS TABLE(id TEXT, name TEXT, slug TEXT, status TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.name, a.slug, a.status::text
  FROM agencies a
  WHERE search_query = ''
     OR a.name ILIKE '%' || search_query || '%'
     OR a.slug ILIKE '%' || search_query || '%'
     OR a.id = search_query
  ORDER BY a.name ASC
  LIMIT 20;
$$;

COMMENT ON FUNCTION platform_search_agencies(TEXT) IS
  'Platform Admin only (called from services/api/src/platform-commercial.ts, '
  'behind platformAuthHooks). Returns id/name/slug/status only -- never '
  'cnpj/email/phone/address/settings. SECURITY DEFINER by design: see '
  'migration header for why this does not weaken agencies RLS.';

DO $$
DECLARE
  runtime_role TEXT;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['travel_app_runtime_local', 'travel_app_runtime']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION platform_search_agencies(TEXT) TO %I', runtime_role);
    END IF;
  END LOOP;
END $$;

-- DROP FUNCTION platform_search_agencies(TEXT);
