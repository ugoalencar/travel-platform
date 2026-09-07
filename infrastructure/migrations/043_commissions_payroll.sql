-- ============================================================
-- COMMISSION ENTRIES + EMPLOYEE DEDUCTIONS + PAYROLL ENTRIES
-- Business Operations Completion — Wave B, item 2
-- ============================================================
-- Additive only. Converges with existing `payables` (Wave A) by adding
-- employee-beneficiary support to that table. No existing table, column,
-- or constraint is dropped or altered destructively.
--
-- Note: a legacy `commissions` table already exists (001_initial_schema.sql,
-- broker-based, sale-linked). This wave introduces a distinct
-- `commission_entries` table for the new employee/commission-plan-driven
-- workflow, to avoid colliding with that existing table and its FK from
-- `payables.commission_id`.
-- ============================================================

-- ------------------------------------------------------------
-- payables: add employee-beneficiary support
-- ------------------------------------------------------------

ALTER TABLE payables ADD COLUMN beneficiary_type TEXT NOT NULL DEFAULT 'SUPPLIER';
ALTER TABLE payables ADD COLUMN employee_id TEXT;
ALTER TABLE payables ADD COLUMN commission_entry_id TEXT;
ALTER TABLE payables ADD COLUMN payroll_entry_id TEXT;

ALTER TABLE payables ADD CONSTRAINT payables_beneficiary_type_check
  CHECK (beneficiary_type IN ('SUPPLIER', 'EMPLOYEE', 'OTHER'));

ALTER TABLE payables ADD CONSTRAINT payables_employee_tenant_fk
  FOREIGN KEY (agency_id, employee_id) REFERENCES employees (agency_id, id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX payables_agency_employee_idx ON payables (agency_id, employee_id);
CREATE INDEX payables_agency_beneficiary_idx ON payables (agency_id, beneficiary_type);

-- ------------------------------------------------------------
-- Commission entries (generated commissions, distinct from legacy
-- broker-based `commissions` table)
-- ------------------------------------------------------------

CREATE TABLE commission_entries (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id          TEXT NOT NULL,
  employee_id        TEXT NOT NULL,
  sale_id            TEXT NOT NULL,
  trip_id            TEXT,
  commission_plan_id TEXT NOT NULL,
  calculation_base   NUMERIC(14, 2) NOT NULL,
  rate               NUMERIC(7, 4),
  amount             NUMERIC(14, 2) NOT NULL,
  status             TEXT NOT NULL DEFAULT 'PENDING',
  approved_at        TIMESTAMPTZ,
  approved_by        TEXT,
  paid_at            TIMESTAMPTZ,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT commission_entries_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commission_entries_employee_tenant_fk
    FOREIGN KEY (agency_id, employee_id) REFERENCES employees (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commission_entries_sale_tenant_fk
    FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commission_entries_plan_tenant_fk
    FOREIGN KEY (agency_id, commission_plan_id) REFERENCES commission_plans (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commission_entries_approved_by_tenant_fk
    FOREIGN KEY (agency_id, approved_by) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commission_entries_status_check
    CHECK (status IN ('PENDING', 'APPROVED', 'PAYABLE', 'PAID', 'CANCELLED')),
  CONSTRAINT commission_entries_amount_non_negative_check
    CHECK (amount >= 0),
  CONSTRAINT commission_entries_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX commission_entries_agency_employee_idx ON commission_entries (agency_id, employee_id);
CREATE INDEX commission_entries_agency_sale_idx ON commission_entries (agency_id, sale_id);
CREATE INDEX commission_entries_agency_status_idx ON commission_entries (agency_id, status);

ALTER TABLE payables ADD CONSTRAINT payables_commission_entry_tenant_fk
  FOREIGN KEY (agency_id, commission_entry_id) REFERENCES commission_entries (agency_id, id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE commission_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY commission_entries_select_tenant ON commission_entries
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY commission_entries_insert_tenant ON commission_entries
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY commission_entries_update_tenant ON commission_entries
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY commission_entries_delete_tenant ON commission_entries
  FOR DELETE USING (agency_id = current_agency_id());

-- ------------------------------------------------------------
-- Employee deductions
-- ------------------------------------------------------------

CREATE TABLE employee_deductions (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id    TEXT NOT NULL,
  employee_id  TEXT NOT NULL,
  competence   DATE NOT NULL,
  type         TEXT NOT NULL,
  description  TEXT,
  amount       NUMERIC(14, 2) NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT employee_deductions_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT employee_deductions_employee_tenant_fk
    FOREIGN KEY (agency_id, employee_id) REFERENCES employees (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT employee_deductions_type_check
    CHECK (type IN ('ADVANCE', 'ABSENCE', 'BENEFIT', 'LOAN', 'ADJUSTMENT', 'OTHER')),
  CONSTRAINT employee_deductions_amount_non_negative_check
    CHECK (amount >= 0),
  CONSTRAINT employee_deductions_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX employee_deductions_agency_employee_idx ON employee_deductions (agency_id, employee_id);
CREATE INDEX employee_deductions_agency_competence_idx ON employee_deductions (agency_id, competence);

ALTER TABLE employee_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_deductions FORCE ROW LEVEL SECURITY;

CREATE POLICY employee_deductions_select_tenant ON employee_deductions
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY employee_deductions_insert_tenant ON employee_deductions
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY employee_deductions_update_tenant ON employee_deductions
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY employee_deductions_delete_tenant ON employee_deductions
  FOR DELETE USING (agency_id = current_agency_id());

-- ------------------------------------------------------------
-- Payroll entries (personnel payments per employee + competence month)
-- ------------------------------------------------------------

CREATE TABLE payroll_entries (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id         TEXT NOT NULL,
  employee_id       TEXT NOT NULL,
  competence        DATE NOT NULL,
  base_salary       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  benefits          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  bonuses           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  commissions_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  reimbursements    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  additions         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discounts_total   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_amount        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'OPEN',
  due_date          DATE,
  paid_at           TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payroll_entries_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT payroll_entries_employee_tenant_fk
    FOREIGN KEY (agency_id, employee_id) REFERENCES employees (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT payroll_entries_status_check
    CHECK (status IN ('OPEN', 'APPROVED', 'PAID', 'CANCELLED')),
  CONSTRAINT payroll_entries_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT payroll_entries_agency_employee_competence_key UNIQUE (agency_id, employee_id, competence)
);

CREATE INDEX payroll_entries_agency_employee_idx ON payroll_entries (agency_id, employee_id);
CREATE INDEX payroll_entries_agency_competence_idx ON payroll_entries (agency_id, competence);
CREATE INDEX payroll_entries_agency_status_idx ON payroll_entries (agency_id, status);

ALTER TABLE payables ADD CONSTRAINT payables_payroll_entry_tenant_fk
  FOREIGN KEY (agency_id, payroll_entry_id) REFERENCES payroll_entries (agency_id, id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY payroll_entries_select_tenant ON payroll_entries
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY payroll_entries_insert_tenant ON payroll_entries
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY payroll_entries_update_tenant ON payroll_entries
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY payroll_entries_delete_tenant ON payroll_entries
  FOR DELETE USING (agency_id = current_agency_id());
