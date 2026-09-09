-- ============================================================
-- COMMISSION ENTRIES: DB-level duplicate-generation guard
-- Final integration audit fix (P1)
-- ============================================================
-- generateCommission() (services/api/src/commissions.ts) already
-- rejects re-generation at the application layer when a non-cancelled
-- commission_entries row exists for the same (agency, sale, employee).
-- This adds the equivalent guarantee at the database level via a
-- partial unique index, so the invariant holds even under concurrent
-- requests racing past the application-level check inside their own
-- transactions. Cancelled entries are excluded from the index so a
-- cancelled + regenerated commission remains possible, per the
-- application-level contract ("cancel it before generating a new one").
-- Purely additive; no existing data is touched (a fresh/demo database
-- has no duplicates to conflict with).
-- ============================================================

CREATE UNIQUE INDEX commission_entries_agency_sale_employee_active_uidx
  ON commission_entries (agency_id, sale_id, employee_id)
  WHERE status <> 'CANCELLED';
