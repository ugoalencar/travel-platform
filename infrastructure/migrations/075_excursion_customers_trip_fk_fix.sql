-- ============================================================
-- FIX: excursion_customers.trip_id composite FK ON DELETE SET NULL
-- ============================================================
-- Repository stabilization pass (CI-03): excursion_customers_trip_tenant_fk
-- (migration 071) is a composite FK on (agency_id, trip_id) with
-- ON DELETE SET NULL. Postgres nulls out EVERY column in a composite FK's
-- referencing side on that action -- including agency_id, which is
-- NOT NULL -- so deleting any Trip referenced by an excursion roster row
-- fails with a NOT NULL violation instead of clearing trip_id. This is
-- the exact bug class already found and fixed for
-- pescador_search_results.source_id in migration 073; see that
-- migration's note for the full explanation.
--
-- Reproduced directly against a real migrated test database: inserting a
-- roster row with a trip_id, then `DELETE FROM trips WHERE id = ...`,
-- raised `null value in column "agency_id" of relation
-- "excursion_customers" violates not-null constraint` -- confirmed real,
-- not theoretical (no application code path currently deletes a Trip, so
-- this was dormant, not yet hit in practice, but the very first delete
-- path added would fail).
--
-- Fixed the same way as 073: a single-column FK on the trip's globally
-- unique id, not the tenant-composite (agency_id, trip_id) pair. This
-- keeps ON DELETE SET NULL working (it nulls trip_id alone) while the
-- app still only ever sets trip_id from a trip already scoped to the
-- current tenant, so cross-tenant references can't practically occur in
-- practice despite the FK no longer enforcing it at the database layer.
--
-- Migration 071 itself is left untouched (forward-only, preserving
-- historical migration integrity) -- this only swaps the constraint.
-- ============================================================

ALTER TABLE excursion_customers
  DROP CONSTRAINT excursion_customers_trip_tenant_fk;

ALTER TABLE excursion_customers
  ADD CONSTRAINT excursion_customers_trip_fk
    FOREIGN KEY (trip_id) REFERENCES trips (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
