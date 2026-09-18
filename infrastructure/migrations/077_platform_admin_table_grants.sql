-- ============================================================
-- PLATFORM ADMIN: missing runtime-role grants on 32 tables
-- ============================================================
-- Found during Direction A Phase 3B live verification: every Platform
-- Admin page backed by these tables fails with Postgres 42501
-- (insufficient_privilege). Root cause confirmed directly: the
-- migrations that created these tables (026, 027, 028, 031, 032, 036
-- and others) never included a GRANT statement for the runtime role,
-- unlike every other table in the schema (e.g. see 074_trip_photos.sql's
-- GRANT for a recent precedent).
--
-- This is NOT a tenant/RLS boundary. Confirmed none of these 32 tables
-- has row-level security enabled (they are platform-global, not
-- tenant-scoped -- access is already controlled at the application
-- layer by the separate /platform-auth pipeline, not by Postgres RLS).
-- The runtime role has no BYPASSRLS attribute (see ADR-005) and is
-- already the single role used for every other table in this schema,
-- tenant and non-tenant alike -- granting it access here does not
-- create a new privilege boundary, it closes an accidental gap in an
-- existing one.
--
-- Audit/evidence/change-log tables (_audit, _log, _changes suffix) get
-- SELECT+INSERT only, matching this schema's established append-only
-- convention (audit_logs, document_audit_events, campaign_attributions).
-- Every other table gets full SELECT/INSERT/UPDATE/DELETE.
--
-- The equivalent fix for the local/CI disposable-database test role is
-- in tests/integration/database/002_prepare_local_roles.sql (a
-- separate, hand-maintained script -- not derived from migrations --
-- that local/CI test suites use instead of this migration).
--
-- Forward-only: this migration only adds grants. It does not touch
-- migrations 026-036 or any other prior migration.
-- ============================================================

DO $$
DECLARE
  runtime_role TEXT;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['travel_app_runtime_local', 'travel_app_runtime']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO %I',
        'billing_invoices, billing_payments, billing_webhook_events, '
        || 'courtesy_accounts, entitlements, feature_flags, '
        || 'landing_page_config, landing_promotions, lead_conversions, '
        || 'lead_interactions, leads, plans, platform_coupon_redemptions, '
        || 'platform_coupons, platform_settings, promotional_campaigns, '
        || 'sales_demos, sales_opportunities, subscriber_tenants, '
        || 'subscriptions, support_cases',
        runtime_role
      );

      EXECUTE format(
        'GRANT SELECT, INSERT ON %s TO %I',
        'billing_webhook_audit, campaign_audit, courtesy_account_audit, '
        || 'entitlement_changes, feature_flag_audit, login_audit, '
        || 'platform_audit_logs, sensitive_operations_log, '
        || 'subscriber_tenant_audit, subscription_state_changes, '
        || 'support_access_log',
        runtime_role
      );
      EXECUTE format(
        'REVOKE UPDATE, DELETE ON %s FROM %I',
        'billing_webhook_audit, campaign_audit, courtesy_account_audit, '
        || 'entitlement_changes, feature_flag_audit, login_audit, '
        || 'platform_audit_logs, sensitive_operations_log, '
        || 'subscriber_tenant_audit, subscription_state_changes, '
        || 'support_access_log',
        runtime_role
      );
    END IF;
  END LOOP;
END $$;
