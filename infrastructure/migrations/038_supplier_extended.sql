-- Extend the existing `suppliers` table (created in 003_transportation.sql, used by the
-- Transport domain via /transport/suppliers) into the fuller business Supplier entity
-- required by the Suppliers + Supplier Categories wave. All changes are additive and
-- nullable/defaulted so the existing Transport supplier flow keeps working unchanged.

CREATE TYPE "SupplierType" AS ENUM ('TRAVEL', 'OPERATIONAL', 'BOTH');

CREATE TYPE "SupplierCategory" AS ENUM (
  -- Travel side
  'AIRLINE', 'CONSOLIDATOR', 'HOTEL', 'RESORT', 'TOUR_OPERATOR', 'TRANSFER',
  'CAR_RENTAL', 'TRAVEL_INSURANCE', 'TOUR', 'GUIDE', 'CRUISE', 'TRAIN', 'BUS',
  'TICKET_PROVIDER', 'RECEPTIVE_OPERATOR',
  -- Operational side
  'RENT', 'ELECTRICITY', 'WATER', 'INTERNET', 'PHONE', 'SOFTWARE', 'ACCOUNTING',
  'LEGAL', 'MARKETING', 'OFFICE', 'CLEANING', 'MAINTENANCE', 'EQUIPMENT',
  'BANKING', 'INSURANCE', 'OTHER'
);

ALTER TABLE suppliers
  ADD COLUMN trade_name TEXT,
  ADD COLUMN supplier_type "SupplierType" NOT NULL DEFAULT 'TRAVEL',
  ADD COLUMN email TEXT,
  ADD COLUMN phone TEXT,
  ADD COLUMN website TEXT,
  ADD COLUMN address_line TEXT,
  ADD COLUMN address_city TEXT,
  ADD COLUMN address_state TEXT,
  ADD COLUMN address_zip TEXT,
  ADD COLUMN address_country TEXT,
  ADD COLUMN bank_name TEXT,
  ADD COLUMN bank_branch TEXT,
  ADD COLUMN bank_account TEXT,
  ADD COLUMN bank_pix TEXT,
  ADD COLUMN payment_terms TEXT,
  ADD COLUMN notes TEXT;

-- `document` (added in 003_transportation.sql) is reused as the tax id (CNPJ/CPF).
-- `name` is reused as the legal/business name. `active` is reused as the status flag.

CREATE TABLE supplier_category_links (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  category "SupplierCategory" NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT supplier_category_links_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT supplier_category_links_supplier_fk
    FOREIGN KEY (agency_id, supplier_id) REFERENCES suppliers (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT supplier_category_links_unique UNIQUE (supplier_id, category)
);

CREATE INDEX supplier_category_links_supplier_idx ON supplier_category_links (supplier_id);
CREATE INDEX supplier_category_links_agency_idx ON supplier_category_links (agency_id);

ALTER TABLE supplier_category_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_category_links_select_tenant ON supplier_category_links
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY supplier_category_links_insert_tenant ON supplier_category_links
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY supplier_category_links_update_tenant ON supplier_category_links
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY supplier_category_links_delete_tenant ON supplier_category_links
  FOR DELETE
  USING (agency_id = current_agency_id());
