-- ============================================================
-- TRAVEL LITE — 002_rls_policies.sql
-- Isolamento multi-tenant (tenant_id) por PostgreSQL RLS.
-- Espelha o padrão da Travel Platform (002_rls_policies.sql do banco
-- principal), adaptado ao Travel Lite: coluna de tenant = tenant_id.
--
-- Camadas: hook Fastify -> AsyncLocalStorage -> withTenantTransaction
-- (set_tenant_context após BEGIN) -> SQL com WHERE tenant_id = $1
-- -> FORCE ROW LEVEL SECURITY.
--
-- set_tenant_context() usa set_config(..., is_local => TRUE): o contexto
-- morre no COMMIT/ROLLBACK, então uma conexão em pool nunca carrega o
-- tenant de um request para o próximo.
--
-- Tabelas SEM RLS (e por quê):
--   tenants        — o login precisa localizar o tenant pelo slug ANTES
--                    de existir contexto; grants de coluna restringem o
--                    runtime a SELECT + UPDATE(name, status).
-- ============================================================

-- ------------------------------------------------------------
-- SESSION CONTEXT HELPERS
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::TEXT;
$$;

CREATE OR REPLACE FUNCTION current_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', TRUE), '')::TEXT;
$$;

CREATE OR REPLACE FUNCTION set_tenant_context(
  p_tenant_id TEXT,
  p_user_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id = '' THEN
    RAISE EXCEPTION 'Tenant context requires tenant_id';
  END IF;

  PERFORM set_config('app.current_tenant_id', p_tenant_id, TRUE);

  IF p_user_id IS NULL THEN
    PERFORM set_config('app.current_user_id', '', TRUE);
  ELSE
    PERFORM set_config('app.current_user_id', p_user_id, TRUE);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION clear_tenant_context()
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', '', TRUE);
  PERFORM set_config('app.current_user_id', '', TRUE);
END;
$$;

-- ------------------------------------------------------------
-- RUNTIME ROLE (local/CI only; produção fora do escopo desta fase)
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'travel_lite_runtime'
  ) THEN
    CREATE ROLE travel_lite_runtime
      LOGIN
      PASSWORD 'travel_lite_runtime_password'
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

GRANT USAGE ON SCHEMA public TO travel_lite_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO travel_lite_runtime;

-- ------------------------------------------------------------
-- GRANTS (runtime: CRUD nas tabelas de negócio; append-only onde
-- aplicável; sem grant de criação de tenant)
-- ------------------------------------------------------------

GRANT SELECT, UPDATE (name, status, external_id, source_system, sync_status, updated_at) ON tenants TO travel_lite_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  users,
  auth_sessions,
  tenant_sequences,
  customers,
  sellers,
  sale_categories,
  payment_methods,
  sales,
  seller_commissions,
  financial_accounts,
  financial_categories,
  receivables,
  payables,
  payments,
  payment_allocations,
  integration_outbox
TO travel_lite_runtime;

-- Ledger imutável: runtime escreve e lê, nunca altera.
GRANT SELECT, INSERT ON financial_transactions TO travel_lite_runtime;

-- Auditoria append-only.
GRANT SELECT, INSERT ON audit_logs TO travel_lite_runtime;

GRANT EXECUTE ON FUNCTION current_tenant_id() TO travel_lite_runtime;
GRANT EXECUTE ON FUNCTION current_user_id() TO travel_lite_runtime;
GRANT EXECUTE ON FUNCTION set_tenant_context(TEXT, TEXT) TO travel_lite_runtime;
GRANT EXECUTE ON FUNCTION clear_tenant_context() TO travel_lite_runtime;

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
  tables CONSTANT TEXT[] := ARRAY[
    'users',
    'auth_sessions',
    'tenant_sequences',
    'customers',
    'sellers',
    'sale_categories',
    'payment_methods',
    'sales',
    'seller_commissions',
    'financial_accounts',
    'financial_categories',
    'receivables',
    'payables',
    'payments',
    'payment_allocations',
    'financial_transactions',
    'integration_outbox',
    'audit_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_select_tenant ON %I FOR SELECT USING (tenant_id = current_tenant_id()::uuid)',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY %I_insert_tenant ON %I FOR INSERT WITH CHECK (tenant_id = current_tenant_id()::uuid)',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY %I_update_tenant ON %I FOR UPDATE USING (tenant_id = current_tenant_id()::uuid) WITH CHECK (tenant_id = current_tenant_id()::uuid)',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY %I_delete_tenant ON %I FOR DELETE USING (tenant_id = current_tenant_id()::uuid)',
      t, t
    );
  END LOOP;
END;
$$;

-- Append-only: sem policies de UPDATE/DELETE (com FORCE RLS, qualquer
-- UPDATE/DELETE do runtime falha — defesa em profundidade junto dos grants).
-- (financial_transactions e audit_logs herdam apenas SELECT/INSERT acima.)
