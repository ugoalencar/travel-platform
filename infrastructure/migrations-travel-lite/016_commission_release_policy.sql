-- ============================================================
-- TRAVEL LITE — 016_commission_release_policy.sql
-- Onda E2 (COM-03). Espelha o contrato validado no Full (migration 108):
--   * a FORMA de pagamento define SE a venda exige o valor recebido. payment_methods ganha
--     receipt_rule_decided: formas existentes = decididas (mantêm requires_receipt como está);
--     formas novas só ficam decididas quando o cadastro informa requires_receipt.
--   * commission_financial_profiles: o perfil financeiro do tenant define COMO isso afeta a
--     liberação. APPEND-ONLY com vigência. Tenants existentes recebem um perfil inicial
--     SOMENTE_LIBERACAO (preserva o comportamento atual do Lite, que já libera por recebimento);
--     é decisão adotada por padrão e exige confirmação humana.
--   * seller_commissions.release_mode aceita BLOCKED: sem forma/regra/perfil a comissão NÃO é
--     liberada (nunca ON_SALE por omissão); release_blocked_missing guarda o que falta e a
--     comissão é re-resolvida quando a configuração é completada.
-- Forward-only, aditiva e re-executável. Nenhum dado existente é reescrito.
-- ============================================================

ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS receipt_rule_decided BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS commission_financial_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  effect TEXT NOT NULL CHECK (effect IN ('META_E_LIBERACAO', 'SOMENTE_LIBERACAO')),
  effective_from DATE NOT NULL,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commission_financial_profiles_tenant_effective_idx
  ON commission_financial_profiles (tenant_id, effective_from DESC, created_at DESC);

CREATE OR REPLACE FUNCTION commission_financial_profiles_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'commission_financial_profiles is append-only' USING ERRCODE = '55000';
END $$;
DROP TRIGGER IF EXISTS commission_financial_profiles_immutable ON commission_financial_profiles;
CREATE TRIGGER commission_financial_profiles_immutable BEFORE UPDATE OR DELETE ON commission_financial_profiles
  FOR EACH ROW EXECUTE FUNCTION commission_financial_profiles_immutable();

DO $$
DECLARE
  t TEXT := 'commission_financial_profiles';
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_select_tenant') THEN
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (tenant_id = current_tenant_id()::uuid)', t || '_select_tenant', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (tenant_id = current_tenant_id()::uuid)', t || '_insert_tenant', t);
  END IF;
END $$;

GRANT SELECT, INSERT ON commission_financial_profiles TO travel_lite_runtime;

-- Perfil inicial para tenants que já operam (idempotente: só onde ainda não há perfil).
INSERT INTO commission_financial_profiles (tenant_id, effect, effective_from, reason)
SELECT t.id, 'SOMENTE_LIBERACAO', DATE '2000-01-01', 'Migrado: preserva a liberação por recebimento que o Lite já praticava'
  FROM tenants t
 WHERE NOT EXISTS (SELECT 1 FROM commission_financial_profiles p WHERE p.tenant_id = t.id);

ALTER TABLE seller_commissions
  ADD COLUMN IF NOT EXISTS release_blocked_missing TEXT[];

ALTER TABLE seller_commissions DROP CONSTRAINT IF EXISTS seller_commissions_release_mode_check;
ALTER TABLE seller_commissions ADD CONSTRAINT seller_commissions_release_mode_check
  CHECK (release_mode IN ('ON_SALE', 'ON_RECEIPT', 'BLOCKED'));
