-- ============================================================
-- SUPABASE DATA API HARDENING (anon / authenticated)
-- ============================================================
-- Supabase provisions `anon` and `authenticated` with ALL privileges on
-- every table, sequence and function in schema public (explicit grants +
-- ALTER DEFAULT PRIVILEGES for role postgres). Those roles are what the
-- public Data API (PostgREST) runs as for any request carrying the
-- project's anon key or a Supabase Auth JWT.
--
-- This application never uses the Data API: the API connects directly
-- with its own roles (travel_app_runtime / travel_app_platform) and the
-- storage adapter uses the service_role key against the Storage API
-- (schema storage, untouched here). Audited 2026-09-26: no supabase-js
-- table/rpc usage, no /rest/v1 or /auth/v1 calls, no auth.uid()/
-- storage.objects references in migrations. Allowlist: EMPTY.
--
-- Exposure closed by this migration (production, 2026-09-26):
--   * 44 platform tables WITHOUT RLS (platform_users, platform_sessions,
--     billing_*, subscriptions, subscriber_tenants, support_*, leads,
--     feature_flags, platform_settings, audit logs, ...): SELECT, INSERT,
--     UPDATE, DELETE, TRUNCATE for anon/authenticated -- readable and
--     writable through the Data API with the anon key.
--   * 126 tenant tables (FORCE RLS): same privileges. RLS blocks rows via
--     the Data API, but TRUNCATE is not subject to RLS; no legitimate use.
--   * 2 sequences: USAGE/SELECT/UPDATE.
--   * platform_search_agencies(text) is SECURITY DEFINER and executable by
--     PUBLIC/anon/authenticated: cross-tenant agency enumeration via RPC.
--     Explicit grants to travel_app_runtime (079) and travel_app_platform
--     (095) are kept; nothing new is granted.
--
-- Intentionally NOT revoked: EXECUTE on the invoker helpers
-- current_agency_id(), current_user_id(), set_tenant_context(),
-- clear_tenant_context() stays with PUBLIC. RLS policies of the runtime
-- and platform roles evaluate them through that PUBLIC grant, and they
-- only read/write the calling session's own settings.
--
-- REVOKE is effective with or without RLS, so no RLS is added here.
-- Conditional on the roles existing: local/CI databases have no
-- anon/authenticated roles and this migration is a no-op there.
-- Future objects: ALTER DEFAULT PRIVILEGES applies to the role running the
-- migration (postgres in production). Defaults owned by supabase_admin
-- cannot be changed by postgres and only affect objects created by
-- supabase_admin, which this application never does.
-- ============================================================

DO $$
DECLARE
  api_role TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);

      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);
    END IF;
  END LOOP;

  -- PUBLIC also carries EXECUTE on this SECURITY DEFINER function
  -- (default for new functions), which anon/authenticated inherit.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'platform_search_agencies') THEN
    REVOKE EXECUTE ON FUNCTION platform_search_agencies(TEXT) FROM PUBLIC;
  END IF;
END $$;
