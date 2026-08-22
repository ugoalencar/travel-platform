-- ============================================================
-- TRANSPORTATION DOMAIN — ROUTE POINTS (optional check-in)
-- Travel Platform
-- ============================================================
-- Adds: RoutePoint, a child of Route representing an ordered
-- itinerary point. Approved scope addition on top of 003.
--
-- Scope decisions (see brief for full detail):
--  - Check-in is OPTIONAL PER POINT. checkpointRequired = false means
--    the point is itinerary-only: no operational obligation, no
--    pending item, no schedule-compliance calculation.
--  - checkpointRequired = true means the point enters operational
--    monitoring; a future Operation entity (not built here) would
--    generate a corresponding checkpoint.
--  - CheckpointType (ARRIVAL/DEPARTURE/BOTH) is a decision-backed
--    enum, explicitly approved in this scope addition.
--  - plannedOffsetMinutes stores a PLANNED offset (minutes after the
--    ScheduledDeparture's departure_at), never an absolute timestamp.
--    Any expected-absolute-time (departure_at + offset) is a future
--    derivation, not persisted here. No "actual"/"executed" columns
--    are invented in this migration.
--  - Route's existing origin/destination/active/notes columns are
--    untouched. Origin/destination MAY also be represented as
--    RoutePoints (first/last sequence) by convention only — there is
--    no special "origin RoutePoint" subtype and no enforced sync.
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE "CheckpointType" AS ENUM ('ARRIVAL', 'DEPARTURE', 'BOTH');

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE route_points (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  name TEXT NOT NULL,
  -- Optional per point (business rule): false is the default and does
  -- not create any operational obligation.
  checkpoint_required BOOLEAN NOT NULL DEFAULT false,
  checkpoint_type "CheckpointType",
  -- Minutes after the future ScheduledDeparture's departure_at. Not an
  -- absolute time, not a new timezone concept.
  planned_offset_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT route_points_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT route_points_route_tenant_fk
    FOREIGN KEY (agency_id, route_id) REFERENCES routes (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT route_points_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT route_points_agency_route_sequence_key
    UNIQUE (agency_id, route_id, sequence),
  CONSTRAINT route_points_sequence_positive_check
    CHECK (sequence > 0),
  CONSTRAINT route_points_offset_non_negative_check
    CHECK (planned_offset_minutes IS NULL OR planned_offset_minutes >= 0),
  -- Cross-column CHECK matching this codebase's existing style (see
  -- transport_products_return_route_required_check in 003): a point
  -- flagged for operational monitoring must carry a checkpoint type
  -- to be structurally meaningful. Application layer also validates
  -- this for a clean error message; this CHECK is the DB backstop.
  CONSTRAINT route_points_checkpoint_type_required_check
    CHECK (checkpoint_required = false OR checkpoint_type IS NOT NULL)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX route_points_agency_idx ON route_points (agency_id);
CREATE INDEX route_points_agency_route_sequence_idx
  ON route_points (agency_id, route_id, sequence);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Same 4-policy-per-table tenant pattern as 002_rls_policies.sql and
-- 003_transportation.sql. current_agency_id() is defined in 002 and
-- reused here unchanged.

ALTER TABLE route_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_points FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS route_points_select_tenant ON route_points;
DROP POLICY IF EXISTS route_points_insert_tenant ON route_points;
DROP POLICY IF EXISTS route_points_update_tenant ON route_points;
DROP POLICY IF EXISTS route_points_delete_tenant ON route_points;

CREATE POLICY route_points_select_tenant ON route_points
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY route_points_insert_tenant ON route_points
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY route_points_update_tenant ON route_points
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY route_points_delete_tenant ON route_points
  FOR DELETE
  USING (agency_id = current_agency_id());

-- ============================================================
-- RUNTIME ROLE GRANTS
-- ============================================================
-- Grants for route_points are added to the test role via a
-- to_regclass-guarded block appended to
-- tests/integration/database/002_prepare_local_roles.sql, keyed off
-- to_regclass('public.route_points') IS NOT NULL, so domains that
-- only apply 001+002 are unaffected. This migration file stays pure
-- schema/RLS, matching 003_transportation.sql's approach.
