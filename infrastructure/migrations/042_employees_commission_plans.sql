-- ============================================================
-- EMPLOYEE + COMMISSION PLAN (configuration/master-data layer)
-- Business Operations Completion — Wave B, item 1
-- ============================================================
-- Additive only:
--  - New tenant-scoped `commission_plans` table (config only, no calc engine).
--  - New tenant-scoped `employees` table. Employee is a distinct business/
--    personnel record from `users` (the login/RBAC identity) — `user_id` is
--    a nullable FK for staff who also have login access, not a replacement
--    of the auth system.
-- No existing table, column, or constraint is changed.
-- ============================================================

-- ------------------------------------------------------------
-- Commission plans
-- ------------------------------------------------------------

CREATE TABLE commission_plans (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id        TEXT NOT NULL,
  name             TEXT NOT NULL,
  calculation_type TEXT NOT NULL,
  percentage       NUMERIC(7, 4),
  fixed_amount     NUMERIC(14, 2),
  rules            JSONB,
  active           BOOLEAN NOT NULL DEFAULT true,
  valid_from       DATE,
  valid_until      DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT commission_plans_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT commission_plans_name_not_blank_check
    CHECK (length(trim(name)) > 0),
  CONSTRAINT commission_plans_calculation_type_check
    CHECK (calculation_type IN ('PERCENT_SALE', 'PERCENT_MARGIN', 'FIXED', 'PRODUCT', 'DESTINATION', 'TIERED_TARGET')),
  CONSTRAINT commission_plans_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT commission_plans_agency_name_key UNIQUE (agency_id, name)
);

CREATE INDEX commission_plans_agency_active_idx
  ON commission_plans (agency_id, active);

ALTER TABLE commission_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_plans FORCE ROW LEVEL SECURITY;

CREATE POLICY commission_plans_select_tenant ON commission_plans
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY commission_plans_insert_tenant ON commission_plans
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY commission_plans_update_tenant ON commission_plans
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY commission_plans_delete_tenant ON commission_plans
  FOR DELETE USING (agency_id = current_agency_id());

-- ------------------------------------------------------------
-- Employees
-- ------------------------------------------------------------

CREATE TABLE employees (
  id                         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id                  TEXT NOT NULL,
  name                       TEXT NOT NULL,
  cpf                        TEXT,
  rg                         TEXT,
  birth_date                 DATE,
  address_line               TEXT,
  address_city               TEXT,
  address_state              TEXT,
  address_zip_code           TEXT,
  phone                      TEXT,
  email                      TEXT,
  hire_date                  DATE,
  termination_date           DATE,
  employment_type            TEXT NOT NULL DEFAULT 'EMPLOYEE',
  role_title                 TEXT,
  department                 TEXT,
  cost_center_id             TEXT,
  manager_id                 TEXT,
  status                     TEXT NOT NULL DEFAULT 'ACTIVE',
  base_salary                NUMERIC(14, 2),
  bank_name                  TEXT,
  bank_branch                TEXT,
  bank_account               TEXT,
  bank_pix_key               TEXT,
  notes                      TEXT,
  user_id                    TEXT,
  default_commission_plan_id TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT employees_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT employees_name_not_blank_check
    CHECK (length(trim(name)) > 0),
  CONSTRAINT employees_employment_type_check
    CHECK (employment_type IN ('EMPLOYEE', 'CONTRACTOR', 'PARTNER', 'FREELANCER', 'OTHER')),
  CONSTRAINT employees_status_check
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED')),
  CONSTRAINT employees_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT employees_cost_center_tenant_fk
    FOREIGN KEY (agency_id, cost_center_id) REFERENCES cost_centers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT employees_manager_tenant_fk
    FOREIGN KEY (agency_id, manager_id) REFERENCES employees (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT employees_manager_not_self_check
    CHECK (manager_id IS NULL OR manager_id <> id),
  CONSTRAINT employees_user_tenant_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT employees_commission_plan_tenant_fk
    FOREIGN KEY (agency_id, default_commission_plan_id) REFERENCES commission_plans (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX employees_agency_status_idx ON employees (agency_id, status);
CREATE INDEX employees_agency_cost_center_idx ON employees (agency_id, cost_center_id);
CREATE INDEX employees_agency_manager_idx ON employees (agency_id, manager_id);
CREATE INDEX employees_agency_user_idx ON employees (agency_id, user_id);
CREATE UNIQUE INDEX employees_agency_user_unique_idx ON employees (agency_id, user_id) WHERE user_id IS NOT NULL;

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees FORCE ROW LEVEL SECURITY;

CREATE POLICY employees_select_tenant ON employees
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY employees_insert_tenant ON employees
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY employees_update_tenant ON employees
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY employees_delete_tenant ON employees
  FOR DELETE USING (agency_id = current_agency_id());
