-- ============================================================
-- 100_commission_channel_protection.sql
-- Comissões, Fase 0 da paridade Full/Lite: pagamento único por comissão.
--   * um payable vivo (não cancelado) por entrada de comissão;
--   * uma entrada pertence a, no máximo, UMA folha (payroll_entries): a folha
--     "reserva" a entrada; enquanto reservada ela não pode ter payable avulso,
--     e uma entrada com payable avulso não entra na folha (canal único).
-- Aditiva. Não altera nem apaga dados: se já existirem payables vivos
-- duplicados para a mesma entrada, a migration ABORTA com erro claro e o
-- problema deve ser resolvido pelo responsável antes de reaplicar.
-- Entradas/folhas existentes NÃO recebem vínculo retroativo (legado em
-- conflito é só reportado: ver listCommissionChannelConflicts).
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM payables
     WHERE commission_entry_id IS NOT NULL AND status <> 'CANCELLED'
     GROUP BY agency_id, commission_entry_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate live payables per commission entry exist; resolve them before applying 100';
  END IF;
END $$;

CREATE UNIQUE INDEX payables_agency_commission_entry_live_key
  ON payables (agency_id, commission_entry_id)
  WHERE commission_entry_id IS NOT NULL AND status <> 'CANCELLED';

ALTER TABLE commission_entries
  ADD COLUMN payroll_entry_id TEXT;

ALTER TABLE commission_entries
  ADD CONSTRAINT commission_entries_payroll_entry_tenant_fk
    FOREIGN KEY (agency_id, payroll_entry_id) REFERENCES payroll_entries (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX commission_entries_agency_payroll_entry_idx
  ON commission_entries (agency_id, payroll_entry_id)
  WHERE payroll_entry_id IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('100') ON CONFLICT (version) DO NOTHING;
