-- ============================================================
-- EXTENDED FINANCIAL MODULE
-- Travel Platform
-- ============================================================
-- Additive: Introduces comprehensive financial module with
-- revenues, expenses, categories, cash transactions, and
-- reconciliation support.
--
-- Existing tables (receivables, payables, payments, etc.) remain
-- unchanged for backward compatibility.
--
-- Key tables:
-- - financial_categories: Configurable revenue/expense categories per tenant
-- - revenues: Sales revenue records (1:1 with sales via unique constraint)
-- - expenses: Operational/supplier expense records
-- - cash_transactions: Immutable append-only ledger
-- - reconciliations: Expected vs actual reconciliation tracking
--
-- All tables enforce FORCE ROW LEVEL SECURITY with agency_id isolation.
-- ============================================================

CREATE TYPE "FinancialCategoryType" AS ENUM (
  'REVENUE',
  'EXPENSE'
);

CREATE TYPE "RevenueStatus" AS ENUM (
  'OPEN',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED'
);

CREATE TYPE "ExpenseStatus" AS ENUM (
  'OPEN',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED'
);

CREATE TYPE "CashTransactionType" AS ENUM (
  'ENTRY',
  'EXIT',
  'ADJUSTMENT'
);

CREATE TYPE "ReconciliationStatus" AS ENUM (
  'RECONCILED',
  'NOT_RECONCILED'
);

-- ============================================================
-- FINANCIAL CATEGORIES (Configurable per tenant)
-- ============================================================

CREATE TABLE financial_categories (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id    TEXT NOT NULL,
  name         TEXT NOT NULL,
  type         "FinancialCategoryType" NOT NULL,
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT financial_categories_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT financial_categories_name_not_blank_check
    CHECK (length(trim(name)) > 0),
  CONSTRAINT financial_categories_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT financial_categories_agency_type_name_key UNIQUE (agency_id, type, name)
);

CREATE INDEX financial_categories_agency_type_idx
  ON financial_categories (agency_id, type, is_active);

ALTER TABLE financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_categories FORCE ROW LEVEL SECURITY;

CREATE POLICY financial_categories_select_tenant ON financial_categories
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY financial_categories_insert_tenant ON financial_categories
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY financial_categories_update_tenant ON financial_categories
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY financial_categories_delete_tenant ON financial_categories
  FOR DELETE USING (agency_id = current_agency_id());

-- ============================================================
-- REVENUES (1:1 with sales, idempotent)
-- ============================================================

CREATE TABLE revenues (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id         TEXT NOT NULL,
  sale_id           TEXT,
  booking_id        TEXT,
  customer_id       TEXT NOT NULL,
  category_id       TEXT NOT NULL,
  description       TEXT NOT NULL,
  amount            NUMERIC(12, 2) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'BRL',
  competency_date   TIMESTAMPTZ NOT NULL,
  due_date          TIMESTAMPTZ NOT NULL,
  receipt_date      TIMESTAMPTZ,
  payment_method    TEXT,
  status            "RevenueStatus" NOT NULL DEFAULT 'OPEN',
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT revenues_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT revenues_sale_tenant_fk
    FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT revenues_booking_tenant_fk
    FOREIGN KEY (agency_id, booking_id) REFERENCES bookings (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT revenues_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT revenues_category_tenant_fk
    FOREIGN KEY (agency_id, category_id) REFERENCES financial_categories (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT revenues_amount_positive_check
    CHECK (amount > 0),
  CONSTRAINT revenues_currency_not_blank_check
    CHECK (length(trim(currency)) > 0),
  CONSTRAINT revenues_description_not_blank_check
    CHECK (length(trim(description)) > 0),
  CONSTRAINT revenues_receipt_requires_paid_check
    CHECK (
      (receipt_date IS NULL AND status <> 'PAID')
      OR (receipt_date IS NOT NULL AND status = 'PAID')
    ),

  CONSTRAINT revenues_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT revenues_agency_sale_key UNIQUE (agency_id, sale_id)
);

CREATE INDEX revenues_agency_status_due_idx
  ON revenues (agency_id, status, due_date);
CREATE INDEX revenues_agency_customer_idx
  ON revenues (agency_id, customer_id);
CREATE INDEX revenues_agency_category_idx
  ON revenues (agency_id, category_id);
CREATE INDEX revenues_agency_sale_idx
  ON revenues (agency_id, sale_id);

ALTER TABLE revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenues FORCE ROW LEVEL SECURITY;

CREATE POLICY revenues_select_tenant ON revenues
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY revenues_insert_tenant ON revenues
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY revenues_update_tenant ON revenues
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY revenues_delete_tenant ON revenues
  FOR DELETE USING (agency_id = current_agency_id());

-- ============================================================
-- EXPENSES
-- ============================================================

CREATE TABLE expenses (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id         TEXT NOT NULL,
  supplier_id       TEXT,
  category_id       TEXT NOT NULL,
  description       TEXT NOT NULL,
  amount            NUMERIC(12, 2) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'BRL',
  incurred_at       TIMESTAMPTZ NOT NULL,
  due_date          TIMESTAMPTZ NOT NULL,
  payment_date      TIMESTAMPTZ,
  payment_method    TEXT,
  status            "ExpenseStatus" NOT NULL DEFAULT 'OPEN',
  recurrence        TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT expenses_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT expenses_supplier_tenant_fk
    FOREIGN KEY (agency_id, supplier_id) REFERENCES suppliers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT expenses_category_tenant_fk
    FOREIGN KEY (agency_id, category_id) REFERENCES financial_categories (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT expenses_amount_positive_check
    CHECK (amount > 0),
  CONSTRAINT expenses_currency_not_blank_check
    CHECK (length(trim(currency)) > 0),
  CONSTRAINT expenses_description_not_blank_check
    CHECK (length(trim(description)) > 0),
  CONSTRAINT expenses_payment_requires_paid_check
    CHECK (
      (payment_date IS NULL AND status <> 'PAID')
      OR (payment_date IS NOT NULL AND status = 'PAID')
    ),

  CONSTRAINT expenses_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX expenses_agency_status_due_idx
  ON expenses (agency_id, status, due_date);
CREATE INDEX expenses_agency_supplier_idx
  ON expenses (agency_id, supplier_id);
CREATE INDEX expenses_agency_category_idx
  ON expenses (agency_id, category_id);
CREATE INDEX expenses_agency_incurred_idx
  ON expenses (agency_id, incurred_at);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;

CREATE POLICY expenses_select_tenant ON expenses
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY expenses_insert_tenant ON expenses
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY expenses_update_tenant ON expenses
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY expenses_delete_tenant ON expenses
  FOR DELETE USING (agency_id = current_agency_id());

-- ============================================================
-- CASH TRANSACTIONS (Immutable ledger)
-- ============================================================

CREATE TABLE cash_transactions (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id                TEXT NOT NULL,
  type                     "CashTransactionType" NOT NULL,
  amount                   NUMERIC(12, 2) NOT NULL,
  occurring_at             TIMESTAMPTZ NOT NULL,
  origin                   TEXT NOT NULL,
  related_record_id        TEXT,
  related_record_type      TEXT,
  calculated_balance       NUMERIC(12, 2) NOT NULL,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT cash_transactions_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT cash_transactions_amount_positive_check
    CHECK (amount > 0),
  CONSTRAINT cash_transactions_origin_not_blank_check
    CHECK (length(trim(origin)) > 0),

  CONSTRAINT cash_transactions_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX cash_transactions_agency_type_idx
  ON cash_transactions (agency_id, type, occurring_at);
CREATE INDEX cash_transactions_agency_occurring_idx
  ON cash_transactions (agency_id, occurring_at);

ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transactions FORCE ROW LEVEL SECURITY;

CREATE POLICY cash_transactions_select_tenant ON cash_transactions
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY cash_transactions_insert_tenant ON cash_transactions
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
-- No UPDATE or DELETE policies — immutable ledger

-- ============================================================
-- RECONCILIATIONS
-- ============================================================

CREATE TABLE reconciliations (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id           TEXT NOT NULL,
  reconciliation_date TIMESTAMPTZ NOT NULL,
  expected_amount     NUMERIC(12, 2) NOT NULL,
  actual_amount       NUMERIC(12, 2) NOT NULL,
  status              "ReconciliationStatus" NOT NULL DEFAULT 'NOT_RECONCILED',
  payment_id          TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT reconciliations_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT reconciliations_payment_tenant_fk
    FOREIGN KEY (agency_id, payment_id) REFERENCES payments (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT reconciliations_amounts_non_negative_check
    CHECK (expected_amount >= 0 AND actual_amount >= 0),

  CONSTRAINT reconciliations_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX reconciliations_agency_status_idx
  ON reconciliations (agency_id, status, reconciliation_date);
CREATE INDEX reconciliations_agency_date_idx
  ON reconciliations (agency_id, reconciliation_date);

ALTER TABLE reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliations FORCE ROW LEVEL SECURITY;

CREATE POLICY reconciliations_select_tenant ON reconciliations
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY reconciliations_insert_tenant ON reconciliations
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY reconciliations_update_tenant ON reconciliations
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY reconciliations_delete_tenant ON reconciliations
  FOR DELETE USING (agency_id = current_agency_id());
