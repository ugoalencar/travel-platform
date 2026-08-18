-- ============================================================
-- MULTI-TENANT RLS POLICIES V1
-- Travel Platform
-- ============================================================
-- Prepared only. Do not apply without explicit approval.
--
-- Tenant rule:
--   authenticated application context -> agency_id -> tenant-scoped rows
--
-- The application must set app.current_agency_id from trusted server-side
-- authentication/authorization context. Never trust agency_id supplied
-- directly by the frontend.
--
-- set_tenant_context() uses set_config(..., is_local => TRUE), which scopes
-- app.current_agency_id / app.current_user_id to the current transaction
-- only. The setting is automatically discarded on COMMIT or ROLLBACK, so a
-- pooled connection can never carry one tenant's context into the next
-- caller. Runtime code MUST call set_tenant_context() after BEGIN and
-- perform the tenant-scoped operation inside that same transaction; calling
-- it outside a transaction has no lasting effect beyond the implicit
-- single-statement transaction Postgres creates for it.
-- ============================================================

-- ============================================================
-- SESSION CONTEXT HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION current_agency_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT NULLIF(current_setting('app.current_agency_id', TRUE), '')::TEXT;
$$;

CREATE OR REPLACE FUNCTION current_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', TRUE), '')::TEXT;
$$;

CREATE OR REPLACE FUNCTION set_tenant_context(
  p_agency_id TEXT,
  p_user_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_agency_id IS NULL THEN
    RAISE EXCEPTION 'Tenant context requires agency_id';
  END IF;

  PERFORM set_config('app.current_agency_id', p_agency_id::TEXT, TRUE);

  IF p_user_id IS NULL THEN
    PERFORM set_config('app.current_user_id', '', TRUE);
  ELSE
    PERFORM set_config('app.current_user_id', p_user_id::TEXT, TRUE);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION clear_tenant_context()
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Defense in depth only: the transaction-scoped set_config() calls in
  -- set_tenant_context() already guarantee the tenant setting cannot
  -- outlive COMMIT/ROLLBACK. This function remains for callers that want
  -- to explicitly clear context mid-transaction.
  PERFORM set_config('app.current_agency_id', '', TRUE);
  PERFORM set_config('app.current_user_id', '', TRUE);
END;
$$;

-- ============================================================
-- ENABLE AND FORCE RLS
-- ============================================================

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

ALTER TABLE agencies FORCE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE brokers FORCE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE wishes FORCE ROW LEVEL SECURITY;
ALTER TABLE offers FORCE ROW LEVEL SECURITY;
ALTER TABLE proposals FORCE ROW LEVEL SECURITY;
ALTER TABLE sales FORCE ROW LEVEL SECURITY;
ALTER TABLE commissions FORCE ROW LEVEL SECURITY;
ALTER TABLE trips FORCE ROW LEVEL SECURITY;

-- ============================================================
-- POLICY RESET
-- ============================================================

DROP POLICY IF EXISTS agencies_select_tenant ON agencies;
DROP POLICY IF EXISTS agencies_insert_tenant ON agencies;
DROP POLICY IF EXISTS agencies_update_tenant ON agencies;
DROP POLICY IF EXISTS agencies_delete_tenant ON agencies;

DROP POLICY IF EXISTS users_select_tenant ON users;
DROP POLICY IF EXISTS users_insert_tenant ON users;
DROP POLICY IF EXISTS users_update_tenant ON users;
DROP POLICY IF EXISTS users_delete_tenant ON users;

DROP POLICY IF EXISTS brokers_select_tenant ON brokers;
DROP POLICY IF EXISTS brokers_insert_tenant ON brokers;
DROP POLICY IF EXISTS brokers_update_tenant ON brokers;
DROP POLICY IF EXISTS brokers_delete_tenant ON brokers;

DROP POLICY IF EXISTS customers_select_tenant ON customers;
DROP POLICY IF EXISTS customers_insert_tenant ON customers;
DROP POLICY IF EXISTS customers_update_tenant ON customers;
DROP POLICY IF EXISTS customers_delete_tenant ON customers;

DROP POLICY IF EXISTS customer_accounts_select_tenant ON customer_accounts;
DROP POLICY IF EXISTS customer_accounts_insert_tenant ON customer_accounts;
DROP POLICY IF EXISTS customer_accounts_update_tenant ON customer_accounts;
DROP POLICY IF EXISTS customer_accounts_delete_tenant ON customer_accounts;

DROP POLICY IF EXISTS wishes_select_tenant ON wishes;
DROP POLICY IF EXISTS wishes_insert_tenant ON wishes;
DROP POLICY IF EXISTS wishes_update_tenant ON wishes;
DROP POLICY IF EXISTS wishes_delete_tenant ON wishes;

DROP POLICY IF EXISTS offers_select_tenant ON offers;
DROP POLICY IF EXISTS offers_insert_tenant ON offers;
DROP POLICY IF EXISTS offers_update_tenant ON offers;
DROP POLICY IF EXISTS offers_delete_tenant ON offers;

DROP POLICY IF EXISTS proposals_select_tenant ON proposals;
DROP POLICY IF EXISTS proposals_insert_tenant ON proposals;
DROP POLICY IF EXISTS proposals_update_tenant ON proposals;
DROP POLICY IF EXISTS proposals_delete_tenant ON proposals;

DROP POLICY IF EXISTS sales_select_tenant ON sales;
DROP POLICY IF EXISTS sales_insert_tenant ON sales;
DROP POLICY IF EXISTS sales_update_tenant ON sales;
DROP POLICY IF EXISTS sales_delete_tenant ON sales;

DROP POLICY IF EXISTS commissions_select_tenant ON commissions;
DROP POLICY IF EXISTS commissions_insert_tenant ON commissions;
DROP POLICY IF EXISTS commissions_update_tenant ON commissions;
DROP POLICY IF EXISTS commissions_delete_tenant ON commissions;

DROP POLICY IF EXISTS trips_select_tenant ON trips;
DROP POLICY IF EXISTS trips_insert_tenant ON trips;
DROP POLICY IF EXISTS trips_update_tenant ON trips;
DROP POLICY IF EXISTS trips_delete_tenant ON trips;

-- ============================================================
-- AGENCIES
-- ============================================================
-- Agencies are tenants. Normal application traffic can access only the
-- agency present in the trusted request context. Bootstrap/onboarding flows
-- require a separate reviewed role/policy before production use.

CREATE POLICY agencies_select_tenant ON agencies
  FOR SELECT
  USING (id = current_agency_id());

CREATE POLICY agencies_insert_tenant ON agencies
  FOR INSERT
  WITH CHECK (id = current_agency_id());

CREATE POLICY agencies_update_tenant ON agencies
  FOR UPDATE
  USING (id = current_agency_id())
  WITH CHECK (id = current_agency_id());

CREATE POLICY agencies_delete_tenant ON agencies
  FOR DELETE
  USING (id = current_agency_id());

-- ============================================================
-- TENANT-SCOPED TABLE POLICIES
-- ============================================================

CREATE POLICY users_select_tenant ON users
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY users_insert_tenant ON users
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY users_update_tenant ON users
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY users_delete_tenant ON users
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY brokers_select_tenant ON brokers
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY brokers_insert_tenant ON brokers
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY brokers_update_tenant ON brokers
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY brokers_delete_tenant ON brokers
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY customers_select_tenant ON customers
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY customers_insert_tenant ON customers
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY customers_update_tenant ON customers
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY customers_delete_tenant ON customers
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY customer_accounts_select_tenant ON customer_accounts
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY customer_accounts_insert_tenant ON customer_accounts
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY customer_accounts_update_tenant ON customer_accounts
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY customer_accounts_delete_tenant ON customer_accounts
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY wishes_select_tenant ON wishes
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY wishes_insert_tenant ON wishes
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY wishes_update_tenant ON wishes
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY wishes_delete_tenant ON wishes
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY offers_select_tenant ON offers
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY offers_insert_tenant ON offers
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY offers_update_tenant ON offers
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY offers_delete_tenant ON offers
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY proposals_select_tenant ON proposals
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY proposals_insert_tenant ON proposals
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY proposals_update_tenant ON proposals
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY proposals_delete_tenant ON proposals
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY sales_select_tenant ON sales
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY sales_insert_tenant ON sales
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY sales_update_tenant ON sales
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY sales_delete_tenant ON sales
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY commissions_select_tenant ON commissions
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY commissions_insert_tenant ON commissions
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY commissions_update_tenant ON commissions
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY commissions_delete_tenant ON commissions
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY trips_select_tenant ON trips
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY trips_insert_tenant ON trips
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY trips_update_tenant ON trips
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY trips_delete_tenant ON trips
  FOR DELETE
  USING (agency_id = current_agency_id());

-- ============================================================
-- ROLES AND GRANTS STRATEGY
-- ============================================================
-- Role names are intentionally not created in this prepared migration yet.
-- Before applying in a real database, define:
--
--   app_runtime_role:
--     SELECT, INSERT, UPDATE, DELETE only on application tables.
--     EXECUTE on current_agency_id(), current_user_id(),
--     set_tenant_context(TEXT, TEXT), clear_tenant_context().
--
--   app_migration_role:
--     Owns schema migrations. Must not be used by application traffic.
--
--   app_readonly_role, if needed:
--     SELECT only, still constrained by RLS.
--
-- Do not grant BYPASSRLS to application roles.
-- Do not use the table owner role for runtime traffic.

-- ============================================================
-- DATABASE TEST CHECKLIST
-- ============================================================
-- After human approval and before production use, validate at database level:
--
-- 1. SELECT without app.current_agency_id returns no tenant rows.
-- 2. INSERT with mismatched agency_id is rejected by WITH CHECK.
-- 3. UPDATE cannot move a row to another agency_id.
-- 4. DELETE is constrained to the current agency_id.
-- 5. CustomerAccount cannot reference Customer from another agency.
-- 6. Proposal cannot reference Customer, Offer, Wish, or User from another agency.
-- 7. Sale cannot reference Customer, Proposal, Broker, or User from another agency.
-- 8. Commission cannot reference Sale, Broker, or User from another agency.
-- 9. Trip cannot reference Customer or Sale from another agency.
-- 10. Active Customer CPF/email uniqueness is tenant-scoped and ignores soft-deleted rows.
-- 11. Runtime role cannot bypass RLS or operate without tenant context.
-- 12. A connection that COMMITs a transaction for Agency A, then is reused
--     for a second transaction that never calls set_tenant_context(), must
--     fail closed (no tenant rows visible) rather than inherit Agency A.
-- 13. A connection reused across Agency A (commit) then Agency B
--     (set_tenant_context + commit) must see only Agency B's rows in the
--     second transaction.
