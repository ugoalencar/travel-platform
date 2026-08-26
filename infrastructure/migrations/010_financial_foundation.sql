-- ============================================================
-- FINANCIAL FOUNDATION
-- Travel Platform
-- ============================================================
-- Additive financial model with explicit business tables:
-- receivables, payables, payments, payment_allocations, and
-- operational_costs. No generic financial_entries table.
--
-- This migration does not backfill existing Sales into Receivables.
-- Backfill is intentionally deferred because existing sales may need
-- manual reconciliation of due dates and descriptions.
-- ============================================================

CREATE TYPE "FinancialObligationStatus" AS ENUM (
  'OPEN',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED'
);

CREATE TYPE "PaymentDirection" AS ENUM (
  'IN',
  'OUT'
);

CREATE TABLE receivables (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id    TEXT NOT NULL,
  sale_id      TEXT,
  customer_id  TEXT NOT NULL,
  description  TEXT NOT NULL,
  amount       NUMERIC(12, 2) NOT NULL,
  due_at       TIMESTAMPTZ NOT NULL,
  status       "FinancialObligationStatus" NOT NULL DEFAULT 'OPEN',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT receivables_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT receivables_sale_tenant_fk
    FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT receivables_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT receivables_amount_positive_check
    CHECK (amount > 0),

  CONSTRAINT receivables_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT receivables_agency_sale_key UNIQUE (agency_id, sale_id)
);

CREATE INDEX receivables_agency_status_due_idx ON receivables (agency_id, status, due_at);
CREATE INDEX receivables_agency_customer_idx ON receivables (agency_id, customer_id);

CREATE TABLE operational_costs (
  id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id              TEXT NOT NULL,
  sale_id                TEXT,
  transport_operation_id TEXT,
  supplier_id            TEXT,
  description            TEXT NOT NULL,
  cost_type              TEXT NOT NULL,
  expected_amount        NUMERIC(12, 2),
  actual_amount          NUMERIC(12, 2),
  incurred_at            TIMESTAMPTZ NOT NULL,
  created_by             TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT operational_costs_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operational_costs_sale_tenant_fk
    FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operational_costs_operation_tenant_fk
    FOREIGN KEY (agency_id, transport_operation_id) REFERENCES transport_operations (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operational_costs_supplier_tenant_fk
    FOREIGN KEY (agency_id, supplier_id) REFERENCES suppliers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operational_costs_created_by_tenant_fk
    FOREIGN KEY (agency_id, created_by) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operational_costs_expected_non_negative_check
    CHECK (expected_amount IS NULL OR expected_amount >= 0),
  CONSTRAINT operational_costs_actual_non_negative_check
    CHECK (actual_amount IS NULL OR actual_amount >= 0),
  CONSTRAINT operational_costs_has_amount_check
    CHECK (expected_amount IS NOT NULL OR actual_amount IS NOT NULL),

  CONSTRAINT operational_costs_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX operational_costs_agency_operation_idx
  ON operational_costs (agency_id, transport_operation_id);
CREATE INDEX operational_costs_agency_sale_idx ON operational_costs (agency_id, sale_id);
CREATE INDEX operational_costs_agency_incurred_idx ON operational_costs (agency_id, incurred_at);

CREATE TABLE payables (
  id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id              TEXT NOT NULL,
  sale_id                TEXT,
  supplier_id            TEXT,
  commission_id          TEXT,
  transport_operation_id TEXT,
  operational_cost_id    TEXT,
  description            TEXT NOT NULL,
  amount                 NUMERIC(12, 2) NOT NULL,
  due_at                 TIMESTAMPTZ NOT NULL,
  status                 "FinancialObligationStatus" NOT NULL DEFAULT 'OPEN',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payables_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT payables_sale_tenant_fk
    FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT payables_supplier_tenant_fk
    FOREIGN KEY (agency_id, supplier_id) REFERENCES suppliers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT payables_commission_tenant_fk
    FOREIGN KEY (agency_id, commission_id) REFERENCES commissions (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT payables_operation_tenant_fk
    FOREIGN KEY (agency_id, transport_operation_id) REFERENCES transport_operations (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT payables_operational_cost_tenant_fk
    FOREIGN KEY (agency_id, operational_cost_id) REFERENCES operational_costs (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT payables_amount_positive_check
    CHECK (amount > 0),

  CONSTRAINT payables_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX payables_agency_status_due_idx ON payables (agency_id, status, due_at);
CREATE INDEX payables_agency_supplier_idx ON payables (agency_id, supplier_id);
CREATE INDEX payables_agency_sale_idx ON payables (agency_id, sale_id);
CREATE INDEX payables_agency_operation_idx ON payables (agency_id, transport_operation_id);

CREATE TABLE payments (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id    TEXT NOT NULL,
  direction    "PaymentDirection" NOT NULL,
  amount       NUMERIC(12, 2) NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL,
  method       TEXT,
  reference    TEXT,
  notes        TEXT,
  created_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payments_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT payments_created_by_tenant_fk
    FOREIGN KEY (agency_id, created_by) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT payments_amount_positive_check
    CHECK (amount > 0),

  CONSTRAINT payments_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX payments_agency_direction_occurred_idx
  ON payments (agency_id, direction, occurred_at);

CREATE TABLE payment_allocations (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id      TEXT NOT NULL,
  payment_id     TEXT NOT NULL,
  receivable_id  TEXT,
  payable_id     TEXT,
  amount         NUMERIC(12, 2) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payment_allocations_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT payment_allocations_payment_tenant_fk
    FOREIGN KEY (agency_id, payment_id) REFERENCES payments (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT payment_allocations_receivable_tenant_fk
    FOREIGN KEY (agency_id, receivable_id) REFERENCES receivables (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT payment_allocations_payable_tenant_fk
    FOREIGN KEY (agency_id, payable_id) REFERENCES payables (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT payment_allocations_amount_positive_check
    CHECK (amount > 0),
  CONSTRAINT payment_allocations_exactly_one_target_check
    CHECK (
      (receivable_id IS NOT NULL AND payable_id IS NULL)
      OR (receivable_id IS NULL AND payable_id IS NOT NULL)
    ),

  CONSTRAINT payment_allocations_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX payment_allocations_agency_payment_idx
  ON payment_allocations (agency_id, payment_id);
CREATE INDEX payment_allocations_agency_receivable_idx
  ON payment_allocations (agency_id, receivable_id);
CREATE INDEX payment_allocations_agency_payable_idx
  ON payment_allocations (agency_id, payable_id);

ALTER TABLE receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_costs ENABLE ROW LEVEL SECURITY;

ALTER TABLE receivables FORCE ROW LEVEL SECURITY;
ALTER TABLE payables FORCE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE operational_costs FORCE ROW LEVEL SECURITY;

CREATE POLICY receivables_select_tenant ON receivables
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY receivables_insert_tenant ON receivables
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY receivables_update_tenant ON receivables
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY receivables_delete_tenant ON receivables
  FOR DELETE USING (agency_id = current_agency_id());

CREATE POLICY payables_select_tenant ON payables
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY payables_insert_tenant ON payables
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY payables_update_tenant ON payables
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY payables_delete_tenant ON payables
  FOR DELETE USING (agency_id = current_agency_id());

CREATE POLICY payments_select_tenant ON payments
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY payments_insert_tenant ON payments
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY payments_update_tenant ON payments
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY payments_delete_tenant ON payments
  FOR DELETE USING (agency_id = current_agency_id());

CREATE POLICY payment_allocations_select_tenant ON payment_allocations
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY payment_allocations_insert_tenant ON payment_allocations
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY payment_allocations_update_tenant ON payment_allocations
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY payment_allocations_delete_tenant ON payment_allocations
  FOR DELETE USING (agency_id = current_agency_id());

CREATE POLICY operational_costs_select_tenant ON operational_costs
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY operational_costs_insert_tenant ON operational_costs
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY operational_costs_update_tenant ON operational_costs
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY operational_costs_delete_tenant ON operational_costs
  FOR DELETE USING (agency_id = current_agency_id());

