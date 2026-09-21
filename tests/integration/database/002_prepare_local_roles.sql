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

-- route_points (migration 004_route_points.sql) only exists once that
-- migration has been applied; guard the same way as the block above so
-- domains that only apply 001+002(+003) are unaffected.
DO $$
BEGIN
  IF to_regclass('public.route_points') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      route_points
    TO travel_app_runtime_local;
  END IF;
END;
$$;

-- bookings/booking_passengers (migration 005_booking.sql) only exist
-- once that migration has been applied; guard the same way as the
-- blocks above so domains that only apply earlier migrations are
-- unaffected. Do NOT use an unconditional GRANT here -- a prior
-- session broke every other domain's test suite that way.
DO $$
BEGIN
  IF to_regclass('public.bookings') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      bookings,
      booking_passengers
    TO travel_app_runtime_local;
  END IF;
END;
$$;

-- transport_operations/operation_checkpoints (migration
-- 006_field_operations.sql) only exist once that migration has been
-- applied; guard the same way as the blocks above so domains that
-- only apply 001+002(+003)(+004)(+005) are unaffected.
DO $$
BEGIN
  IF to_regclass('public.transport_operations') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      transport_operations,
      operation_checkpoints
    TO travel_app_runtime_local;
  END IF;
END;
$$;

-- commercial_opportunities/commercial_tasks/customer_interactions
-- (migration 008_commercial_cockpit.sql) only exist once that migration
-- has been applied; guard the same way as the blocks above so domains
-- that only apply earlier migrations are unaffected. Do NOT use an
-- unconditional GRANT here -- a prior session broke every other
-- domain's test suite that way.
DO $$
BEGIN
  IF to_regclass('public.commercial_opportunities') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      commercial_opportunities,
      commercial_tasks,
      customer_interactions
    TO travel_app_runtime_local;
  END IF;
END;
$$;

-- pipelines/pipeline_stages/pipeline_access (migration
-- 009_configurable_pipelines.sql) only exist once that migration has been
-- applied; guard the same way as the blocks above so domains that only
-- apply earlier migrations are unaffected. Do NOT use an unconditional
-- GRANT here -- a prior session broke every other domain's test suite
-- that way.
DO $$
BEGIN
  IF to_regclass('public.pipelines') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      pipelines,
      pipeline_stages,
      pipeline_access
    TO travel_app_runtime_local;
  END IF;
END;
$$;

-- financial foundation tables (migration 010_financial_foundation.sql) only
-- exist once that migration has been applied. Keep this guarded so earlier
-- domain tests can keep applying only the migrations they need.
DO $$
BEGIN
  IF to_regclass('public.receivables') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      receivables,
      payables,
      payments,
      payment_allocations,
      operational_costs
    TO travel_app_runtime_local;
  END IF;
END;
$$;

-- operational_staff/operation_assignments (migration
-- 012_operational_staff_assignments.sql) only exist once that migration
-- has been applied. Keep this guarded so earlier domain tests can keep
-- applying only the migrations they need.
DO $$
BEGIN
  IF to_regclass('public.operational_staff') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      operational_staff,
      operational_staff_capabilities,
      operation_assignments
    TO travel_app_runtime_local;
  END IF;
END;
$$;

-- external_offer_captures (migration 013_pescador_foundation.sql) only
-- exists once Pescador foundation has been applied.
DO $$
BEGIN
  IF to_regclass('public.external_offer_captures') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      external_offer_captures
    TO travel_app_runtime_local;
  END IF;
END;
$$;

-- Customer 360 tables (migrations 019-023) are tenant-scoped and guarded so
-- earlier domain suites can still apply only their needed migration range.
DO $$
BEGIN
  IF to_regclass('public.customer_addresses') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON customer_addresses TO travel_app_runtime_local;
  END IF;

  IF to_regclass('public.customer_dependents') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON customer_dependents TO travel_app_runtime_local;
  END IF;

  IF to_regclass('public.customer_documents') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      customer_documents,
      document_attachments,
      document_extractions,
      document_verifications
    TO travel_app_runtime_local;
  END IF;

  IF to_regclass('public.document_audit_events') IS NOT NULL THEN
    GRANT SELECT, INSERT ON document_audit_events TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON document_audit_events FROM travel_app_runtime_local;
  END IF;
END;
$$;

-- Offer & Growth Engine foundation tables (migration
-- 014_offer_growth_foundation.sql) only exist once that migration has been
-- applied. Keep this guarded so earlier domain tests can keep applying only
-- the migrations they need.
DO $$
BEGIN
  IF to_regclass('public.assets') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      assets,
      campaigns,
      campaign_offers,
      publications,
      agency_entitlements,
      engagements,
      automations,
      automation_executions,
      coupons,
      coupon_grants,
      coupon_redemptions,
      connector_actions,
      offer_growth_audit_log
    TO travel_app_runtime_local;
  END IF;
END;
$$;

-- audit_logs (migration 015_security_audit_logging.sql) is append-only for
-- runtime traffic: application code can read tenant-scoped history and
-- insert a new event, but no runtime path may alter or delete evidence.
DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    GRANT SELECT, INSERT ON audit_logs TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON audit_logs FROM travel_app_runtime_local;
  END IF;
END;
$$;

-- Extended financial module tables (migration 024).
DO $$
BEGIN
  IF to_regclass('public.financial_categories') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      financial_categories,
      revenues,
      expenses,
      reconciliations
    TO travel_app_runtime_local;

    GRANT SELECT, INSERT ON cash_transactions TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON cash_transactions FROM travel_app_runtime_local;
  END IF;
END;
$$;

-- Production auth/captcha/MFA tables (migration
-- 016_production_auth_captcha_mfa.sql) hold security-sensitive state.
-- Grant only the operations required by runtime flows and rely on RLS
-- policies for tenant enforcement.
DO $$
BEGIN
  IF to_regclass('public.auth_sessions') IS NOT NULL THEN
    GRANT SELECT, INSERT ON
      captcha_verifications,
      mfa_totp_attempts
    TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON
      captcha_verifications,
      mfa_totp_attempts
    FROM travel_app_runtime_local;

    -- auth_sessions needs UPDATE (not DELETE) for the local password-auth
    -- lifecycle: logout, password-reset-revokes-all-sessions, admin
    -- revoke, and disable/suspend-invalidates-sessions all set
    -- invalidated_at/revoked_reason on the existing row rather than
    -- deleting it (auditability -- see 061_local_password_auth.sql).
    GRANT SELECT, INSERT, UPDATE ON auth_sessions TO travel_app_runtime_local;
    REVOKE DELETE ON auth_sessions FROM travel_app_runtime_local;

    GRANT SELECT, INSERT, UPDATE, DELETE ON
      mfa_totp_secrets,
      mfa_recovery_codes,
      mfa_requirements
    TO travel_app_runtime_local;
  END IF;

  IF to_regclass('public.password_reset_tokens') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON password_reset_tokens TO travel_app_runtime_local;
  END IF;

  IF to_regclass('public.customer_password_reset_tokens') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON customer_password_reset_tokens TO travel_app_runtime_local;
  END IF;
END;
$$;

-- Business Operations Completion wave tables (migrations 038-043) only
-- exist once those migrations have been applied; guard the same way as
-- the blocks above so domains that only apply earlier migrations are
-- unaffected. Do NOT use an unconditional GRANT here -- a prior session
-- broke every other domain's test suite that way.
DO $$
BEGIN
  IF to_regclass('public.notification_preferences') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      notification_preferences
    TO travel_app_runtime_local;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.supplier_category_links') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      supplier_category_links
    TO travel_app_runtime_local;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.air_services') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      air_services
    TO travel_app_runtime_local;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.land_services') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      land_services
    TO travel_app_runtime_local;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.cost_centers') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      cost_centers
    TO travel_app_runtime_local;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.commission_plans') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      commission_plans
    TO travel_app_runtime_local;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.employees') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      employees
    TO travel_app_runtime_local;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.commission_entries') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      commission_entries
    TO travel_app_runtime_local;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.employee_commission_rules') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      employee_commission_rules
    TO travel_app_runtime_local;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.customer_segments') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      customer_segments
    TO travel_app_runtime_local;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.employee_deductions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      employee_deductions
    TO travel_app_runtime_local;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.payroll_entries') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      payroll_entries
    TO travel_app_runtime_local;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.travel_requirements') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      travel_requirements
    TO travel_app_runtime_local;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.trip_occurrences') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      trip_occurrences,
      post_trip_checklist
    TO travel_app_runtime_local;
  END IF;
END;
$$;

-- Client Onboarding (Agent 02): enrollment link/submission/document tables
-- (migration 049_enrollment_links.sql) only exist once that migration has
-- been applied; guard the same way as the blocks above so domains that
-- only apply earlier migrations are unaffected.
DO $$
BEGIN
  IF to_regclass('public.enrollment_links') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      enrollment_links,
      enrollment_submissions,
      enrollment_documents
    TO travel_app_runtime_local;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.departments') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      departments
    TO travel_app_runtime_local;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.invitations') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      invitations
    TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.permission_restrictions') IS NOT NULL THEN
    GRANT SELECT, INSERT, DELETE ON
      permission_restrictions
    TO travel_app_runtime_local;
  END IF;
END;
$$;

-- Travel Product Catalog (Agent 07): travel_products/product_assets
-- (migration 052_travel_products_catalog.sql) only exist once that
-- migration has been applied; guard the same way as the blocks above so
-- domains that only apply earlier migrations are unaffected.
DO $$
BEGIN
  IF to_regclass('public.travel_products') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      travel_products,
      product_assets
    TO travel_app_runtime_local;
  END IF;
END;
$$;

-- Partner Portal (Agent 04): commercial_partners/partner_contracts/
-- partner_links/partner_attributions/partner_commissions (migration
-- 054_commercial_partners.sql) only exist once that migration has been
-- applied; guard the same way as the blocks above. Also the real external
-- partner model used by Partner Campaigns after its reconciliation
-- migration (Agent 10).
DO $$
BEGIN
  IF to_regclass('public.commercial_partners') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      commercial_partners,
      partner_contracts,
      partner_links,
      partner_attributions,
      partner_commissions
    TO travel_app_runtime_local;
  END IF;
END;
$$;

-- Sale Items / Upsell (Agent 08): line items, optional proposal items,
-- rules, and generated suggestions.
DO $$
BEGIN
  IF to_regclass('public.sale_items') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      sale_items,
      proposal_optional_items,
      upsell_rules,
      upsell_suggestions
    TO travel_app_runtime_local;
  END IF;
END;
$$;

-- Contracts / E-signature (Agent 03). Evidence is append-only: SELECT/INSERT
-- only, matching the absence of UPDATE/DELETE RLS policies in the migration.
DO $$
BEGIN
  IF to_regclass('public.contract_templates') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      contract_templates,
      contract_documents,
      contract_parties,
      contract_signature_links
    TO travel_app_runtime_local;
  END IF;

  IF to_regclass('public.contract_signature_evidence') IS NOT NULL THEN
    GRANT SELECT, INSERT ON
      contract_signature_evidence
    TO travel_app_runtime_local;
  END IF;
END;
$$;

-- Travel Insurance (Agent 09 / Products Upsell): catalog products, sold
-- policies, covered travelers, policy documents.
DO $$
BEGIN
  IF to_regclass('public.insurance_products') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      insurance_products,
      insurance_policies,
      insurance_travelers,
      insurance_documents
    TO travel_app_runtime_local;
  END IF;
END;
$$;

-- Partner Campaigns (Agent 10): campaign_attributions is append-only for
-- runtime traffic (server-recorded impression/click events) -- application
-- code may read tenant-scoped history and insert a new event, but no
-- runtime path may alter or delete evidence, matching the audit_logs
-- pattern above. campaign_partner_stubs remains as a historical
-- compatibility table after partner_id was reconciled to
-- commercial_partners (see the Agent 04 block above).
DO $$
BEGIN
  IF to_regclass('public.campaign_partner_stubs') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      campaign_partner_stubs,
      partner_campaigns,
      campaign_products,
      campaign_placements
    TO travel_app_runtime_local;
  END IF;

  IF to_regclass('public.campaign_attributions') IS NOT NULL THEN
    GRANT SELECT, INSERT ON campaign_attributions TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON campaign_attributions FROM travel_app_runtime_local;
  END IF;
END;
$$;

-- Platform Admin local auth (Frontend Auth & Session track, 062). Not
-- tenant-scoped, no RLS (matches platform_users' own documented model),
-- so plain table grants are the entire access control surface here --
-- application code (platform-auth.ts / requirePlatformRole()) does the
-- rest.
DO $$
BEGIN
  IF to_regclass('public.platform_users') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON platform_users TO travel_app_runtime_local;
    GRANT SELECT, INSERT ON platform_user_audit TO travel_app_runtime_local;
  END IF;

  IF to_regclass('public.platform_sessions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON platform_sessions TO travel_app_runtime_local;
  END IF;

  IF to_regclass('public.customer_sessions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON customer_sessions TO travel_app_runtime_local;
  END IF;

  IF to_regclass('public.agent_area_grants') IS NOT NULL THEN
    GRANT SELECT, INSERT, DELETE ON agent_area_grants TO travel_app_runtime_local;
  END IF;

  -- 068_protocol_numbers.sql: customers.protocol_number/
  -- enrollment_submissions.protocol_number DEFAULT calls nextval() on
  -- these sequences -- sequence privileges are separate from table
  -- privileges in Postgres, so every INSERT fails with 42501 without
  -- this (confirmed by reproducing it locally).
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'customer_protocol_seq') THEN
    GRANT USAGE ON SEQUENCE customer_protocol_seq TO travel_app_runtime_local;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'enrollment_protocol_seq') THEN
    GRANT USAGE ON SEQUENCE enrollment_protocol_seq TO travel_app_runtime_local;
  END IF;

  IF to_regclass('public.excursions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON excursions TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.excursion_customers') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON excursion_customers TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.excursion_departures') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON excursion_departures TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.pescador_sources') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON pescador_sources TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.pescador_searches') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON pescador_searches TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.pescador_search_results') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON pescador_search_results TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.trip_photos') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON trip_photos TO travel_app_runtime_local;
  END IF;
  -- Import Center (migration 082): import_jobs and import_mapping_templates
  IF to_regclass('public.import_jobs') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON import_jobs TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.import_mapping_templates') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON import_mapping_templates TO travel_app_runtime_local;
  END IF;
  -- Agency Communications (migration 084): agency_communications
  IF to_regclass('public.agency_communications') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON agency_communications TO travel_app_runtime_local;
  END IF;
END;
$$;

-- Platform Admin domain (migrations 026-036 and others): subscriber
-- tenants, billing, plans/entitlements, feature flags, leads, support,
-- and platform/audit tables. Never granted here before -- found via
-- Direction A Phase 3B live verification (every Platform Admin data
-- page failed with 42501) and confirmed the source migrations
-- themselves never included a GRANT either (unlike most other
-- domains). None of these tables has RLS (platform-global, not
-- tenant-scoped -- access control is the separate /platform-auth
-- pipeline, not Postgres RLS), matching the platform_users block
-- above. See infrastructure/migrations/077_platform_admin_table_grants.sql
-- for the equivalent forward-only fix applied to real deployments.
DO $$
BEGIN
  -- Full CRUD: core platform entity tables (mutable by application code).
  IF to_regclass('public.subscriber_tenants') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON subscriber_tenants TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.plans') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON plans, entitlements TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.courtesy_accounts') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON courtesy_accounts TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.leads') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      leads,
      lead_conversions,
      lead_interactions,
      sales_demos,
      sales_opportunities
    TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.support_cases') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON support_cases TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.billing_invoices') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      billing_invoices,
      billing_payments,
      billing_webhook_events
    TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.feature_flags') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON feature_flags TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.promotional_campaigns') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      promotional_campaigns,
      platform_coupons,
      platform_coupon_redemptions
    TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.landing_page_config') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      landing_page_config,
      landing_promotions
    TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.platform_settings') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform_settings TO travel_app_runtime_local;
  END IF;
  IF to_regclass('public.platform_landing_page') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      platform_landing_page,
      platform_landing_sections,
      platform_banners,
      platform_partners,
      platform_referrals,
      platform_partner_benefits,
      platform_referral_credits,
      platform_partner_commissions
    TO travel_app_runtime_local;
    GRANT SELECT, INSERT ON platform_landing_publications TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON platform_landing_publications FROM travel_app_runtime_local;
  END IF;

  -- Append-only audit/evidence/change-log tables -- SELECT/INSERT only,
  -- matching the audit_logs and campaign_attributions pattern above.
  IF to_regclass('public.subscriber_tenant_audit') IS NOT NULL THEN
    GRANT SELECT, INSERT ON subscriber_tenant_audit TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON subscriber_tenant_audit FROM travel_app_runtime_local;
  END IF;
  IF to_regclass('public.entitlement_changes') IS NOT NULL THEN
    GRANT SELECT, INSERT ON entitlement_changes TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON entitlement_changes FROM travel_app_runtime_local;
  END IF;
  IF to_regclass('public.subscription_state_changes') IS NOT NULL THEN
    GRANT SELECT, INSERT ON subscription_state_changes TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON subscription_state_changes FROM travel_app_runtime_local;
  END IF;
  IF to_regclass('public.courtesy_account_audit') IS NOT NULL THEN
    GRANT SELECT, INSERT ON courtesy_account_audit TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON courtesy_account_audit FROM travel_app_runtime_local;
  END IF;
  IF to_regclass('public.support_access_log') IS NOT NULL THEN
    GRANT SELECT, INSERT ON support_access_log TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON support_access_log FROM travel_app_runtime_local;
  END IF;
  IF to_regclass('public.billing_webhook_audit') IS NOT NULL THEN
    GRANT SELECT, INSERT ON billing_webhook_audit TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON billing_webhook_audit FROM travel_app_runtime_local;
  END IF;
  IF to_regclass('public.feature_flag_audit') IS NOT NULL THEN
    GRANT SELECT, INSERT ON feature_flag_audit TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON feature_flag_audit FROM travel_app_runtime_local;
  END IF;
  IF to_regclass('public.campaign_audit') IS NOT NULL THEN
    GRANT SELECT, INSERT ON campaign_audit TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON campaign_audit FROM travel_app_runtime_local;
  END IF;
  IF to_regclass('public.platform_audit_logs') IS NOT NULL THEN
    GRANT SELECT, INSERT ON platform_audit_logs TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON platform_audit_logs FROM travel_app_runtime_local;
  END IF;
  IF to_regclass('public.login_audit') IS NOT NULL THEN
    GRANT SELECT, INSERT ON login_audit TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON login_audit FROM travel_app_runtime_local;
  END IF;
  IF to_regclass('public.sensitive_operations_log') IS NOT NULL THEN
    GRANT SELECT, INSERT ON sensitive_operations_log TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON sensitive_operations_log FROM travel_app_runtime_local;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION current_agency_id() TO travel_app_runtime_local;
GRANT EXECUTE ON FUNCTION current_user_id() TO travel_app_runtime_local;
GRANT EXECUTE ON FUNCTION set_tenant_context(TEXT, TEXT) TO travel_app_runtime_local;
GRANT EXECUTE ON FUNCTION clear_tenant_context() TO travel_app_runtime_local;
-- 079_platform_agency_search.sql's own GRANT EXECUTE is wiped out by the
-- unconditional `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC`
-- above (same reason current_agency_id() etc. need re-granting here too).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'platform_search_agencies'
  ) THEN
    GRANT EXECUTE ON FUNCTION platform_search_agencies(TEXT) TO travel_app_runtime_local;
  END IF;
END $$;

SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
FROM pg_roles
WHERE rolname = 'travel_app_runtime_local';
