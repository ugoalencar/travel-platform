-- ============================================================
-- 107_commission_rule_versions_attributions.sql
-- Onda E1 (COM-01/COM-02): regras de comissão de funcionário versionadas e progressivas,
-- e atribuição de venda a funcionário (F1). ADITIVA: não altera employee_commission_rules (080)
-- nem apaga/reescreve dados; comissões e regras existentes continuam valendo como estão.
--   * employee_commission_rule_scopes: identidade da regra (funcionário e/ou categoria; nulo = padrão
--     da agência / todas as categorias). Unicidade por índices PARCIAIS separados sobre colunas cruas
--     (nunca COALESCE com cast de enum para texto, que o PostgreSQL não aceita em índice).
--   * employee_commission_rule_versions: revisões APPEND-ONLY. Duas revisões no mesmo dia coexistem;
--     a vigência é projetada (maior effective_from <= data; empate -> maior version_number), nunca
--     armazenada como valid_until.
--   * employee_commission_rule_tiers: faixas da progressão marginal (por versão, append-only).
--   * sale_commission_attributions: venda -> funcionário (+categoria), com seq e snapshots de valores;
--     é a unidade do acumulado canônico (não se soma commission_entries).
--   * commission_entries: ganha rule_version_id/accumulated_before/calculation_snapshot, a 3ª
--     linhagem (por versão) e o status PENDING_RULE (valor 0, fora da folha e do DRE).
-- A dimensão product_type fica reservada: a progressão é de unidade-venda (PACKAGE_TOTAL).
-- ============================================================

CREATE TABLE employee_commission_rule_scopes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  employee_id TEXT,
  category_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  legacy_ref TEXT,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ecrs_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ecrs_employee_tenant_fk FOREIGN KEY (agency_id, employee_id) REFERENCES employees (agency_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ecrs_category_tenant_fk FOREIGN KEY (agency_id, category_id) REFERENCES commission_categories (agency_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ecrs_status_check CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  CONSTRAINT ecrs_agency_id_key UNIQUE (agency_id, id)
);

CREATE UNIQUE INDEX ecrs_emp_category_uidx ON employee_commission_rule_scopes (agency_id, employee_id, category_id)
  WHERE status = 'ACTIVE' AND employee_id IS NOT NULL AND category_id IS NOT NULL;
CREATE UNIQUE INDEX ecrs_emp_all_uidx ON employee_commission_rule_scopes (agency_id, employee_id)
  WHERE status = 'ACTIVE' AND employee_id IS NOT NULL AND category_id IS NULL;
CREATE UNIQUE INDEX ecrs_ag_category_uidx ON employee_commission_rule_scopes (agency_id, category_id)
  WHERE status = 'ACTIVE' AND employee_id IS NULL AND category_id IS NOT NULL;
CREATE UNIQUE INDEX ecrs_ag_all_uidx ON employee_commission_rule_scopes (agency_id)
  WHERE status = 'ACTIVE' AND employee_id IS NULL AND category_id IS NULL;
CREATE UNIQUE INDEX ecrs_legacy_ref_uidx ON employee_commission_rule_scopes (agency_id, legacy_ref)
  WHERE legacy_ref IS NOT NULL;

CREATE TABLE employee_commission_rule_versions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  effective_from DATE NOT NULL,
  revised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revised_by TEXT,
  reason TEXT,
  mode TEXT NOT NULL,
  calculation_metric TEXT NOT NULL DEFAULT 'GROSS',
  value NUMERIC(14, 4),
  apply_on TEXT NOT NULL DEFAULT 'TOTAL',
  excess_threshold NUMERIC(14, 2),
  progressive BOOLEAN NOT NULL DEFAULT false,
  tier_mode TEXT NOT NULL DEFAULT 'MARGINAL',
  excess_basis TEXT,
  legacy_ref TEXT,
  CONSTRAINT ecrv_scope_tenant_fk FOREIGN KEY (agency_id, scope_id) REFERENCES employee_commission_rule_scopes (agency_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ecrv_revised_by_fk FOREIGN KEY (agency_id, revised_by) REFERENCES users (agency_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ecrv_version_number_check CHECK (version_number >= 1),
  CONSTRAINT ecrv_mode_check CHECK (mode IN ('PERCENTAGE', 'FIXED', 'NONE')),
  CONSTRAINT ecrv_metric_check CHECK (calculation_metric IN ('GROSS', 'MARGIN')),
  CONSTRAINT ecrv_apply_on_check CHECK (apply_on IN ('TOTAL', 'EXCESS')),
  CONSTRAINT ecrv_tier_mode_check CHECK (tier_mode = 'MARGINAL'),
  CONSTRAINT ecrv_excess_basis_check CHECK (excess_basis IS NULL),
  CONSTRAINT ecrv_value_check CHECK (value IS NULL OR value >= 0),
  CONSTRAINT ecrv_mode_value_check CHECK (
    (mode = 'NONE' AND value IS NULL AND NOT progressive)
    OR (mode = 'FIXED' AND value IS NOT NULL AND NOT progressive)
    OR (mode = 'PERCENTAGE' AND ((progressive AND value IS NULL) OR (NOT progressive AND value IS NOT NULL)))
  ),
  CONSTRAINT ecrv_excess_check CHECK (apply_on = 'TOTAL' OR (excess_threshold IS NOT NULL AND excess_threshold >= 0 AND NOT progressive)),
  CONSTRAINT ecrv_scope_version_key UNIQUE (agency_id, scope_id, version_number),
  CONSTRAINT ecrv_agency_id_key UNIQUE (agency_id, id)
);
CREATE INDEX ecrv_scope_effective_idx ON employee_commission_rule_versions (agency_id, scope_id, effective_from DESC, version_number DESC);
CREATE UNIQUE INDEX ecrv_legacy_ref_uidx ON employee_commission_rule_versions (agency_id, legacy_ref) WHERE legacy_ref IS NOT NULL;

CREATE TABLE employee_commission_rule_tiers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  tier_number INTEGER NOT NULL,
  from_amount NUMERIC(14, 2) NOT NULL,
  to_amount NUMERIC(14, 2),
  rate NUMERIC(7, 4) NOT NULL,
  CONSTRAINT ecrt_version_tenant_fk FOREIGN KEY (agency_id, version_id) REFERENCES employee_commission_rule_versions (agency_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ecrt_tier_check CHECK (tier_number >= 1 AND from_amount >= 0 AND rate >= 0 AND (to_amount IS NULL OR to_amount > from_amount)),
  CONSTRAINT ecrt_version_tier_key UNIQUE (agency_id, version_id, tier_number)
);

-- Versions and tiers are immutable for everyone, including the table owner.
CREATE FUNCTION employee_commission_rule_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END $$;
CREATE TRIGGER ecrv_immutable BEFORE UPDATE OR DELETE ON employee_commission_rule_versions
  FOR EACH ROW EXECUTE FUNCTION employee_commission_rule_immutable();
CREATE TRIGGER ecrt_immutable BEFORE UPDATE OR DELETE ON employee_commission_rule_tiers
  FOR EACH ROW EXECUTE FUNCTION employee_commission_rule_immutable();

CREATE TABLE sale_commission_attributions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  category_id TEXT,
  recognition_date DATE NOT NULL,
  gross_amount NUMERIC(14, 2) NOT NULL,
  margin_amount NUMERIC(14, 2),
  seq BIGINT GENERATED ALWAYS AS IDENTITY,
  state TEXT NOT NULL DEFAULT 'ACTIVE',
  source TEXT NOT NULL DEFAULT 'FULL',
  legacy_ref TEXT,
  created_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sca_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sca_sale_tenant_fk FOREIGN KEY (agency_id, sale_id) REFERENCES sales (agency_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sca_employee_tenant_fk FOREIGN KEY (agency_id, employee_id) REFERENCES employees (agency_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sca_category_tenant_fk FOREIGN KEY (agency_id, category_id) REFERENCES commission_categories (agency_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sca_state_check CHECK (state IN ('ACTIVE', 'CANCELLED')),
  CONSTRAINT sca_source_check CHECK (source IN ('FULL', 'LITE_PAIRING')),
  CONSTRAINT sca_amounts_check CHECK (gross_amount >= 0 AND (margin_amount IS NULL OR margin_amount >= 0)),
  CONSTRAINT sca_sale_employee_key UNIQUE (agency_id, sale_id, employee_id),
  CONSTRAINT sca_agency_id_key UNIQUE (agency_id, id)
);
CREATE INDEX sca_accrual_idx ON sale_commission_attributions (agency_id, employee_id, recognition_date, seq) WHERE state = 'ACTIVE';
CREATE UNIQUE INDEX sca_legacy_ref_uidx ON sale_commission_attributions (agency_id, legacy_ref) WHERE legacy_ref IS NOT NULL;

-- commission_entries: version lineage, accumulated base, calculation memory, PENDING_RULE.
ALTER TABLE commission_entries
  ADD COLUMN rule_version_id TEXT,
  ADD COLUMN accumulated_before NUMERIC(14, 2),
  ADD COLUMN calculation_snapshot JSONB;
ALTER TABLE commission_entries
  ADD CONSTRAINT commission_entries_rule_version_tenant_fk
    FOREIGN KEY (agency_id, rule_version_id) REFERENCES employee_commission_rule_versions (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE commission_entries DROP CONSTRAINT commission_entries_status_check;
ALTER TABLE commission_entries ADD CONSTRAINT commission_entries_status_check
  CHECK (status IN ('PENDING', 'APPROVED', 'PAYABLE', 'PAID', 'CANCELLED', 'PENDING_RULE'));

ALTER TABLE commission_entries DROP CONSTRAINT commission_entries_lineage_check;
ALTER TABLE commission_entries ADD CONSTRAINT commission_entries_lineage_check CHECK (
  (commission_plan_id IS NOT NULL AND commission_rule_id IS NULL AND product_type IS NULL AND rule_version_id IS NULL)
  OR (commission_plan_id IS NULL AND commission_rule_id IS NOT NULL AND product_type IS NOT NULL AND rule_version_id IS NULL)
  OR (commission_plan_id IS NULL AND commission_rule_id IS NULL AND product_type IS NULL AND rule_version_id IS NOT NULL)
  OR (status = 'PENDING_RULE' AND commission_plan_id IS NULL AND commission_rule_id IS NULL AND rule_version_id IS NULL AND product_type IS NULL AND amount = 0)
);

DO $$
DECLARE
  t TEXT;
  runtime_role TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['employee_commission_rule_scopes', 'employee_commission_rule_versions',
                           'employee_commission_rule_tiers', 'sale_commission_attributions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (agency_id = current_agency_id())', t || '_select_tenant', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (agency_id = current_agency_id())', t || '_insert_tenant', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id())', t || '_update_tenant', t);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', t);
  END LOOP;
  FOREACH runtime_role IN ARRAY ARRAY['travel_app_runtime_local', 'travel_app_runtime'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON employee_commission_rule_scopes TO %I', runtime_role);
      EXECUTE format('GRANT SELECT, INSERT ON employee_commission_rule_versions TO %I', runtime_role);
      EXECUTE format('GRANT SELECT, INSERT ON employee_commission_rule_tiers TO %I', runtime_role);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON sale_commission_attributions TO %I', runtime_role);
    END IF;
  END LOOP;
END $$;

INSERT INTO schema_migrations (version) VALUES ('107') ON CONFLICT (version) DO NOTHING;
