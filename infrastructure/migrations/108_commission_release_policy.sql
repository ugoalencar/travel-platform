-- ============================================================
-- 108_commission_release_policy.sql
-- Onda E2 (COM-03 + Frente 8): liberacao de comissao por recebimento. ADITIVA.
--   * payment_method_receipt_rules: a FORMA de pagamento define SE a venda exige o dinheiro recebido
--     (requires_receipt). Ausencia de linha = regra nunca decidida (tri-estado) -> recurso BLOQUEADO.
--   * commission_financial_profiles: o perfil financeiro da agencia define COMO isso afeta a liberacao
--     (effect). APPEND-ONLY com vigencia (maior effective_from <= data; empate -> mais recente).
--   * commission_entries: release_mode LEGACY (entradas ja existentes: comportamento atual preservado,
--     nenhum reprocessamento) ou POLICY (novas); release_policy_snapshot; settlement_channel.
--   * commission_release_events: razao APPEND-ONLY de cada decisao de liberacao/quitacao.
-- Sem politica configurada a liberacao por recebimento NUNCA vira "liberar na venda" por omissao.
-- ============================================================

CREATE TABLE payment_method_receipt_rules (
  agency_id TEXT NOT NULL,
  method TEXT NOT NULL,
  requires_receipt BOOLEAN NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agency_id, method),
  CONSTRAINT pmrr_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT pmrr_method_check CHECK (length(btrim(method)) > 0)
);

CREATE TABLE commission_financial_profiles (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  effect TEXT NOT NULL,
  effective_from DATE NOT NULL,
  reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cfp_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT cfp_effect_check CHECK (effect IN ('META_E_LIBERACAO', 'SOMENTE_LIBERACAO')),
  CONSTRAINT cfp_agency_id_key UNIQUE (agency_id, id)
);
CREATE INDEX cfp_agency_effective_idx ON commission_financial_profiles (agency_id, effective_from DESC, created_at DESC);

CREATE TRIGGER cfp_immutable BEFORE UPDATE OR DELETE ON commission_financial_profiles
  FOR EACH ROW EXECUTE FUNCTION employee_commission_rule_immutable();

ALTER TABLE commission_entries
  ADD COLUMN release_mode TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN release_policy_snapshot JSONB,
  ADD COLUMN settlement_channel TEXT,
  ADD CONSTRAINT commission_entries_release_mode_check CHECK (release_mode IN ('LEGACY', 'POLICY')),
  ADD CONSTRAINT commission_entries_settlement_channel_check CHECK (settlement_channel IS NULL OR settlement_channel IN ('PAYABLE', 'PAYROLL'));
-- existing rows stay LEGACY (default above); only entries created from now on are governed by the policy
ALTER TABLE commission_entries ALTER COLUMN release_mode SET DEFAULT 'POLICY';

CREATE TABLE commission_release_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  commission_entry_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  recognized NUMERIC(14, 2) NOT NULL,
  received NUMERIC(14, 2) NOT NULL,
  sale_total NUMERIC(14, 2) NOT NULL,
  released NUMERIC(14, 2) NOT NULL,
  paid NUMERIC(14, 2) NOT NULL,
  requested NUMERIC(14, 2),
  policy JSONB NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cre_agency_fk FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT cre_entry_tenant_fk FOREIGN KEY (agency_id, commission_entry_id) REFERENCES commission_entries (agency_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT cre_type_check CHECK (event_type IN ('PAYABLE_CREATED', 'ALLOCATION_ACCEPTED', 'PAYROLL_RESERVED'))
);
CREATE INDEX cre_entry_idx ON commission_release_events (agency_id, commission_entry_id, created_at);

CREATE TRIGGER cre_immutable BEFORE UPDATE OR DELETE ON commission_release_events
  FOR EACH ROW EXECUTE FUNCTION employee_commission_rule_immutable();

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['payment_method_receipt_rules', 'commission_financial_profiles', 'commission_release_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (agency_id = current_agency_id())', t || '_select_tenant', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (agency_id = current_agency_id())', t || '_insert_tenant', t);
  END LOOP;
  CREATE POLICY payment_method_receipt_rules_update_tenant ON payment_method_receipt_rules
    FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
END;
$$;

INSERT INTO schema_migrations (version) VALUES ('108') ON CONFLICT (version) DO NOTHING;
