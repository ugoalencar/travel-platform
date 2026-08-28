-- ============================================================
-- COMMISSION STRUCTURAL REPAIR
-- Travel Platform
-- ============================================================
-- Fixes a known, pre-existing structural gap documented since the
-- Commission model was first introduced (see the ADR-005 note in
-- packages/database/schema.prisma, model Commission): the commissions
-- table has no UNIQUE(agency_id, id), so no future table can reference
-- it via a composite tenant-safe FK (the same pattern used everywhere
-- else in this schema, e.g. sales_agency_id_key, bookings_agency_id_key).
--
-- Scope: purely additive. No existing column, FK, CHECK, or RLS policy
-- on commissions is touched. No data migration/backfill is needed --
-- commissions has zero application-level consumers today (Commission
-- is documented but never written to by any backend code), so this
-- constraint cannot be violated by any existing row.
--
-- D1 approved: OPTION A (execute the repair now).
-- ============================================================

ALTER TABLE commissions
  ADD CONSTRAINT commissions_agency_id_key UNIQUE (agency_id, id);
