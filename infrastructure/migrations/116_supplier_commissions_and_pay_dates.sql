-- Supplier-scoped employee commissions and append-only payment date policy.
-- Additive: historical commission entries and snapshots are not rewritten.

ALTER TABLE employee_commission_rule_scopes
  ADD COLUMN supplier_id TEXT;
ALTER TABLE employee_commission_rule_scopes
  ADD CONSTRAINT ecrs_supplier_tenant_fk
    FOREIGN KEY (agency_id, supplier_id) REFERENCES suppliers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX ecrs_emp_category_uidx;
DROP INDEX ecrs_emp_all_uidx;
DROP INDEX ecrs_ag_category_uidx;
DROP INDEX ecrs_ag_all_uidx;
CREATE UNIQUE INDEX ecrs_emp_supplier_uidx ON employee_commission_rule_scopes (agency_id, employee_id, supplier_id)
  WHERE status='ACTIVE' AND employee_id IS NOT NULL AND supplier_id IS NOT NULL AND category_id IS NULL;
CREATE UNIQUE INDEX ecrs_emp_category_uidx ON employee_commission_rule_scopes (agency_id, employee_id, category_id)
  WHERE status='ACTIVE' AND employee_id IS NOT NULL AND category_id IS NOT NULL AND supplier_id IS NULL;
CREATE UNIQUE INDEX ecrs_emp_all_uidx ON employee_commission_rule_scopes (agency_id, employee_id)
  WHERE status='ACTIVE' AND employee_id IS NOT NULL AND category_id IS NULL AND supplier_id IS NULL;
CREATE UNIQUE INDEX ecrs_supplier_category_uidx ON employee_commission_rule_scopes (agency_id, supplier_id, category_id)
  WHERE status='ACTIVE' AND employee_id IS NULL AND supplier_id IS NOT NULL AND category_id IS NOT NULL;
CREATE UNIQUE INDEX ecrs_supplier_uidx ON employee_commission_rule_scopes (agency_id, supplier_id)
  WHERE status='ACTIVE' AND employee_id IS NULL AND supplier_id IS NOT NULL AND category_id IS NULL;
CREATE UNIQUE INDEX ecrs_ag_category_uidx ON employee_commission_rule_scopes (agency_id, category_id)
  WHERE status='ACTIVE' AND employee_id IS NULL AND supplier_id IS NULL AND category_id IS NOT NULL;
CREATE UNIQUE INDEX ecrs_ag_all_uidx ON employee_commission_rule_scopes (agency_id)
  WHERE status='ACTIVE' AND employee_id IS NULL AND supplier_id IS NULL AND category_id IS NULL;
CREATE INDEX ecrs_supplier_lookup_idx ON employee_commission_rule_scopes (agency_id, supplier_id, employee_id, category_id)
  WHERE status='ACTIVE';
CREATE FUNCTION employee_commission_scope_dimensions_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.agency_id,OLD.employee_id,OLD.supplier_id,OLD.category_id) IS DISTINCT FROM
     (NEW.agency_id,NEW.employee_id,NEW.supplier_id,NEW.category_id) THEN
    RAISE EXCEPTION 'employee commission scope dimensions are immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ecrs_dimensions_immutable BEFORE UPDATE ON employee_commission_rule_scopes
  FOR EACH ROW EXECUTE FUNCTION employee_commission_scope_dimensions_immutable();

ALTER TABLE employee_commission_rule_versions DROP CONSTRAINT ecrv_metric_check;
ALTER TABLE employee_commission_rule_versions ADD CONSTRAINT ecrv_metric_check
  CHECK (calculation_metric IN ('GROSS', 'MARGIN', 'SUPPLIER_SOLD_TOTAL'));
ALTER TABLE employee_commission_rule_versions
  ADD COLUMN release_after_supplier_payment BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE agency_revenue_rule_versions
  ADD COLUMN balance_deadline_days SMALLINT NOT NULL DEFAULT 0
    CHECK (balance_deadline_days BETWEEN 0 AND 365);

ALTER TABLE sale_commission_attributions
  ADD COLUMN supplier_id TEXT;
ALTER TABLE sale_commission_attributions
  ADD CONSTRAINT sca_supplier_tenant_fk
    FOREIGN KEY (agency_id, supplier_id) REFERENCES suppliers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE sale_commission_attributions DROP CONSTRAINT sca_sale_employee_key;
CREATE UNIQUE INDEX sca_sale_employee_all_uidx ON sale_commission_attributions (agency_id, sale_id, employee_id)
  WHERE supplier_id IS NULL;
CREATE UNIQUE INDEX sca_sale_employee_supplier_uidx ON sale_commission_attributions (agency_id, sale_id, employee_id, supplier_id)
  WHERE supplier_id IS NOT NULL;
CREATE INDEX sca_supplier_accrual_idx ON sale_commission_attributions (agency_id, supplier_id, employee_id, recognition_date, seq)
  WHERE state='ACTIVE' AND supplier_id IS NOT NULL;

ALTER TABLE commission_entries
  ADD COLUMN supplier_id TEXT,
  ADD COLUMN release_after_supplier_payment BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN expected_pay_date DATE,
  ADD CONSTRAINT commission_supplier_release_requires_supplier
    CHECK (NOT release_after_supplier_payment OR supplier_id IS NOT NULL);
ALTER TABLE commission_entries
  ADD CONSTRAINT commission_entries_supplier_tenant_fk
    FOREIGN KEY (agency_id, supplier_id) REFERENCES suppliers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX commission_entries_agency_sale_employee_legacy_active_uidx;
CREATE UNIQUE INDEX commission_entries_agency_sale_employee_legacy_active_uidx
  ON commission_entries (agency_id, sale_id, employee_id)
  WHERE status <> 'CANCELLED' AND product_type IS NULL AND supplier_id IS NULL;
CREATE UNIQUE INDEX commission_entries_agency_sale_employee_supplier_active_uidx
  ON commission_entries (agency_id, sale_id, employee_id, supplier_id)
  WHERE status <> 'CANCELLED' AND product_type IS NULL AND supplier_id IS NOT NULL;

CREATE TABLE agency_commission_cost_policies (
  agency_id TEXT PRIMARY KEY REFERENCES agencies (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('WARN','BLOCK')) DEFAULT 'WARN',
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (agency_id, updated_by) REFERENCES users (agency_id,id) ON DELETE RESTRICT
);

CREATE TABLE employee_commission_payment_policies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  employee_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('PER_ENTRY','FIXED_DAY','WINDOW')),
  effective_from DATE NOT NULL,
  payment_day SMALLINT,
  payment_days SMALLINT NOT NULL DEFAULT 0 CHECK (payment_days BETWEEN 0 AND 365),
  reason TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ecpp_mode_fields_check CHECK (
    (mode='PER_ENTRY' AND payment_day IS NULL AND payment_days=0) OR
    (mode='FIXED_DAY' AND payment_day BETWEEN 1 AND 31 AND payment_days=0) OR
    (mode='WINDOW' AND payment_day BETWEEN 1 AND 31)
  ),
  CONSTRAINT ecpp_agency_id_key UNIQUE (agency_id,id),
  CONSTRAINT ecpp_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE RESTRICT,
  CONSTRAINT ecpp_employee_tenant_fk FOREIGN KEY (agency_id,employee_id) REFERENCES employees(agency_id,id) ON DELETE RESTRICT,
  CONSTRAINT ecpp_created_by_fk FOREIGN KEY (agency_id,created_by) REFERENCES users(agency_id,id) ON DELETE RESTRICT
);
CREATE INDEX ecpp_active_lookup_idx ON employee_commission_payment_policies (agency_id,employee_id,effective_from DESC,created_at DESC);
CREATE FUNCTION employee_commission_payment_policy_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'employee_commission_payment_policies is append-only' USING ERRCODE='55000';
END $$;
CREATE TRIGGER ecpp_immutable BEFORE UPDATE OR DELETE ON employee_commission_payment_policies
  FOR EACH ROW EXECUTE FUNCTION employee_commission_payment_policy_immutable();

DO $$
DECLARE t TEXT; r TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['agency_commission_cost_policies','employee_commission_payment_policies'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (agency_id=current_agency_id())', t||'_select_tenant', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (agency_id=current_agency_id())', t||'_insert_tenant', t);
    IF t='agency_commission_cost_policies' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (agency_id=current_agency_id()) WITH CHECK (agency_id=current_agency_id())', t||'_update_tenant', t);
    END IF;
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', t);
  END LOOP;
  FOREACH r IN ARRAY ARRAY['travel_app_runtime','travel_app_runtime_local'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON employee_commission_rule_scopes TO %I',r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON sale_commission_attributions TO %I',r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON commission_entries TO %I',r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON agency_commission_cost_policies TO %I',r);
      EXECUTE format('GRANT SELECT, INSERT ON employee_commission_payment_policies TO %I',r);
    END IF;
  END LOOP;
END $$;

INSERT INTO schema_migrations (version) VALUES ('116') ON CONFLICT (version) DO NOTHING;
