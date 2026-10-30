-- ============================================================
-- 099_payroll_payable_unique.sql
-- A payroll entry has at most one live (non-cancelled) payment obligation.
-- Backs payPayrollEntry(): creating an obligation no longer marks the entry
-- PAID, so a repeated or concurrent call must not create a second payable.
-- Additive only. Aborts with a clear error if duplicates already exist
-- (nothing is deleted or cancelled here).
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM payables
     WHERE payroll_entry_id IS NOT NULL AND status <> 'CANCELLED'
     GROUP BY agency_id, payroll_entry_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate live payables per payroll entry exist; resolve them before applying 099';
  END IF;
END $$;

CREATE UNIQUE INDEX payables_agency_payroll_entry_live_key
  ON payables (agency_id, payroll_entry_id)
  WHERE payroll_entry_id IS NOT NULL AND status <> 'CANCELLED';

INSERT INTO schema_migrations (version) VALUES ('099') ON CONFLICT (version) DO NOTHING;
