-- ============================================================
-- AGENCY REVENUE (ADR-007, Frente 6/7 -- Onda D)
-- ============================================================
-- Receita da agência: o que o fornecedor deve à AGÊNCIA. É outra grandeza
-- que valor vendido, repasse ao fornecedor e comissão de funcionário; não
-- compartilha tabela com nenhuma delas.
--   * agency_revenue_scopes         escopo (fornecedor/produto/categoria);
--   * agency_revenue_rule_versions  versões append-only da regra;
--   * agency_revenue_entries        uma linha por item de venda, com snapshot
--                                    do cálculo e estados
--                                    PENDING_RULE|FORECAST|ENTITLED|AVAILABLE|
--                                    RECEIVED|CANCELLED.
-- Lotes/janelas (D7) pertencem à Onda E: AVAILABLE existe como estado, mas
-- nada o produz ainda. Aditiva; não altera dados existentes.
-- commission_entries.agency_revenue_entry_id: vínculo OPCIONAL, só para
-- análise (D3: sem netting, sem dependência do recebimento do fornecedor).
-- ============================================================

CREATE TABLE agency_revenue_scopes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL REFERENCES agencies (id),
  supplier_id TEXT,
  product_id TEXT,
  category_id TEXT,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  legacy_ref TEXT,
  CONSTRAINT agency_revenue_scopes_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT agency_revenue_scopes_supplier_fk
    FOREIGN KEY (agency_id, supplier_id) REFERENCES suppliers (agency_id, id),
  CONSTRAINT agency_revenue_scopes_product_fk
    FOREIGN KEY (agency_id, product_id) REFERENCES travel_products (agency_id, id),
  CONSTRAINT agency_revenue_scopes_category_fk
    FOREIGN KEY (agency_id, category_id) REFERENCES commission_categories (agency_id, id)
);
-- One scope per combination; NULL parts are normalised so the default scope is unique too.
CREATE UNIQUE INDEX agency_revenue_scopes_tuple_uidx ON agency_revenue_scopes (
  agency_id, COALESCE(supplier_id, ''), COALESCE(product_id, ''), COALESCE(category_id, '')
);

CREATE TABLE agency_revenue_rule_versions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  effective_from DATE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('PERCENTAGE', 'FIXED_PER_PASSENGER', 'FIXED_PER_SALE', 'FIXED_PER_ITEM', 'NONE')),
  base_selector TEXT CHECK (base_selector IN ('LINE_TOTAL', 'NET_FARE', 'TAXES', 'FEES', 'TAXES_AND_FEES', 'MARGIN')),
  value NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (value >= 0),
  entitlement_event TEXT NOT NULL DEFAULT 'ON_FULL_SETTLEMENT'
    CHECK (entitlement_event IN ('ON_SALE_CONFIRMATION', 'ON_FULL_SETTLEMENT', 'ON_BALANCE_DEADLINE')),
  collection_model TEXT NOT NULL DEFAULT 'AGENCY_COLLECTS'
    CHECK (collection_model IN ('AGENCY_COLLECTS', 'SUPPLIER_COLLECTS')),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 300),
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  calc_version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT agency_revenue_rule_versions_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT agency_revenue_rule_versions_scope_fk
    FOREIGN KEY (agency_id, scope_id) REFERENCES agency_revenue_scopes (agency_id, id),
  CONSTRAINT agency_revenue_rule_versions_version_uq UNIQUE (agency_id, scope_id, version_number),
  CONSTRAINT agency_revenue_rule_versions_base_check
    CHECK ((mode = 'PERCENTAGE') = (base_selector IS NOT NULL)),
  CONSTRAINT agency_revenue_rule_versions_percent_check
    CHECK (mode <> 'PERCENTAGE' OR value <= 100),
  CONSTRAINT agency_revenue_rule_versions_margin_check
    CHECK (base_selector IS DISTINCT FROM 'MARGIN' OR collection_model = 'AGENCY_COLLECTS'),
  -- Supplier-collected sales have no customer settlement to wait for.
  CONSTRAINT agency_revenue_rule_versions_supplier_collects_check
    CHECK (collection_model = 'AGENCY_COLLECTS' OR entitlement_event = 'ON_SALE_CONFIRMATION')
);

CREATE TABLE agency_revenue_entries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  sale_item_id TEXT NOT NULL,
  supplier_id TEXT,
  rule_version_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING_RULE', 'FORECAST', 'ENTITLED', 'AVAILABLE', 'RECEIVED', 'CANCELLED')),
  entitlement_event TEXT,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  base_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (base_amount >= 0),
  calc_version INTEGER NOT NULL DEFAULT 1,
  memory JSONB NOT NULL DEFAULT '{}'::jsonb,
  entitled_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  received_amount NUMERIC(14, 2),
  received_reference TEXT,
  cancelled_at TIMESTAMPTZ,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  legacy_ref TEXT,
  CONSTRAINT agency_revenue_entries_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT agency_revenue_entries_sale_fk
    FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id),
  CONSTRAINT agency_revenue_entries_item_fk
    FOREIGN KEY (agency_id, sale_item_id) REFERENCES sale_items (agency_id, id),
  CONSTRAINT agency_revenue_entries_supplier_fk
    FOREIGN KEY (agency_id, supplier_id) REFERENCES suppliers (agency_id, id),
  CONSTRAINT agency_revenue_entries_rule_fk
    FOREIGN KEY (agency_id, rule_version_id) REFERENCES agency_revenue_rule_versions (agency_id, id),
  CONSTRAINT agency_revenue_entries_pending_zero_check
    CHECK (status <> 'PENDING_RULE' OR amount = 0),
  CONSTRAINT agency_revenue_entries_received_check
    CHECK ((status = 'RECEIVED') = (received_at IS NOT NULL))
);
-- At most one live entry per item (cancelled history is kept).
CREATE UNIQUE INDEX agency_revenue_entries_live_item_uidx
  ON agency_revenue_entries (agency_id, sale_item_id) WHERE status <> 'CANCELLED';
CREATE INDEX agency_revenue_entries_sale_idx ON agency_revenue_entries (agency_id, sale_id);

ALTER TABLE commission_entries ADD COLUMN agency_revenue_entry_id TEXT;
ALTER TABLE commission_entries ADD CONSTRAINT commission_entries_revenue_entry_fk
  FOREIGN KEY (agency_id, agency_revenue_entry_id) REFERENCES agency_revenue_entries (agency_id, id);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['agency_revenue_scopes', 'agency_revenue_rule_versions', 'agency_revenue_entries'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (agency_id = current_agency_id())', t || '_select_tenant', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (agency_id = current_agency_id())', t || '_insert_tenant', t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', t);
  END LOOP;
END $$;
-- Entries move through states: UPDATE only there. Scopes and rule versions are append-only.
CREATE POLICY agency_revenue_entries_update_tenant ON agency_revenue_entries
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());

DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['travel_app_runtime', 'travel_app_runtime_local'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT, INSERT ON agency_revenue_scopes, agency_revenue_rule_versions TO %I', role_name);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON agency_revenue_entries TO %I', role_name);
    END IF;
  END LOOP;
END $$;

INSERT INTO schema_migrations (version) VALUES ('106') ON CONFLICT (version) DO NOTHING;
