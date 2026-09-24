-- ============================================================
-- F-06: PLATFORM ROLE SEPARATION
-- ============================================================
-- Fable audit F-06: platform-global tables (no RLS) were granted to the
-- same runtime role used by every tenant/agency request. Any SQL bug on
-- the tenant path could read platform credentials (platform_users),
-- sessions, and billing data for every agency.
--
-- Forward-only:
--   1. Clones the runtime role's current grants onto the platform role
--      when both roles exist (platform is a SUPERSET: tenant tables for
--      withAgencyTransaction/withPublicLookupTransaction + platform tables).
--   2. Ensures the platform role holds every platform-global table.
--   3. REVOKEs platform-global tables from the runtime role (fail-closed
--      even when the platform role does not exist yet).
--
-- Roles are NOT created here (002_rls_policies.sql convention). Local/CI
-- roles come from tests/integration/database/002_prepare_local_roles.sql;
-- production roles are provisioned out-of-band. Operators must create the
-- platform role and set PLATFORM_DATABASE_URL before/with this migration,
-- or Platform Admin paths fail closed with 42501 until provisioned.
-- ============================================================

DO $$
DECLARE
  runtime_role TEXT;
  platform_role TEXT;
  g RECORD;
  platform_tables_full TEXT := 'platform_users, platform_sessions, '
    || 'billing_invoices, billing_payments, billing_webhook_events, '
    || 'courtesy_accounts, entitlements, feature_flags, '
    || 'landing_page_config, landing_promotions, lead_conversions, '
    || 'lead_interactions, leads, plans, platform_coupon_redemptions, '
    || 'platform_coupons, platform_settings, promotional_campaigns, '
    || 'sales_demos, sales_opportunities, subscriber_tenants, '
    || 'subscriptions, support_cases, '
    || 'platform_landing_page, platform_landing_sections, platform_banners, '
    || 'platform_partners, platform_referrals, platform_partner_benefits, '
    || 'platform_referral_credits, platform_partner_commissions';
  platform_tables_append TEXT := 'platform_user_audit, '
    || 'billing_webhook_audit, campaign_audit, courtesy_account_audit, '
    || 'entitlement_changes, feature_flag_audit, login_audit, '
    || 'platform_audit_logs, sensitive_operations_log, '
    || 'subscriber_tenant_audit, subscription_state_changes, '
    || 'support_access_log, platform_landing_publications';
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['travel_app_runtime_local', 'travel_app_runtime']
  LOOP
    IF runtime_role = 'travel_app_runtime_local' THEN
      platform_role := 'travel_app_platform_local';
    ELSE
      platform_role := 'travel_app_platform';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = platform_role) THEN
      -- Clone tenant/sequence grants from the runtime role so the platform
      -- role can run withAgencyTransaction / withPublicLookupTransaction.
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
        FOR g IN
          SELECT table_name, privilege_type
          FROM information_schema.role_table_grants
          WHERE table_schema = 'public' AND grantee = runtime_role
        LOOP
          EXECUTE format('GRANT %s ON %I TO %I', g.privilege_type, g.table_name, platform_role);
        END LOOP;

        FOR g IN
          SELECT object_name, privilege_type
          FROM information_schema.role_usage_grants
          WHERE object_schema = 'public'
            AND object_type = 'SEQUENCE'
            AND grantee = runtime_role
        LOOP
          EXECUTE format('GRANT %s ON SEQUENCE %I TO %I', g.privilege_type, g.object_name, platform_role);
        END LOOP;

        EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', platform_role);
        EXECUTE format('GRANT EXECUTE ON FUNCTION current_agency_id() TO %I', platform_role);
        EXECUTE format('GRANT EXECUTE ON FUNCTION current_user_id() TO %I', platform_role);
        EXECUTE format('GRANT EXECUTE ON FUNCTION set_tenant_context(TEXT, TEXT) TO %I', platform_role);
        EXECUTE format('GRANT EXECUTE ON FUNCTION clear_tenant_context() TO %I', platform_role);
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'platform_search_agencies') THEN
          EXECUTE format('GRANT EXECUTE ON FUNCTION platform_search_agencies(TEXT) TO %I', platform_role);
        END IF;
      END IF;

      -- Explicit platform-table grants (idempotent; also covers the case
      -- where the runtime role no longer holds them).
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO %I',
        platform_tables_full,
        platform_role
      );
      EXECUTE format('GRANT SELECT, INSERT ON %s TO %I', platform_tables_append, platform_role);
      EXECUTE format('REVOKE UPDATE, DELETE ON %s FROM %I', platform_tables_append, platform_role);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
      EXECUTE format('REVOKE ALL ON %s FROM %I', platform_tables_full, runtime_role);
      EXECUTE format('REVOKE ALL ON %s FROM %I', platform_tables_append, runtime_role);
    END IF;
  END LOOP;
END $$;
