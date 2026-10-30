-- ============================================================
-- TRAVEL LITE — 008_payable_commission_unique.sql
-- Uma comissão tem no máximo uma obrigação (payable) ativa. A aprovação da
-- comissão é o único caminho que a cria; este índice impede, no banco, uma
-- segunda obrigação (e, portanto, pagamento duplicado) para o mesmo direito.
-- Forward-only. Falha explicitamente se já existir duplicidade ativa, para
-- que seja resolvida manualmente antes (nada é apagado ou cancelado aqui).
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM payables
     WHERE commission_id IS NOT NULL AND status <> 'CANCELLED'
     GROUP BY tenant_id, commission_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate active payables per commission exist; resolve them before applying 008';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_payables_active_commission
  ON payables (tenant_id, commission_id)
  WHERE commission_id IS NOT NULL AND status <> 'CANCELLED';
