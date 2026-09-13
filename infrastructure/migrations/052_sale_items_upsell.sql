-- ============================================================
-- SALE ITEMS + PROPOSAL OPTIONAL ITEMS + UPSELL ("Turbine sua Viagem")
-- ============================================================
-- Agent 08 (Upsell). Adds line-item detail to Sales/Proposals plus a
-- simple contextual upsell rule engine and its generated suggestions.
--
-- IMPORTANT (financial authority): sale_items/proposal_optional_items
-- carry their OWN line-level subtotal (qty * unit_price - discount +
-- taxes + fees), which is a new computation for a new entity -- it does
-- NOT reimplement the Sale/Proposal authoritative total (amount -
-- discount, computeTotal() in sales.ts/proposals.ts) or the Sale margin
-- formula (getSaleMargin() in financial.ts, sourced from
-- payables/operational_costs/commissions by sale_id). Application code
-- (services/api/src/sale-items.ts) integrates a created SaleItem into
-- the Sale's authoritative total/margin by calling the EXISTING
-- updateSale()/createPayable() functions -- never by recomputing those
-- formulas itself. See sale-items.ts module comment for the full
-- rationale.
-- ============================================================

-- ============================================================
-- SALE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  -- Nullable FK to a future TravelProduct catalog (Agent 07, concurrent
  -- branch, not merged here). Kept as a bare TEXT column with no FK
  -- constraint so this migration never depends on feature/mega-catalog
  -- landing first or in any particular order.
  product_id TEXT,
  description TEXT NOT NULL,
  supplier_id TEXT,
  -- Free-form list of traveler references for this line item (customer
  -- dependent ids or free-text names). JSONB, mirroring the
  -- traveler-list convention already used elsewhere in this codebase
  -- (e.g. booking passenger lists) rather than a rigid join table, since
  -- a SaleItem traveler is a lightweight attribution, not a first-class
  -- entity with its own lifecycle.
  travelers JSONB NOT NULL DEFAULT '[]'::jsonb,
  qty NUMERIC(10,2) NOT NULL DEFAULT 1
    CONSTRAINT sale_items_qty_positive_check CHECK (qty > 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0
    CONSTRAINT sale_items_unit_cost_nonneg_check CHECK (unit_cost >= 0),
  unit_price NUMERIC(12,2) NOT NULL
    CONSTRAINT sale_items_unit_price_nonneg_check CHECK (unit_price >= 0),
  taxes NUMERIC(12,2) NOT NULL DEFAULT 0
    CONSTRAINT sale_items_taxes_nonneg_check CHECK (taxes >= 0),
  fees NUMERIC(12,2) NOT NULL DEFAULT 0
    CONSTRAINT sale_items_fees_nonneg_check CHECK (fees >= 0),
  discount NUMERIC(12,2) NOT NULL DEFAULT 0
    CONSTRAINT sale_items_discount_nonneg_check CHECK (discount >= 0),
  commission NUMERIC(12,2) NOT NULL DEFAULT 0
    CONSTRAINT sale_items_commission_nonneg_check CHECK (commission >= 0),
  -- Line-level subtotal = qty*unit_price - discount + taxes + fees.
  -- Own field of this new entity (not a duplicate of Sale.total).
  line_total NUMERIC(12,2) NOT NULL,
  -- Line-level margin = line_total - qty*unit_cost - commission.
  -- Informational only; the Sale's authoritative margin continues to
  -- come from getSaleMargin() in financial.ts.
  line_margin NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CONSTRAINT sale_items_status_check CHECK (status IN ('ACTIVE', 'CANCELLED')),
  source TEXT NOT NULL DEFAULT 'MANUAL'
    CONSTRAINT sale_items_source_check CHECK (source IN ('MANUAL', 'UPSELL_SUGGESTION')),
  payable_id TEXT,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sale_items_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies (id),
  CONSTRAINT sale_items_sale_fk FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id),
  CONSTRAINT sale_items_supplier_fk FOREIGN KEY (agency_id, supplier_id) REFERENCES suppliers (agency_id, id),
  CONSTRAINT sale_items_payable_fk FOREIGN KEY (agency_id, payable_id) REFERENCES payables (agency_id, id),
  CONSTRAINT sale_items_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX IF NOT EXISTS sale_items_agency_id_idx ON sale_items (agency_id);
CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON sale_items (agency_id, sale_id);

ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sale_items_select_tenant ON sale_items;
DROP POLICY IF EXISTS sale_items_insert_tenant ON sale_items;
DROP POLICY IF EXISTS sale_items_update_tenant ON sale_items;
DROP POLICY IF EXISTS sale_items_delete_tenant ON sale_items;

CREATE POLICY sale_items_select_tenant ON sale_items
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY sale_items_insert_tenant ON sale_items
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY sale_items_update_tenant ON sale_items
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY sale_items_delete_tenant ON sale_items
  FOR DELETE
  USING (agency_id = current_agency_id());

-- ============================================================
-- PROPOSAL OPTIONAL ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS proposal_optional_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  product_id TEXT,
  description TEXT NOT NULL,
  supplier_id TEXT,
  travelers JSONB NOT NULL DEFAULT '[]'::jsonb,
  qty NUMERIC(10,2) NOT NULL DEFAULT 1
    CONSTRAINT proposal_optional_items_qty_positive_check CHECK (qty > 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0
    CONSTRAINT proposal_optional_items_unit_cost_nonneg_check CHECK (unit_cost >= 0),
  unit_price NUMERIC(12,2) NOT NULL
    CONSTRAINT proposal_optional_items_unit_price_nonneg_check CHECK (unit_price >= 0),
  taxes NUMERIC(12,2) NOT NULL DEFAULT 0
    CONSTRAINT proposal_optional_items_taxes_nonneg_check CHECK (taxes >= 0),
  fees NUMERIC(12,2) NOT NULL DEFAULT 0
    CONSTRAINT proposal_optional_items_fees_nonneg_check CHECK (fees >= 0),
  discount NUMERIC(12,2) NOT NULL DEFAULT 0
    CONSTRAINT proposal_optional_items_discount_nonneg_check CHECK (discount >= 0),
  commission NUMERIC(12,2) NOT NULL DEFAULT 0
    CONSTRAINT proposal_optional_items_commission_nonneg_check CHECK (commission >= 0),
  line_total NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  -- Never defaults to ACCEPTED: the customer/staff must take an explicit
  -- action ("Sugestao nunca vira venda sem acao explicita").
  status TEXT NOT NULL DEFAULT 'PENDING'
    CONSTRAINT proposal_optional_items_status_check CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED')),
  source TEXT NOT NULL DEFAULT 'MANUAL'
    CONSTRAINT proposal_optional_items_source_check CHECK (source IN ('MANUAL', 'UPSELL_SUGGESTION')),
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT proposal_optional_items_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies (id),
  CONSTRAINT proposal_optional_items_proposal_fk FOREIGN KEY (agency_id, proposal_id) REFERENCES proposals (agency_id, id),
  CONSTRAINT proposal_optional_items_supplier_fk FOREIGN KEY (agency_id, supplier_id) REFERENCES suppliers (agency_id, id),
  CONSTRAINT proposal_optional_items_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX IF NOT EXISTS proposal_optional_items_agency_id_idx ON proposal_optional_items (agency_id);
CREATE INDEX IF NOT EXISTS proposal_optional_items_proposal_id_idx ON proposal_optional_items (agency_id, proposal_id);

ALTER TABLE proposal_optional_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_optional_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proposal_optional_items_select_tenant ON proposal_optional_items;
DROP POLICY IF EXISTS proposal_optional_items_insert_tenant ON proposal_optional_items;
DROP POLICY IF EXISTS proposal_optional_items_update_tenant ON proposal_optional_items;
DROP POLICY IF EXISTS proposal_optional_items_delete_tenant ON proposal_optional_items;

CREATE POLICY proposal_optional_items_select_tenant ON proposal_optional_items
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY proposal_optional_items_insert_tenant ON proposal_optional_items
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY proposal_optional_items_update_tenant ON proposal_optional_items
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY proposal_optional_items_delete_tenant ON proposal_optional_items
  FOR DELETE
  USING (agency_id = current_agency_id());

-- ============================================================
-- UPSELL RULES ("Turbine sua Viagem" rule engine -- deliberately simple:
-- one condition type + one condition value + a suggested item template,
-- not a general-purpose rule DSL)
-- ============================================================
CREATE TABLE IF NOT EXISTS upsell_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  condition_type TEXT NOT NULL
    CONSTRAINT upsell_rules_condition_type_check CHECK (condition_type IN (
      'DESTINATION_MATCHES',
      'INTERNATIONAL_TRIP',
      'HAS_MINOR_TRAVELER',
      'NO_INSURANCE_ITEM',
      'ACTIVE_CAMPAIGN'
    )),
  -- e.g. a destination substring/pattern for DESTINATION_MATCHES, a
  -- campaign id for ACTIVE_CAMPAIGN, unused (NULL) for boolean-shaped
  -- conditions like INTERNATIONAL_TRIP / HAS_MINOR_TRAVELER / NO_INSURANCE_ITEM.
  condition_value TEXT,
  suggested_description TEXT NOT NULL,
  suggested_product_id TEXT,
  suggested_unit_price NUMERIC(12,2) NOT NULL
    CONSTRAINT upsell_rules_suggested_unit_price_nonneg_check CHECK (suggested_unit_price >= 0),
  suggested_unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0
    CONSTRAINT upsell_rules_suggested_unit_cost_nonneg_check CHECK (suggested_unit_cost >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT upsell_rules_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies (id),
  CONSTRAINT upsell_rules_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX IF NOT EXISTS upsell_rules_agency_id_idx ON upsell_rules (agency_id);
CREATE INDEX IF NOT EXISTS upsell_rules_active_idx ON upsell_rules (agency_id, active);

ALTER TABLE upsell_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE upsell_rules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS upsell_rules_select_tenant ON upsell_rules;
DROP POLICY IF EXISTS upsell_rules_insert_tenant ON upsell_rules;
DROP POLICY IF EXISTS upsell_rules_update_tenant ON upsell_rules;
DROP POLICY IF EXISTS upsell_rules_delete_tenant ON upsell_rules;

CREATE POLICY upsell_rules_select_tenant ON upsell_rules
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY upsell_rules_insert_tenant ON upsell_rules
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY upsell_rules_update_tenant ON upsell_rules
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY upsell_rules_delete_tenant ON upsell_rules
  FOR DELETE
  USING (agency_id = current_agency_id());

-- ============================================================
-- UPSELL SUGGESTIONS -- generated, never auto-applied. Explicit accept
-- creates a real SaleItem or ProposalOptionalItem; explicit dismiss
-- closes it. No code path may flip status to ACCEPTED without that
-- explicit action (enforced in application code, see upsell.ts).
-- ============================================================
CREATE TABLE IF NOT EXISTS upsell_suggestions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  rule_id TEXT,
  sale_id TEXT,
  proposal_id TEXT,
  description TEXT NOT NULL,
  suggested_unit_price NUMERIC(12,2) NOT NULL
    CONSTRAINT upsell_suggestions_unit_price_nonneg_check CHECK (suggested_unit_price >= 0),
  suggested_unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0
    CONSTRAINT upsell_suggestions_unit_cost_nonneg_check CHECK (suggested_unit_cost >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CONSTRAINT upsell_suggestions_status_check CHECK (status IN ('PENDING', 'ACCEPTED', 'DISMISSED')),
  resulting_sale_item_id TEXT,
  resulting_proposal_optional_item_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT upsell_suggestions_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies (id),
  CONSTRAINT upsell_suggestions_rule_fk FOREIGN KEY (agency_id, rule_id) REFERENCES upsell_rules (agency_id, id),
  CONSTRAINT upsell_suggestions_sale_fk FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id),
  CONSTRAINT upsell_suggestions_proposal_fk FOREIGN KEY (agency_id, proposal_id) REFERENCES proposals (agency_id, id),
  CONSTRAINT upsell_suggestions_sale_item_fk FOREIGN KEY (agency_id, resulting_sale_item_id) REFERENCES sale_items (agency_id, id),
  CONSTRAINT upsell_suggestions_poi_fk FOREIGN KEY (agency_id, resulting_proposal_optional_item_id) REFERENCES proposal_optional_items (agency_id, id),
  CONSTRAINT upsell_suggestions_target_check CHECK (sale_id IS NOT NULL OR proposal_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS upsell_suggestions_agency_id_idx ON upsell_suggestions (agency_id);
CREATE INDEX IF NOT EXISTS upsell_suggestions_sale_id_idx ON upsell_suggestions (agency_id, sale_id);
CREATE INDEX IF NOT EXISTS upsell_suggestions_proposal_id_idx ON upsell_suggestions (agency_id, proposal_id);

ALTER TABLE upsell_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE upsell_suggestions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS upsell_suggestions_select_tenant ON upsell_suggestions;
DROP POLICY IF EXISTS upsell_suggestions_insert_tenant ON upsell_suggestions;
DROP POLICY IF EXISTS upsell_suggestions_update_tenant ON upsell_suggestions;
DROP POLICY IF EXISTS upsell_suggestions_delete_tenant ON upsell_suggestions;

CREATE POLICY upsell_suggestions_select_tenant ON upsell_suggestions
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY upsell_suggestions_insert_tenant ON upsell_suggestions
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY upsell_suggestions_update_tenant ON upsell_suggestions
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY upsell_suggestions_delete_tenant ON upsell_suggestions
  FOR DELETE
  USING (agency_id = current_agency_id());
