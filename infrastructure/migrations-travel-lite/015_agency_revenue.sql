-- ============================================================
-- TRAVEL LITE — 015_agency_revenue.sql
-- Onda D (ADR-007, Frente 6/7). Espelha o contrato validado no Full (106):
--   * agency_revenue_scopes / agency_revenue_rule_versions: regra de receita
--     da agência versionada e append-only (escopo fornecedor/produto/categoria);
--   * agency_revenue_entries: uma linha por item de venda, com snapshot do
--     cálculo e estados PENDING_RULE|FORECAST|ENTITLED|AVAILABLE|RECEIVED|CANCELLED;
--   * seller_commissions.agency_revenue_entry_id: vínculo OPCIONAL, só para
--     análise (D3: sem netting, sem dependência do recebimento do fornecedor);
--   * permissões revenue.rules_manage / revenue.read_all / revenue.receive.
-- A base MARGIN não existe no Lite (sale_items não guarda custo): o servidor a
-- recusa. Lotes/janelas (D7) são da Onda E. Forward-only; não altera dados.
-- ============================================================

CREATE TABLE IF NOT EXISTS agency_revenue_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  supplier_id UUID,
  product_id UUID,
  category_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  legacy_ref TEXT,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES financial_parties (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES catalog_products (tenant_id, id),
  FOREIGN KEY (tenant_id, category_id) REFERENCES sale_categories (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS agency_revenue_scopes_tuple_uidx ON agency_revenue_scopes (
  tenant_id,
  COALESCE(supplier_id::text, ''), COALESCE(product_id::text, ''), COALESCE(category_id::text, '')
);

CREATE TABLE IF NOT EXISTS agency_revenue_rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  scope_id UUID NOT NULL,
  version_number INT NOT NULL CHECK (version_number >= 1),
  effective_from DATE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('PERCENTAGE', 'FIXED_PER_PASSENGER', 'FIXED_PER_SALE', 'FIXED_PER_ITEM', 'NONE')),
  base_selector TEXT CHECK (base_selector IN ('LINE_TOTAL', 'NET_FARE', 'TAXES', 'FEES', 'TAXES_AND_FEES')),
  value NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (value >= 0),
  entitlement_event TEXT NOT NULL DEFAULT 'ON_FULL_SETTLEMENT'
    CHECK (entitlement_event IN ('ON_SALE_CONFIRMATION', 'ON_FULL_SETTLEMENT', 'ON_BALANCE_DEADLINE')),
  collection_model TEXT NOT NULL DEFAULT 'AGENCY_COLLECTS'
    CHECK (collection_model IN ('AGENCY_COLLECTS', 'SUPPLIER_COLLECTS')),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 300),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  calc_version INT NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, scope_id, version_number),
  FOREIGN KEY (tenant_id, scope_id) REFERENCES agency_revenue_scopes (tenant_id, id),
  CHECK ((mode = 'PERCENTAGE') = (base_selector IS NOT NULL)),
  CHECK (mode <> 'PERCENTAGE' OR value <= 100),
  CHECK (collection_model = 'AGENCY_COLLECTS' OR entitlement_event = 'ON_SALE_CONFIRMATION')
);

CREATE TABLE IF NOT EXISTS agency_revenue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  sale_item_id UUID NOT NULL,
  supplier_id UUID,
  rule_version_id UUID,
  status TEXT NOT NULL CHECK (status IN ('PENDING_RULE', 'FORECAST', 'ENTITLED', 'AVAILABLE', 'RECEIVED', 'CANCELLED')),
  entitlement_event TEXT,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  base_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (base_amount >= 0),
  calc_version INT NOT NULL DEFAULT 1,
  memory JSONB NOT NULL DEFAULT '{}'::jsonb,
  entitled_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  received_amount NUMERIC(14, 2),
  received_reference TEXT,
  cancelled_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  legacy_ref TEXT,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, sale_id) REFERENCES sales (tenant_id, id),
  FOREIGN KEY (tenant_id, sale_item_id) REFERENCES sale_items (tenant_id, id),
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES financial_parties (tenant_id, id),
  FOREIGN KEY (tenant_id, rule_version_id) REFERENCES agency_revenue_rule_versions (tenant_id, id),
  CHECK (status <> 'PENDING_RULE' OR amount = 0),
  CHECK ((status = 'RECEIVED') = (received_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS agency_revenue_entries_live_item_uidx
  ON agency_revenue_entries (tenant_id, sale_item_id) WHERE status <> 'CANCELLED';
CREATE INDEX IF NOT EXISTS agency_revenue_entries_sale_idx ON agency_revenue_entries (tenant_id, sale_id);

ALTER TABLE seller_commissions ADD COLUMN IF NOT EXISTS agency_revenue_entry_id UUID;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seller_commissions_revenue_entry_fk') THEN
    ALTER TABLE seller_commissions ADD CONSTRAINT seller_commissions_revenue_entry_fk
      FOREIGN KEY (tenant_id, agency_revenue_entry_id) REFERENCES agency_revenue_entries (tenant_id, id);
  END IF;
END $$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['agency_revenue_scopes', 'agency_revenue_rule_versions', 'agency_revenue_entries'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_select_tenant') THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id = current_tenant_id()::uuid)', t || '_select_tenant', t);
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id = current_tenant_id()::uuid)', t || '_insert_tenant', t);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'agency_revenue_entries' AND policyname = 'agency_revenue_entries_update_tenant') THEN
    CREATE POLICY agency_revenue_entries_update_tenant ON agency_revenue_entries
      FOR UPDATE USING (tenant_id = current_tenant_id()::uuid) WITH CHECK (tenant_id = current_tenant_id()::uuid);
  END IF;
END $$;

-- Scopes and rule versions are append-only; entries only move through states (no DELETE).
GRANT SELECT, INSERT ON agency_revenue_scopes, agency_revenue_rule_versions TO travel_lite_runtime;
GRANT SELECT, INSERT, UPDATE ON agency_revenue_entries TO travel_lite_runtime;

INSERT INTO permissions (key, description, master_only) VALUES
  ('revenue.rules_manage', 'Receita da agência: cadastrar e revisar regras por fornecedor/produto', false),
  ('revenue.read_all', 'Receita da agência: consultar regras e lançamentos', false),
  ('revenue.receive', 'Receita da agência: registrar o recebimento do fornecedor e cancelar lançamentos', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role, permission) VALUES
  ('ADMIN', 'revenue.rules_manage'), ('ADMIN', 'revenue.read_all'), ('ADMIN', 'revenue.receive'),
  ('MANAGER', 'revenue.read_all')
ON CONFLICT DO NOTHING;
