-- ============================================================
-- TRAVEL LITE — 009_commission_rules.sql
-- Motor de comissões, Fase 2: regras versionadas (append-only) por
-- vendedor / categoria / vigência. Ver docs/travel-lite/COMMISSION-ENGINE-SPEC.md.
--
--   commission_rules          identidade da regra (um escopo ativo por
--                             vendedor+categoria; vendedor/categoria nulos =
--                             padrão da agência / todas as categorias).
--   commission_rule_versions  cada revisão; nunca alterada nem apagada.
--
-- As colunas commission_* de sellers continuam existindo (API legada) e
-- viram a "regra do vendedor": cada vendedor com regra definida ganha aqui
-- uma regra de escopo vendedor com versão inicial vigente desde 1970-01-01
-- (equivale ao comportamento anterior, que ignorava datas). Sem
-- retroatividade: comissões já calculadas mantêm seu snapshot.
-- Forward-only. Nova permissão: commissions.rules_manage (ADMIN, MANAGER).
-- ============================================================

CREATE TABLE IF NOT EXISTS commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  seller_id UUID,
  category_id UUID,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, seller_id) REFERENCES sellers (tenant_id, id),
  FOREIGN KEY (tenant_id, category_id) REFERENCES sale_categories (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id),
  UNIQUE (tenant_id, id)
);

-- Um único escopo ativo evita regras concorrentes para o mesmo caso.
CREATE UNIQUE INDEX IF NOT EXISTS ux_commission_rules_active_scope
  ON commission_rules (
    tenant_id,
    COALESCE(seller_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS commission_rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  rule_id UUID NOT NULL,
  version_number INT NOT NULL CHECK (version_number >= 1),
  effective_from DATE NOT NULL,
  revised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revised_by UUID,
  reason TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('PERCENTAGE', 'FIXED', 'NONE')),
  calculation_base TEXT CHECK (calculation_base IN ('GROSS', 'MARGIN')),
  value NUMERIC(14, 4) CHECK (value IS NULL OR value >= 0),
  apply_on TEXT NOT NULL DEFAULT 'TOTAL' CHECK (apply_on IN ('TOTAL', 'EXCESS')),
  excess_threshold NUMERIC(14, 2) CHECK (excess_threshold IS NULL OR excess_threshold >= 0),
  FOREIGN KEY (tenant_id, rule_id) REFERENCES commission_rules (tenant_id, id),
  FOREIGN KEY (tenant_id, revised_by) REFERENCES users (tenant_id, id),
  UNIQUE (tenant_id, rule_id, version_number),
  UNIQUE (tenant_id, id),
  CHECK (mode <> 'NONE' OR (value IS NULL AND calculation_base IS NULL AND apply_on = 'TOTAL')),
  CHECK (mode <> 'PERCENTAGE' OR (value IS NOT NULL AND calculation_base IS NOT NULL)),
  CHECK (mode <> 'FIXED' OR (value IS NOT NULL AND calculation_base IS NULL AND apply_on = 'TOTAL')),
  CHECK ((apply_on = 'EXCESS') = (excess_threshold IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_commission_rule_versions_lookup
  ON commission_rule_versions (tenant_id, rule_id, effective_from DESC, version_number DESC);

-- ------------------------------------------------------------
-- Grants + RLS (versões: append-only, sem UPDATE/DELETE)
-- ------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON commission_rules TO travel_lite_runtime;
GRANT SELECT, INSERT ON commission_rule_versions TO travel_lite_runtime;

ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE commission_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rule_versions FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'commission_rules' AND policyname = 'commission_rules_select_tenant') THEN
    CREATE POLICY commission_rules_select_tenant ON commission_rules
      FOR SELECT USING (tenant_id = current_tenant_id()::uuid);
    CREATE POLICY commission_rules_insert_tenant ON commission_rules
      FOR INSERT WITH CHECK (tenant_id = current_tenant_id()::uuid);
    CREATE POLICY commission_rules_update_tenant ON commission_rules
      FOR UPDATE USING (tenant_id = current_tenant_id()::uuid)
      WITH CHECK (tenant_id = current_tenant_id()::uuid);
    CREATE POLICY commission_rule_versions_select_tenant ON commission_rule_versions
      FOR SELECT USING (tenant_id = current_tenant_id()::uuid);
    CREATE POLICY commission_rule_versions_insert_tenant ON commission_rule_versions
      FOR INSERT WITH CHECK (tenant_id = current_tenant_id()::uuid);
  END IF;
END $$;

-- ------------------------------------------------------------
-- Permissão nova
-- ------------------------------------------------------------

INSERT INTO permissions (key, description, master_only) VALUES
  ('commissions.rules_manage', 'Criar, revisar e arquivar regras de comissão', false)
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description, master_only = EXCLUDED.master_only;

INSERT INTO role_permissions (role, permission) VALUES
  ('ADMIN', 'commissions.rules_manage'),
  ('MANAGER', 'commissions.rules_manage')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Legado: regra atual de cada vendedor -> regra + versão inicial
-- (idempotente: só vendedores ainda sem regra de escopo vendedor)
-- ------------------------------------------------------------

WITH legacy AS (
  INSERT INTO commission_rules (tenant_id, seller_id, category_id, name)
  SELECT s.tenant_id, s.id, NULL, 'Regra do vendedor'
    FROM sellers s
   WHERE s.commission_rule_type <> 'UNDEFINED'
     AND NOT EXISTS (
       SELECT 1 FROM commission_rules r
        WHERE r.tenant_id = s.tenant_id AND r.seller_id = s.id
          AND r.category_id IS NULL AND r.status = 'ACTIVE')
  RETURNING id, tenant_id, seller_id
)
INSERT INTO commission_rule_versions
  (tenant_id, rule_id, version_number, effective_from, reason, mode, calculation_base, value)
SELECT l.tenant_id, l.id, 1, DATE '1970-01-01',
       'Migrado dos campos de comissão do vendedor (009)',
       CASE WHEN s.commission_rule_type = 'FIXED' THEN 'FIXED' ELSE 'PERCENTAGE' END,
       CASE s.commission_rule_type
         WHEN 'PERCENTAGE_ON_GROSS' THEN 'GROSS'
         WHEN 'PERCENTAGE_ON_MARGIN' THEN 'MARGIN'
         ELSE NULL END,
       CASE WHEN s.commission_rule_type = 'FIXED' THEN s.commission_fixed_amount ELSE s.commission_rate END
  FROM legacy l
  JOIN sellers s ON s.tenant_id = l.tenant_id AND s.id = l.seller_id;
