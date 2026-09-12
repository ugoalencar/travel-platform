-- ============================================================
-- INSURANCE (Seguro): products, sold policies, covered travelers,
-- policy documents.
-- ============================================================
-- Spec: docs/travel_platform_mega_pack/architecture/PRODUCTS_UPSELL_INSURANCE.md
-- "Seguro converge em SaleItem + Finance."
--
-- No SaleItem table exists in this worktree yet (Agent 08/Upsell owns it
-- concurrently). InsurancePolicy therefore carries its own cost/sale/
-- commission values directly, plus a nullable sale_item_id placeholder FK
-- column left unconstrained (no target table to reference yet) so a future
-- integration migration can backfill and constrain it once SaleItem lands,
-- instead of this table ever growing a second, permanent copy of that data.
--
-- Financial convergence happens through the existing receivables path
-- (financial.ts createReceivable / the sales.ts sync pattern), not a new
-- parallel AR table -- insurance_policies only stores what it sold, the
-- receivable itself lives in `receivables` linked by sale_id.
-- ============================================================

CREATE TYPE "InsurancePolicyStatus" AS ENUM (
  'QUOTED', 'ISSUED', 'ACTIVE', 'EXPIRED', 'CANCELLED'
);

-- 1. InsuranceProduct: catalog of insurer plans an agency sells.
CREATE TABLE insurance_products (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  insurer_name TEXT NOT NULL,
  supplier_id TEXT,
  broker_name TEXT,
  plan_name TEXT NOT NULL,
  coverage_description TEXT,
  cost_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  price_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT insurance_products_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT insurance_products_supplier_tenant_fk
    FOREIGN KEY (agency_id, supplier_id) REFERENCES suppliers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT insurance_products_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT insurance_products_cost_nonneg_check CHECK (cost_amount >= 0),
  CONSTRAINT insurance_products_price_nonneg_check CHECK (price_amount >= 0)
);

CREATE INDEX insurance_products_agency_idx ON insurance_products (agency_id)
  WHERE deleted_at IS NULL;

ALTER TABLE insurance_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_products FORCE ROW LEVEL SECURITY;

CREATE POLICY insurance_products_select_tenant ON insurance_products
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY insurance_products_insert_tenant ON insurance_products
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY insurance_products_update_tenant ON insurance_products
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY insurance_products_delete_tenant ON insurance_products
  FOR DELETE USING (agency_id = current_agency_id());

-- 2. InsurancePolicy: an actual sold policy.
CREATE TABLE insurance_policies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  insurance_product_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  sale_id TEXT,
  -- Placeholder integration point for Agent 08's SaleItem table. Left
  -- unconstrained (no FK target exists yet in this worktree); document at
  -- integration time before adding a real FK + backfill.
  sale_item_id TEXT,
  policy_number TEXT,
  coverage_start DATE NOT NULL,
  coverage_end DATE NOT NULL,
  cost_amount NUMERIC(12,2) NOT NULL,
  sale_amount NUMERIC(12,2) NOT NULL,
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status "InsurancePolicyStatus" NOT NULL DEFAULT 'QUOTED',
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  receivable_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT insurance_policies_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT insurance_policies_product_tenant_fk
    FOREIGN KEY (agency_id, insurance_product_id) REFERENCES insurance_products (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT insurance_policies_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT insurance_policies_sale_tenant_fk
    FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT insurance_policies_receivable_tenant_fk
    FOREIGN KEY (agency_id, receivable_id) REFERENCES receivables (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT insurance_policies_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT insurance_policies_cost_nonneg_check CHECK (cost_amount >= 0),
  CONSTRAINT insurance_policies_sale_nonneg_check CHECK (sale_amount >= 0),
  CONSTRAINT insurance_policies_commission_nonneg_check CHECK (commission_amount >= 0),
  CONSTRAINT insurance_policies_coverage_dates_check CHECK (coverage_end >= coverage_start)
);

CREATE INDEX insurance_policies_agency_idx ON insurance_policies (agency_id)
  WHERE deleted_at IS NULL;
CREATE INDEX insurance_policies_agency_customer_idx ON insurance_policies (agency_id, customer_id)
  WHERE deleted_at IS NULL;
CREATE INDEX insurance_policies_agency_sale_idx ON insurance_policies (agency_id, sale_id)
  WHERE deleted_at IS NULL;

ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policies FORCE ROW LEVEL SECURITY;

CREATE POLICY insurance_policies_select_tenant ON insurance_policies
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY insurance_policies_insert_tenant ON insurance_policies
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY insurance_policies_update_tenant ON insurance_policies
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY insurance_policies_delete_tenant ON insurance_policies
  FOR DELETE USING (agency_id = current_agency_id());

-- 3. InsuranceTraveler: which customer/dependent is covered by a policy.
CREATE TABLE insurance_travelers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  insurance_policy_id TEXT NOT NULL,
  customer_id TEXT,
  dependent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT insurance_travelers_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT insurance_travelers_policy_tenant_fk
    FOREIGN KEY (agency_id, insurance_policy_id) REFERENCES insurance_policies (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT insurance_travelers_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT insurance_travelers_dependent_tenant_fk
    FOREIGN KEY (agency_id, dependent_id) REFERENCES customer_dependents (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT insurance_travelers_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT insurance_travelers_exactly_one_check CHECK (
    (customer_id IS NOT NULL AND dependent_id IS NULL) OR
    (customer_id IS NULL AND dependent_id IS NOT NULL)
  )
);

CREATE INDEX insurance_travelers_agency_policy_idx ON insurance_travelers (agency_id, insurance_policy_id)
  WHERE deleted_at IS NULL;

ALTER TABLE insurance_travelers ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_travelers FORCE ROW LEVEL SECURITY;

CREATE POLICY insurance_travelers_select_tenant ON insurance_travelers
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY insurance_travelers_insert_tenant ON insurance_travelers
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY insurance_travelers_update_tenant ON insurance_travelers
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY insurance_travelers_delete_tenant ON insurance_travelers
  FOR DELETE USING (agency_id = current_agency_id());

-- 4. InsuranceDocument: metadata-only, mirrors customer_documents pattern
-- (no real binary upload path exists in this codebase yet).
CREATE TABLE insurance_documents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  insurance_policy_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  storage_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT insurance_documents_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT insurance_documents_policy_tenant_fk
    FOREIGN KEY (agency_id, insurance_policy_id) REFERENCES insurance_policies (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT insurance_documents_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX insurance_documents_agency_policy_idx ON insurance_documents (agency_id, insurance_policy_id)
  WHERE deleted_at IS NULL;

ALTER TABLE insurance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_documents FORCE ROW LEVEL SECURITY;

CREATE POLICY insurance_documents_select_tenant ON insurance_documents
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY insurance_documents_insert_tenant ON insurance_documents
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY insurance_documents_update_tenant ON insurance_documents
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY insurance_documents_delete_tenant ON insurance_documents
  FOR DELETE USING (agency_id = current_agency_id());
