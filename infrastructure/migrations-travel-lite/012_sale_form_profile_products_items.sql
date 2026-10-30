-- ============================================================
-- TRAVEL LITE — 012_sale_form_profile_products_items.sql
-- Onda B (ADR-008). Espelha o contrato validado no Full (migration 101):
--   * sale_categories ganha form_revision e legacy_ref;
--   * sale_category_fields: perfil do formulário de venda por categoria
--     (field_key do registro em código; enabled; required);
--   * sales ganha os campos de primeira classe do Full (a data da venda
--     `sale_date` já existe desde a 001), modality_data e form_snapshot;
--   * catalog_products: produto atrelado a categoria e fornecedor;
--   * sale_items: itens/componentes da venda (a soma dos itens ativos vira o
--     valor bruto da venda).
-- Forward-only e re-executável. Não altera nem apaga dados existentes.
-- Vendas antigas ficam sem form_snapshot (o servidor o cria no primeiro
-- uso do formulário configurável).
-- ============================================================

ALTER TABLE sale_categories
  ADD COLUMN IF NOT EXISTS form_revision INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS legacy_ref TEXT;

CREATE TABLE IF NOT EXISTS sale_category_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  category_id UUID NOT NULL,
  field_key TEXT NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  enabled BOOLEAN NOT NULL DEFAULT true,
  required BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  group_name TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NOT required OR enabled),
  FOREIGN KEY (tenant_id, category_id) REFERENCES sale_categories (tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, category_id, field_key)
);

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS travel_start_date DATE,
  ADD COLUMN IF NOT EXISTS travel_end_date DATE,
  ADD COLUMN IF NOT EXISTS origin_text TEXT,
  ADD COLUMN IF NOT EXISTS destination_text TEXT,
  ADD COLUMN IF NOT EXISTS passenger_count INT,
  ADD COLUMN IF NOT EXISTS modality_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS form_snapshot JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_travel_dates_check') THEN
    ALTER TABLE sales ADD CONSTRAINT sales_travel_dates_check
      CHECK (travel_end_date IS NULL OR travel_start_date IS NULL OR travel_end_date >= travel_start_date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_passenger_count_check') THEN
    ALTER TABLE sales ADD CONSTRAINT sales_passenger_count_check
      CHECK (passenger_count IS NULL OR passenger_count BETWEEN 1 AND 999);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_modality_data_object_check') THEN
    ALTER TABLE sales ADD CONSTRAINT sales_modality_data_object_check
      CHECK (jsonb_typeof(modality_data) = 'object');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS catalog_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  category_id UUID,
  default_supplier_id UUID,
  active BOOLEAN NOT NULL DEFAULT true,
  legacy_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, category_id) REFERENCES sale_categories (tenant_id, id),
  FOREIGN KEY (tenant_id, default_supplier_id) REFERENCES financial_parties (tenant_id, id),
  UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_catalog_products_tenant_name
  ON catalog_products (tenant_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  sale_id UUID NOT NULL,
  product_id UUID,
  supplier_id UUID,
  description TEXT NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 300),
  -- same precision as the Full sale_items (migration 055): the Lite never exceeds the Full
  qty NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  taxes NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (taxes >= 0),
  fees NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fees >= 0),
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
  legacy_ref TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, sale_id) REFERENCES sales (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES catalog_products (tenant_id, id),
  FOREIGN KEY (tenant_id, supplier_id) REFERENCES financial_parties (tenant_id, id),
  UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_sale_items_tenant_sale ON sale_items (tenant_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_catalog_products_tenant_category ON catalog_products (tenant_id, category_id) WHERE category_id IS NOT NULL;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sale_category_fields', 'catalog_products', 'sale_items'] LOOP
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

GRANT SELECT, INSERT, UPDATE, DELETE ON sale_category_fields, catalog_products, sale_items TO travel_lite_runtime;
