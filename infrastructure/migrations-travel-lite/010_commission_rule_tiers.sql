-- ============================================================
-- TRAVEL LITE — 010_commission_rule_tiers.sql
-- Motor de comissões, Fase 3: comissão progressiva por faixas de meta
-- mensal. Ver docs/travel-lite/COMMISSION-ENGINE-SPEC.md (§3.3, §3.4).
--
-- Uma versão de regra pode ser "progressiva": a base acumulada do vendedor
-- no mês civil (vendas confirmadas) é fatiada em faixas contíguas e cada
-- fatia usa a taxa da sua faixa (marginal: a venda que cruza a meta é
-- dividida entre a taxa antiga e a nova). Taxas em pontos percentuais.
-- Faixas pertencem à versão e são append-only (como as versões).
-- Forward-only e re-executável.
-- ============================================================

ALTER TABLE commission_rule_versions
  ADD COLUMN IF NOT EXISTS progressive BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commission_rule_versions_progressive_check') THEN
    ALTER TABLE commission_rule_versions ADD CONSTRAINT commission_rule_versions_progressive_check
      CHECK (NOT progressive OR (mode = 'PERCENTAGE' AND apply_on = 'TOTAL'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS commission_rule_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  version_id UUID NOT NULL,
  tier_number INT NOT NULL CHECK (tier_number >= 1),
  from_amount NUMERIC(14, 2) NOT NULL CHECK (from_amount >= 0),
  to_amount NUMERIC(14, 2),
  rate NUMERIC(7, 4) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  FOREIGN KEY (tenant_id, version_id) REFERENCES commission_rule_versions (tenant_id, id),
  UNIQUE (tenant_id, version_id, tier_number),
  CHECK (to_amount IS NULL OR to_amount > from_amount)
);

CREATE INDEX IF NOT EXISTS idx_commission_rule_tiers_version
  ON commission_rule_tiers (tenant_id, version_id, tier_number);

GRANT SELECT, INSERT ON commission_rule_tiers TO travel_lite_runtime;

ALTER TABLE commission_rule_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rule_tiers FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'commission_rule_tiers' AND policyname = 'commission_rule_tiers_select_tenant') THEN
    CREATE POLICY commission_rule_tiers_select_tenant ON commission_rule_tiers
      FOR SELECT USING (tenant_id = current_tenant_id()::uuid);
    CREATE POLICY commission_rule_tiers_insert_tenant ON commission_rule_tiers
      FOR INSERT WITH CHECK (tenant_id = current_tenant_id()::uuid);
  END IF;
END $$;
