-- ============================================================
-- TRAVEL LITE — 004_access_control_dashboard.sql
-- Controle de acesso por permissões, carteira de clientes por vendedor e
-- configuração de dashboard por tenant.
--
-- Modelo:
--   roles             catálogo de perfis (global, mantido por migration).
--                     grants_all = perfil com todas as permissões (MASTER).
--                     rank = ordem para "não atribuir perfil acima do seu".
--   permissions       catálogo de permissões (global, por migration).
--   role_permissions  permissões padrão de cada perfil (global).
--   user_permissions  exceções por usuário (GRANT/REVOKE), por tenant.
--   permissões efetivas = grants_all ? catálogo
--                         : (padrão do perfil - REVOKE) + GRANT
--
-- OPERATOR (perfil antigo) é migrado para SELLER. users.role passa a ser
-- FK para roles (substitui o CHECK fixo do 001).
--
-- customers.responsible_seller_id: vendedor responsável pela carteira,
-- FK composta tenant-safe. Independe de sales.seller_id.
--
-- Forward-only e re-executável (cada passo verifica se já existe).
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  key TEXT PRIMARY KEY CHECK (key ~ '^[A-Z_]{2,30}$'),
  name TEXT NOT NULL,
  rank INT NOT NULL UNIQUE,
  grants_all BOOLEAN NOT NULL DEFAULT false
);

INSERT INTO roles (key, name, rank, grants_all) VALUES
  ('MASTER', 'Master', 100, true),
  ('ADMIN', 'Administrador', 80, false),
  ('MANAGER', 'Gerente', 60, false),
  ('SELLER', 'Vendedor', 40, false),
  ('VIEWER', 'Consulta', 20, false)
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, rank = EXCLUDED.rank, grants_all = EXCLUDED.grants_all;

CREATE TABLE IF NOT EXISTS permissions (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z_]+\.[a-z_]+$'),
  description TEXT NOT NULL,
  -- Só quem tem perfil grants_all pode conceder/remover esta permissão.
  master_only BOOLEAN NOT NULL DEFAULT false
);

INSERT INTO permissions (key, description, master_only) VALUES
  ('users.manage', 'Criar, editar, ativar/desativar usuários e definir perfil', false),
  ('permissions.manage', 'Conceder e remover permissões de usuários', true),
  ('customers.create', 'Cadastrar clientes', false),
  ('customers.read_all', 'Ver todos os clientes', false),
  ('customers.read_own', 'Ver clientes da própria carteira', false),
  ('customers.update_all', 'Editar qualquer cliente e reatribuir responsável', false),
  ('customers.update_own', 'Editar clientes da própria carteira', false),
  ('sales.create', 'Criar vendas', false),
  ('sales.read_all', 'Ver todas as vendas', false),
  ('sales.read_own', 'Ver as próprias vendas', false),
  ('sales.update_all', 'Editar, confirmar e cancelar qualquer venda', false),
  ('sales.update_own', 'Editar e confirmar as próprias vendas', false),
  ('sellers.read', 'Ver todos os vendedores', false),
  ('sellers.manage', 'Cadastrar vendedores e regras de comissão', false),
  ('commissions.read_all', 'Ver todas as comissões', false),
  ('commissions.read_own', 'Ver as próprias comissões', false),
  ('commissions.approve', 'Aprovar e ajustar comissões', false),
  ('commissions.pay', 'Pagar comissões', false),
  ('finance.read', 'Ver financeiro (contas, recebimentos, pagamentos)', false),
  ('finance.manage', 'Registrar recebimentos, despesas, pagamentos e estornos', false),
  ('reports.sales_all', 'Relatórios de vendas de todos os vendedores', false),
  ('reports.sales_own', 'Relatórios das próprias vendas', false),
  ('reports.sellers_all', 'Relatório comparativo de vendedores', false),
  ('reports.finance', 'Relatórios financeiros (fluxo de caixa)', false),
  ('dashboard.configure', 'Configurar o dashboard da agência', true),
  ('settings.manage', 'Cadastros: categorias, contas, formas de pagamento', false)
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description, master_only = EXCLUDED.master_only;

CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL REFERENCES roles (key),
  permission TEXT NOT NULL REFERENCES permissions (key),
  PRIMARY KEY (role, permission)
);

-- MASTER não precisa de linhas (grants_all).
INSERT INTO role_permissions (role, permission)
SELECT r, p FROM (VALUES
  ('ADMIN', 'customers.create'), ('ADMIN', 'customers.read_all'), ('ADMIN', 'customers.update_all'),
  ('ADMIN', 'sales.create'), ('ADMIN', 'sales.read_all'), ('ADMIN', 'sales.update_all'),
  ('ADMIN', 'sellers.read'), ('ADMIN', 'sellers.manage'),
  ('ADMIN', 'commissions.read_all'), ('ADMIN', 'commissions.approve'), ('ADMIN', 'commissions.pay'),
  ('ADMIN', 'finance.read'), ('ADMIN', 'finance.manage'),
  ('ADMIN', 'reports.sales_all'), ('ADMIN', 'reports.sellers_all'), ('ADMIN', 'reports.finance'),
  ('ADMIN', 'settings.manage'),

  ('MANAGER', 'customers.create'), ('MANAGER', 'customers.read_all'), ('MANAGER', 'customers.update_all'),
  ('MANAGER', 'sales.create'), ('MANAGER', 'sales.read_all'), ('MANAGER', 'sales.update_all'),
  ('MANAGER', 'sellers.read'), ('MANAGER', 'sellers.manage'),
  ('MANAGER', 'commissions.read_all'), ('MANAGER', 'commissions.approve'), ('MANAGER', 'commissions.pay'),
  ('MANAGER', 'finance.read'), ('MANAGER', 'finance.manage'),
  ('MANAGER', 'reports.sales_all'), ('MANAGER', 'reports.sellers_all'), ('MANAGER', 'reports.finance'),
  ('MANAGER', 'settings.manage'),

  ('SELLER', 'customers.create'), ('SELLER', 'customers.read_own'), ('SELLER', 'customers.update_own'),
  ('SELLER', 'sales.create'), ('SELLER', 'sales.read_own'), ('SELLER', 'sales.update_own'),
  ('SELLER', 'commissions.read_own'), ('SELLER', 'reports.sales_own'),

  ('VIEWER', 'customers.read_all'), ('VIEWER', 'sales.read_all'), ('VIEWER', 'sellers.read'),
  ('VIEWER', 'commissions.read_all'), ('VIEWER', 'finance.read'),
  ('VIEWER', 'reports.sales_all'), ('VIEWER', 'reports.sellers_all'), ('VIEWER', 'reports.finance')
) AS t (r, p)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS user_permissions (
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  user_id UUID NOT NULL,
  permission TEXT NOT NULL REFERENCES permissions (key),
  effect TEXT NOT NULL CHECK (effect IN ('GRANT', 'REVOKE')),
  granted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, permission),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id),
  FOREIGN KEY (tenant_id, granted_by) REFERENCES users (tenant_id, id)
);

-- users.role: CHECK fixo do 001 -> FK para roles; OPERATOR -> SELLER.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET role = 'SELLER', updated_at = now() WHERE role = 'OPERATOR';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_fk') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_fk FOREIGN KEY (role) REFERENCES roles (key);
  END IF;
END $$;

-- Um login representa no máximo um vendedor (base do escopo "_own").
CREATE UNIQUE INDEX IF NOT EXISTS uq_sellers_tenant_user
  ON sellers (tenant_id, user_id) WHERE user_id IS NOT NULL;

-- Carteira: vendedor responsável pelo cliente.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS responsible_seller_id UUID;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_responsible_seller_fk') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_responsible_seller_fk
      FOREIGN KEY (tenant_id, responsible_seller_id) REFERENCES sellers (tenant_id, id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_customers_tenant_responsible
  ON customers (tenant_id, responsible_seller_id);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_seller_date
  ON sales (tenant_id, seller_id, sale_date);

-- Dashboard: só a configuração (as definições dos widgets vivem no código).
CREATE TABLE IF NOT EXISTS dashboard_settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants (id),
  widgets JSONB NOT NULL CHECK (jsonb_typeof(widgets) = 'array'),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES users (tenant_id, id)
);

-- ------------------------------------------------------------
-- Grants + RLS
-- ------------------------------------------------------------

-- Catálogos globais: runtime só lê.
GRANT SELECT ON roles, permissions, role_permissions TO travel_lite_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_permissions, dashboard_settings TO travel_lite_runtime;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_permissions', 'dashboard_settings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_select_tenant') THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id = current_tenant_id()::uuid)',
                     t || '_select_tenant', t);
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id = current_tenant_id()::uuid)',
                     t || '_insert_tenant', t);
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (tenant_id = current_tenant_id()::uuid) WITH CHECK (tenant_id = current_tenant_id()::uuid)',
                     t || '_update_tenant', t);
      EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (tenant_id = current_tenant_id()::uuid)',
                     t || '_delete_tenant', t);
    END IF;
  END LOOP;
END $$;
