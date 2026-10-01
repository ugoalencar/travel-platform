-- ============================================================
-- TRAVEL LITE — 005_imports_financial_parties_sale_costs.sql
-- Importações assistidas, favorecidos financeiros e custos diretos.
--
-- Forward-only e re-executável. Não altera regras de comissão.
-- ============================================================

INSERT INTO permissions (key, description, master_only) VALUES
  ('imports.manage', 'Importar dados e reconciliar pendências', false),
  ('sale_costs.read_own', 'Ver custos das próprias vendas quando autorizado', false),
  ('sale_costs.read_all', 'Ver custos de todas as vendas', false),
  ('sale_costs.create', 'Criar custos diretos de venda', false),
  ('sale_costs.update', 'Editar custos diretos de venda', false),
  ('suppliers.manage', 'Gerenciar fornecedores e favorecidos financeiros', false)
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description, master_only = EXCLUDED.master_only;

INSERT INTO role_permissions (role, permission)
SELECT r, p FROM (VALUES
  ('ADMIN', 'imports.manage'),
  ('ADMIN', 'sale_costs.read_all'), ('ADMIN', 'sale_costs.create'), ('ADMIN', 'sale_costs.update'), ('ADMIN', 'suppliers.manage'),
  ('MANAGER', 'imports.manage'),
  ('MANAGER', 'sale_costs.read_all'), ('MANAGER', 'sale_costs.create'), ('MANAGER', 'sale_costs.update'), ('MANAGER', 'suppliers.manage')
) AS t (r, p)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  type TEXT NOT NULL CHECK (type IN ('CUSTOMERS', 'SALES')),
  filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'DRY_RUN', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_rows INT NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_rows INT NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  invalid_rows INT NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS import_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  batch_id UUID NOT NULL,
  source_row INT NOT NULL CHECK (source_row >= 1),
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  customer_name_snapshot TEXT,
  customer_cpf_snapshot TEXT,
  customer_birth_date_snapshot DATE,
  resolved_customer_id UUID,
  resolved_sale_id UUID,
  status TEXT NOT NULL
    CHECK (status IN ('READY', 'NEW', 'EXISTING', 'UNLINKED', 'CONFLICT', 'INVALID', 'IGNORED', 'IMPORTED')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, batch_id) REFERENCES import_batches (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, resolved_customer_id) REFERENCES customers (tenant_id, id),
  FOREIGN KEY (tenant_id, resolved_sale_id) REFERENCES sales (tenant_id, id),
  UNIQUE (tenant_id, batch_id, source_row),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS financial_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  type TEXT NOT NULL CHECK (type IN ('SUPPLIER', 'SERVICE_PROVIDER', 'OTHER')),
  name TEXT NOT NULL,
  document TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS sale_cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  sale_id UUID NOT NULL,
  financial_party_id UUID,
  cost_type TEXT NOT NULL CHECK (cost_type IN ('AIRFARE', 'HOTEL', 'TRANSFER', 'INSURANCE', 'FEE', 'OPERATOR', 'SERVICE', 'OTHER')),
  description TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  due_date DATE,
  payable_id UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, sale_id) REFERENCES sales (tenant_id, id),
  FOREIGN KEY (tenant_id, financial_party_id) REFERENCES financial_parties (tenant_id, id),
  FOREIGN KEY (tenant_id, payable_id) REFERENCES payables (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id),
  UNIQUE (tenant_id, id)
);

ALTER TABLE payables
  ADD COLUMN IF NOT EXISTS financial_party_id UUID,
  ADD COLUMN IF NOT EXISTS sale_id UUID,
  ADD COLUMN IF NOT EXISTS sale_cost_item_id UUID,
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS financial_party_id UUID,
  ADD COLUMN IF NOT EXISTS sale_id UUID,
  ADD COLUMN IF NOT EXISTS sale_cost_item_id UUID,
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS paid_by_user_id UUID;

ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS financial_party_id UUID,
  ADD COLUMN IF NOT EXISTS sale_id UUID,
  ADD COLUMN IF NOT EXISTS sale_cost_item_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payables_financial_party_fk') THEN
    ALTER TABLE payables ADD CONSTRAINT payables_financial_party_fk
      FOREIGN KEY (tenant_id, financial_party_id) REFERENCES financial_parties (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payables_sale_fk') THEN
    ALTER TABLE payables ADD CONSTRAINT payables_sale_fk
      FOREIGN KEY (tenant_id, sale_id) REFERENCES sales (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payables_sale_cost_item_fk') THEN
    ALTER TABLE payables ADD CONSTRAINT payables_sale_cost_item_fk
      FOREIGN KEY (tenant_id, sale_cost_item_id) REFERENCES sale_cost_items (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payables_approved_by_fk') THEN
    ALTER TABLE payables ADD CONSTRAINT payables_approved_by_fk
      FOREIGN KEY (tenant_id, approved_by_user_id) REFERENCES users (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_financial_party_fk') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_financial_party_fk
      FOREIGN KEY (tenant_id, financial_party_id) REFERENCES financial_parties (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_sale_fk') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_sale_fk
      FOREIGN KEY (tenant_id, sale_id) REFERENCES sales (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_sale_cost_item_fk') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_sale_cost_item_fk
      FOREIGN KEY (tenant_id, sale_cost_item_id) REFERENCES sale_cost_items (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_approved_by_fk') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_approved_by_fk
      FOREIGN KEY (tenant_id, approved_by_user_id) REFERENCES users (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_paid_by_fk') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_paid_by_fk
      FOREIGN KEY (tenant_id, paid_by_user_id) REFERENCES users (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_transactions_financial_party_fk') THEN
    ALTER TABLE financial_transactions ADD CONSTRAINT financial_transactions_financial_party_fk
      FOREIGN KEY (tenant_id, financial_party_id) REFERENCES financial_parties (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_transactions_sale_fk') THEN
    ALTER TABLE financial_transactions ADD CONSTRAINT financial_transactions_sale_fk
      FOREIGN KEY (tenant_id, sale_id) REFERENCES sales (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_transactions_sale_cost_item_fk') THEN
    ALTER TABLE financial_transactions ADD CONSTRAINT financial_transactions_sale_cost_item_fk
      FOREIGN KEY (tenant_id, sale_cost_item_id) REFERENCES sale_cost_items (tenant_id, id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_import_batches_tenant_status ON import_batches (tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_import_records_tenant_batch_status ON import_records (tenant_id, batch_id, status);
CREATE INDEX IF NOT EXISTS idx_import_records_customer_resolution ON import_records (tenant_id, resolved_customer_id) WHERE resolved_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financial_parties_tenant_type_name ON financial_parties (tenant_id, type, name);
CREATE INDEX IF NOT EXISTS idx_sale_cost_items_tenant_sale ON sale_cost_items (tenant_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_cost_items_tenant_party ON sale_cost_items (tenant_id, financial_party_id) WHERE financial_party_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_sale_cost_items_payable ON sale_cost_items (tenant_id, payable_id) WHERE payable_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_payables_sale_cost_item ON payables (tenant_id, sale_cost_item_id) WHERE sale_cost_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payables_financial_party ON payables (tenant_id, financial_party_id) WHERE financial_party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_financial_party ON payments (tenant_id, financial_party_id) WHERE financial_party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financial_transactions_financial_party ON financial_transactions (tenant_id, financial_party_id) WHERE financial_party_id IS NOT NULL;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['import_batches', 'import_records', 'financial_parties', 'sale_cost_items'] LOOP
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

GRANT SELECT, INSERT, UPDATE, DELETE ON import_batches, import_records, financial_parties, sale_cost_items TO travel_lite_runtime;
