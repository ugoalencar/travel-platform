-- Migration: Comissionamento por Funcionário e Produto
-- Purpose: Evolve the EXISTING commission domain (042/043/044 --
--          commission_plans, employees, commission_entries, and its
--          dedupe guard) to support per-employee, per-product-type
--          commission rules, WITHOUT creating a parallel/duplicate
--          commission system.
--
-- What this migration deliberately does NOT do:
--   - does not touch commercial_partners/partner_commissions (054) --
--     that is the EXTERNAL affiliate program, a different domain.
--   - does not touch the legacy `commissions` table (001/007) -- dead,
--     zero application writers, out of scope.
--   - does not replace commission_plans -- global/broad plans
--     (PERCENT_SALE/PERCENT_MARGIN/FIXED/DESTINATION/TIERED_TARGET)
--     keep working exactly as before. This migration only fills the
--     gap commission_plans already stubbed out and never implemented:
--     the 'PRODUCT' calculation_type (allowed by its CHECK constraint,
--     never implemented in commissions.ts).
--   - does not rewrite commission_entries -- extends it (nullable new
--     columns), so every existing DRE/financial calculation that reads
--     commission_entries.amount keeps working unchanged.
--
-- Audited state (see docs/product/COMISSIONAMENTO_FUNCIONARIOS.md
-- "Estado atual" for the full write-up): commission_plans +
-- employees.default_commission_plan_id give each employee exactly ONE
-- global plan, with no per-product-type granularity. The dedupe guard
-- (044) permits at most one active commission_entries row per
-- (agency, sale, employee) -- which physically blocks the real target
-- scenario (5% on an EXCURSION line + 3% on an AIR line of the SAME
-- sale). Both gaps are fixed here.
-- Direction: up

-- ============================================================
-- 1. PRODUCT TYPES -- audited: no single existing enum spans these.
-- AIR/EXCURSION/LAND/INSURANCE map to real first-class domain tables
-- with real pricing (air_services.sale_value, land_services.sale_value,
-- excursion_customers/excursions.sale_value, insurance_policies.sale_amount).
-- PACKAGE maps to the Sale itself (sales.total) -- "o pacote inteiro",
-- not a fictional table. HOTEL/TRANSFER exist only as
-- TravelProductCategory catalog values with no structured per-sale
-- pricing table (they show up as free-text sale_items rows with no
-- type tag) -- included here as valid rule product types (a rule CAN
-- be configured for them) but the automatic calculation engine
-- (employee-commissions.ts) does not compute their base automatically
-- yet; generation for these two requires an explicit manager-entered
-- base amount, still computed server-side from the rule (never a
-- browser-supplied commission amount). Documented explicitly, not
-- silently faked -- see docs/product/COMISSIONAMENTO_FUNCIONARIOS.md.
-- ============================================================

CREATE TYPE employee_commission_product_type AS ENUM (
  'AIR', 'EXCURSION', 'LAND', 'INSURANCE', 'PACKAGE', 'HOTEL', 'TRANSFER'
);

CREATE TYPE employee_commission_calculation_type AS ENUM ('PERCENTAGE', 'FIXED');

-- Bases requested by the product owner, mapped onto real existing
-- amounts: PRODUCT_TOTAL (a single AIR/LAND/INSURANCE line's real
-- sale value), PACKAGE_TOTAL (sales.total), PER_PASSENGER/PER_TICKET
-- (percentage applied per real passenger/ticket amount, summed),
-- FIXED_PER_PASSENGER/FIXED_PER_TICKET/FIXED_PER_SALE (flat amount
-- multiplied by a real passenger/ticket count, or once per sale).
CREATE TYPE employee_commission_basis AS ENUM (
  'PRODUCT_TOTAL',
  'PACKAGE_TOTAL',
  'PER_PASSENGER',
  'PER_TICKET',
  'FIXED_PER_PASSENGER',
  'FIXED_PER_TICKET',
  'FIXED_PER_SALE'
);

-- ============================================================
-- 2. EMPLOYEE COMMISSION RULES (the new, genuinely-missing concept --
-- audited: no equivalent exists. commission_plans stays untouched and
-- keeps serving broad/global plans; this table is specifically
-- employee+product scoped, a different shape/purpose.)
-- ============================================================

CREATE TABLE employee_commission_rules (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  product_type employee_commission_product_type NOT NULL,
  calculation_type employee_commission_calculation_type NOT NULL,
  calculation_basis employee_commission_basis NOT NULL,
  percentage_rate NUMERIC(7, 4),
  fixed_amount NUMERIC(14, 2),
  currency TEXT NOT NULL DEFAULT 'BRL',
  valid_from DATE,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT employee_commission_rules_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT employee_commission_rules_employee_tenant_fk
    FOREIGN KEY (agency_id, employee_id) REFERENCES employees (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT employee_commission_rules_created_by_tenant_fk
    FOREIGN KEY (agency_id, created_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT employee_commission_rules_status_check
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT employee_commission_rules_calc_value_check CHECK (
    (calculation_type = 'PERCENTAGE' AND percentage_rate IS NOT NULL AND percentage_rate >= 0 AND fixed_amount IS NULL)
    OR
    (calculation_type = 'FIXED' AND fixed_amount IS NOT NULL AND fixed_amount >= 0 AND percentage_rate IS NULL)
  ),
  CONSTRAINT employee_commission_rules_validity_check
    CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from <= valid_until),
  CONSTRAINT employee_commission_rules_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX employee_commission_rules_agency_employee_idx
  ON employee_commission_rules (agency_id, employee_id);
CREATE INDEX employee_commission_rules_agency_employee_product_idx
  ON employee_commission_rules (agency_id, employee_id, product_type, status);

-- Precedence guard (spec: "Não permitir duas regras ativas conflitantes
-- ... Nunca escolher regra aleatoriamente"): at most one OPEN-ENDED
-- (valid_until IS NULL) active rule per employee+product at a time.
-- A dated/closed rule (valid_until set) never conflicts -- the
-- deterministic replacement flow (employee-commission-rules.ts) closes
-- the previous open-ended rule (sets its valid_until) before/when
-- activating a new one, so there is never ambiguity about which rule
-- applies on a given date.
CREATE UNIQUE INDEX employee_commission_rules_open_ended_active_uidx
  ON employee_commission_rules (agency_id, employee_id, product_type)
  WHERE status = 'ACTIVE' AND valid_until IS NULL;

ALTER TABLE employee_commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_commission_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY employee_commission_rules_select_tenant ON employee_commission_rules
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY employee_commission_rules_insert_tenant ON employee_commission_rules
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY employee_commission_rules_update_tenant ON employee_commission_rules
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY employee_commission_rules_delete_tenant ON employee_commission_rules
  FOR DELETE USING (agency_id = current_agency_id());

-- ============================================================
-- 3. EXTEND commission_entries -- snapshot columns (spec: changing a
-- rule later must NEVER recompute historical commissions). Every
-- column added is nullable so existing plan-based rows are untouched
-- and every existing reader (financial.ts DRE/margin calculations)
-- keeps working unchanged -- they only ever read `amount`/`status`.
-- ============================================================

ALTER TABLE commission_entries
  ALTER COLUMN commission_plan_id DROP NOT NULL;

ALTER TABLE commission_entries
  ADD COLUMN commission_rule_id TEXT,
  ADD COLUMN product_type employee_commission_product_type,
  -- Polymorphic pointer to the real row the base_amount was read from
  -- (an air_services/land_services/excursion_customers/
  -- insurance_policies/sales id) -- no FK, since the target table
  -- varies by product_type; source_item_type names which one.
  ADD COLUMN source_item_id TEXT,
  ADD COLUMN source_item_type TEXT,
  ADD COLUMN quantity NUMERIC(10, 2);

ALTER TABLE commission_entries
  ADD CONSTRAINT commission_entries_rule_tenant_fk
    FOREIGN KEY (agency_id, commission_rule_id) REFERENCES employee_commission_rules (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE commission_entries
  ADD CONSTRAINT commission_entries_source_item_type_check
    CHECK (source_item_type IS NULL OR source_item_type IN (
      'AIR_SERVICE', 'LAND_SERVICE', 'EXCURSION', 'INSURANCE_POLICY', 'SALE', 'MANUAL'
    ));

-- Exactly one lineage: either the pre-existing global-plan path
-- (commission_plan_id) or the new per-employee-product-rule path
-- (commission_rule_id + product_type). Never both, never neither.
ALTER TABLE commission_entries
  ADD CONSTRAINT commission_entries_lineage_check
    CHECK (
      (commission_plan_id IS NOT NULL AND commission_rule_id IS NULL AND product_type IS NULL)
      OR
      (commission_plan_id IS NULL AND commission_rule_id IS NOT NULL AND product_type IS NOT NULL)
    );

-- ============================================================
-- 4. WIDEN THE DEDUPE GUARD (044) -- the real structural blocker found
-- during the audit. Old guard: at most one active commission per
-- (sale, employee). New guard: at most one active commission per
-- (sale, employee, product_type) -- product_type NULL (legacy
-- plan-based entries) still collapses to the old one-per-sale
-- behavior via COALESCE, so nothing about the existing global-plan
-- flow changes. A rule-based sale can now hold one EXCURSION entry +
-- one AIR entry for the same employee on the same sale, but never two
-- EXCURSION entries for the same employee on the same sale.
-- ============================================================

DROP INDEX commission_entries_agency_sale_employee_active_uidx;

-- Split in two (rather than one expression index with COALESCE, which
-- Postgres rejects here -- the enum-to-text cast used in a partial
-- index predicate/expression is not considered IMMUTABLE): one guard
-- for the legacy plan-based path (product_type IS NULL, preserves the
-- exact old one-per-sale-per-employee behavior), one for the new
-- rule-based path (product_type IS NOT NULL, one per sale+employee
-- PER product type).
CREATE UNIQUE INDEX commission_entries_agency_sale_employee_legacy_active_uidx
  ON commission_entries (agency_id, sale_id, employee_id)
  WHERE status <> 'CANCELLED' AND product_type IS NULL;

CREATE UNIQUE INDEX commission_entries_agency_sale_employee_product_active_uidx
  ON commission_entries (agency_id, sale_id, employee_id, product_type)
  WHERE status <> 'CANCELLED' AND product_type IS NOT NULL;

-- ============================================================
-- 5. EXCURSION per-passenger pricing -- audited gap: excursion_customers
-- has no price column, only the excursion template's aggregate
-- sale_value. Nullable addition, preserves all existing data. When set,
-- PER_PASSENGER commission sums real per-passenger values; when NULL
-- (the default for every existing/new row that doesn't set it), the
-- calculation engine falls back to excursions.sale_value divided
-- evenly across enrolled passengers -- documented explicitly in
-- docs/product/COMISSIONAMENTO_FUNCIONARIOS.md, not silently assumed.
-- ============================================================

ALTER TABLE excursion_customers
  ADD COLUMN sale_value NUMERIC(12, 2)
    CONSTRAINT excursion_customers_sale_value_nonneg_check CHECK (sale_value IS NULL OR sale_value >= 0);

-- ============================================================
-- GRANTS -- same runtime role pattern as every prior migration.
-- ============================================================

DO $$
DECLARE
  runtime_role TEXT;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['travel_app_runtime_local', 'travel_app_runtime']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON employee_commission_rules TO %I',
        runtime_role
      );
    END IF;
  END LOOP;
END $$;

-- DROP TABLE employee_commission_rules;
-- ALTER TABLE excursion_customers DROP COLUMN sale_value;
-- ALTER TABLE commission_entries DROP COLUMN commission_rule_id, DROP COLUMN product_type, DROP COLUMN source_item_id, DROP COLUMN source_item_type, DROP COLUMN quantity;
-- DROP TYPE employee_commission_basis;
-- DROP TYPE employee_commission_calculation_type;
-- DROP TYPE employee_commission_product_type;
