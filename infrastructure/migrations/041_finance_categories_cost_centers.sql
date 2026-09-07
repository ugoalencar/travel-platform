-- ============================================================
-- FINANCE CATEGORY HIERARCHY + COST CENTERS
-- Business Operations Completion — Wave A, item 8
-- ============================================================
-- Additive only:
--  - financial_categories gains a self-referencing parent_category_id so
--    categories can form a two-level hierarchy (e.g. EXPENSE > TRAVEL > AIR).
--    Categories remain free, tenant-managed rows (not enum-backed) — the
--    hierarchy tree itself is seeded as ordinary rows by the demo seed
--    script, following the existing convention for this table.
--  - New tenant-scoped `cost_centers` lookup table, standard RLS.
--  - Nullable `cost_center_id` classification column added to revenues,
--    expenses, payables, receivables, air_services and land_services.
--  - Nullable `category_id` added to payables (the only financial ledger
--    table among revenues/expenses/payables/receivables that previously
--    had no category reference at all).
-- No existing calculation logic, constraint, or column is changed.
-- ============================================================

-- ------------------------------------------------------------
-- Category hierarchy
-- ------------------------------------------------------------

ALTER TABLE financial_categories
  ADD COLUMN parent_category_id TEXT;

ALTER TABLE financial_categories
  ADD CONSTRAINT financial_categories_parent_tenant_fk
    FOREIGN KEY (agency_id, parent_category_id) REFERENCES financial_categories (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE financial_categories
  ADD CONSTRAINT financial_categories_parent_not_self_check
    CHECK (parent_category_id IS NULL OR parent_category_id <> id);

CREATE INDEX financial_categories_agency_parent_idx
  ON financial_categories (agency_id, parent_category_id);

-- ------------------------------------------------------------
-- Cost centers
-- ------------------------------------------------------------

CREATE TABLE cost_centers (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id    TEXT NOT NULL,
  name         TEXT NOT NULL,
  code         TEXT,
  description  TEXT,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT cost_centers_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT cost_centers_name_not_blank_check
    CHECK (length(trim(name)) > 0),
  CONSTRAINT cost_centers_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT cost_centers_agency_name_key UNIQUE (agency_id, name)
);

CREATE INDEX cost_centers_agency_active_idx
  ON cost_centers (agency_id, active);

ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_centers FORCE ROW LEVEL SECURITY;

CREATE POLICY cost_centers_select_tenant ON cost_centers
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY cost_centers_insert_tenant ON cost_centers
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY cost_centers_update_tenant ON cost_centers
  FOR UPDATE USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());
CREATE POLICY cost_centers_delete_tenant ON cost_centers
  FOR DELETE USING (agency_id = current_agency_id());

-- ------------------------------------------------------------
-- Wire cost_center_id (classification metadata) onto financial entries
-- ------------------------------------------------------------

ALTER TABLE revenues ADD COLUMN cost_center_id TEXT;
ALTER TABLE revenues
  ADD CONSTRAINT revenues_cost_center_tenant_fk
    FOREIGN KEY (agency_id, cost_center_id) REFERENCES cost_centers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX revenues_agency_cost_center_idx ON revenues (agency_id, cost_center_id);

ALTER TABLE expenses ADD COLUMN cost_center_id TEXT;
ALTER TABLE expenses
  ADD CONSTRAINT expenses_cost_center_tenant_fk
    FOREIGN KEY (agency_id, cost_center_id) REFERENCES cost_centers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX expenses_agency_cost_center_idx ON expenses (agency_id, cost_center_id);

ALTER TABLE payables
  ADD COLUMN category_id TEXT,
  ADD COLUMN cost_center_id TEXT;
ALTER TABLE payables
  ADD CONSTRAINT payables_category_tenant_fk
    FOREIGN KEY (agency_id, category_id) REFERENCES financial_categories (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT payables_cost_center_tenant_fk
    FOREIGN KEY (agency_id, cost_center_id) REFERENCES cost_centers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX payables_agency_category_idx ON payables (agency_id, category_id);
CREATE INDEX payables_agency_cost_center_idx ON payables (agency_id, cost_center_id);

ALTER TABLE receivables
  ADD COLUMN category_id TEXT,
  ADD COLUMN cost_center_id TEXT;
ALTER TABLE receivables
  ADD CONSTRAINT receivables_category_tenant_fk
    FOREIGN KEY (agency_id, category_id) REFERENCES financial_categories (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT receivables_cost_center_tenant_fk
    FOREIGN KEY (agency_id, cost_center_id) REFERENCES cost_centers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX receivables_agency_category_idx ON receivables (agency_id, category_id);
CREATE INDEX receivables_agency_cost_center_idx ON receivables (agency_id, cost_center_id);

ALTER TABLE air_services ADD COLUMN cost_center_id TEXT;
ALTER TABLE air_services
  ADD CONSTRAINT air_services_cost_center_tenant_fk
    FOREIGN KEY (agency_id, cost_center_id) REFERENCES cost_centers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX air_services_agency_cost_center_idx ON air_services (agency_id, cost_center_id);

ALTER TABLE land_services ADD COLUMN cost_center_id TEXT;
ALTER TABLE land_services
  ADD CONSTRAINT land_services_cost_center_tenant_fk
    FOREIGN KEY (agency_id, cost_center_id) REFERENCES cost_centers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX land_services_agency_cost_center_idx ON land_services (agency_id, cost_center_id);
