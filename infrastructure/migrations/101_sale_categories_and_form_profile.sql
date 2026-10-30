-- ============================================================
-- 101_sale_categories_and_form_profile.sql
-- Onda B (Gadotti, ADR-008): categoria de venda configurável, perfil de
-- formulário por categoria e campos de primeira classe na venda.
--   * commission_categories: catálogo ÚNICO de categorias da agência (F1). A
--     mesma entidade serve a categoria de venda e, nas fases seguintes, às
--     regras de comissão de funcionário. Contrato comum com o Lite:
--     { id, name, active, sort_order, legacy_ref }.
--   * sale_category_fields: perfil do formulário (field_key do registro em
--     código, enabled, required). A configuração é por chave de texto, sem DDL
--     por campo.
--   * sales: sale_date (data civil), campos de relatório de primeira classe,
--     modality_data (JSONB por field_key), form_snapshot (perfil aplicado) e
--     category_id (FK composta por agência).
-- Aditiva: não apaga nem reescreve valores existentes. Vendas antigas ganham
-- apenas sale_date (data civil de created_at no fuso America/Sao_Paulo, o mesmo
-- fuso do default de novas vendas, independente do fuso da sessão) e ficam
-- sem categoria. Não edita nenhuma migration anterior.
-- ============================================================

CREATE TABLE commission_categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  form_revision INTEGER NOT NULL DEFAULT 0,
  legacy_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT commission_categories_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commission_categories_name_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT commission_categories_revision_check CHECK (form_revision >= 0),
  CONSTRAINT commission_categories_agency_id_key UNIQUE (agency_id, id)
);

CREATE UNIQUE INDEX commission_categories_agency_name_key
  ON commission_categories (agency_id, lower(btrim(name)));

CREATE INDEX commission_categories_agency_order_idx
  ON commission_categories (agency_id, sort_order, name);

CREATE TABLE sale_category_fields (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  group_name TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sale_category_fields_category_tenant_fk
    FOREIGN KEY (agency_id, category_id) REFERENCES commission_categories (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT sale_category_fields_key_format_check
    CHECK (field_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT sale_category_fields_required_enabled_check
    CHECK (NOT required OR enabled),
  CONSTRAINT sale_category_fields_category_key_key
    UNIQUE (agency_id, category_id, field_key)
);

ALTER TABLE sales
  ADD COLUMN category_id TEXT,
  ADD COLUMN sale_date DATE,
  ADD COLUMN travel_start_date DATE,
  ADD COLUMN travel_end_date DATE,
  ADD COLUMN origin_text TEXT,
  ADD COLUMN destination_text TEXT,
  ADD COLUMN passenger_count INTEGER,
  ADD COLUMN modality_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN form_snapshot JSONB;

UPDATE sales
   SET sale_date = (created_at AT TIME ZONE 'America/Sao_Paulo')::date
 WHERE sale_date IS NULL;

ALTER TABLE sales
  ALTER COLUMN sale_date SET NOT NULL,
  ALTER COLUMN sale_date SET DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date);

ALTER TABLE sales
  ADD CONSTRAINT sales_category_tenant_fk
    FOREIGN KEY (agency_id, category_id) REFERENCES commission_categories (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT sales_travel_dates_check
    CHECK (travel_end_date IS NULL OR travel_start_date IS NULL OR travel_end_date >= travel_start_date),
  ADD CONSTRAINT sales_passenger_count_check
    CHECK (passenger_count IS NULL OR passenger_count BETWEEN 1 AND 999),
  ADD CONSTRAINT sales_modality_data_object_check
    CHECK (jsonb_typeof(modality_data) = 'object');

CREATE INDEX sales_agency_category_idx
  ON sales (agency_id, category_id)
  WHERE category_id IS NOT NULL;

CREATE INDEX sales_agency_sale_date_idx
  ON sales (agency_id, sale_date DESC);

ALTER TABLE commission_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE sale_category_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_category_fields FORCE ROW LEVEL SECURITY;

CREATE POLICY commission_categories_select_tenant ON commission_categories
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY commission_categories_insert_tenant ON commission_categories
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY commission_categories_update_tenant ON commission_categories
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY commission_categories_delete_tenant ON commission_categories
  FOR DELETE USING (agency_id = current_agency_id());

CREATE POLICY sale_category_fields_select_tenant ON sale_category_fields
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY sale_category_fields_insert_tenant ON sale_category_fields
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY sale_category_fields_update_tenant ON sale_category_fields
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY sale_category_fields_delete_tenant ON sale_category_fields
  FOR DELETE USING (agency_id = current_agency_id());

REVOKE ALL ON commission_categories FROM PUBLIC;
REVOKE ALL ON sale_category_fields FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime_local') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON commission_categories TO travel_app_runtime_local;
    GRANT SELECT, INSERT, UPDATE, DELETE ON sale_category_fields TO travel_app_runtime_local;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON commission_categories TO travel_app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON sale_category_fields TO travel_app_runtime;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

INSERT INTO schema_migrations (version) VALUES ('101') ON CONFLICT (version) DO NOTHING;
