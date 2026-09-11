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
      auth_sessions,
      captcha_verifications,
      mfa_totp_attempts
    TO travel_app_runtime_local;
    REVOKE UPDATE, DELETE ON
      auth_sessions,
      captcha_verifications,
      mfa_totp_attempts
    FROM travel_app_runtime_local;

    GRANT SELECT, INSERT, UPDATE, DELETE ON
      mfa_totp_secrets,
      mfa_recovery_codes,
      mfa_requirements
    TO travel_app_runtime_local;
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

GRANT EXECUTE ON FUNCTION current_agency_id() TO travel_app_runtime_local;
GRANT EXECUTE ON FUNCTION current_user_id() TO travel_app_runtime_local;
GRANT EXECUTE ON FUNCTION set_tenant_context(TEXT, TEXT) TO travel_app_runtime_local;
GRANT EXECUTE ON FUNCTION clear_tenant_context() TO travel_app_runtime_local;

SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
FROM pg_roles
WHERE rolname = 'travel_app_runtime_local';
