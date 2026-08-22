-- ============================================================
-- FIELD OPERATIONS DOMAIN V1
-- Travel Platform
-- ============================================================
-- Adds: TransportOperation, OperationCheckpoint.
--
-- Scope decisions (see brief for full detail):
--  - RoutePoint = PLAN. TransportOperation/OperationCheckpoint =
--    EXECUTION. RoutePoint's own columns (checkpoint_required,
--    checkpoint_type, planned_offset_minutes) are NEVER modified by
--    this migration or by the application code built on top of it.
--  - TransportOperation is a thin "this departure is now being
--    operated" marker: one row per ScheduledDeparture at most
--    (UNIQUE(agency_id, departure_id)), so OperationCheckpoint rows
--    have a stable join point without adding planned-vs-executed
--    columns directly onto scheduled_departures.
--  - OperationCheckpoint is generated (one row per monitored
--    RoutePoint, i.e. checkpoint_required = true) when a
--    TransportOperation is created for a departure. RoutePoints with
--    checkpoint_required = false generate no row -- no obligation.
--  - checkpoint_type is SNAPSHOTTED from the RoutePoint at generation
--    time onto the checkpoint row (reusing the existing CheckpointType
--    enum from 004_route_points.sql, not duplicated). For BOTH, arrival
--    and departure are recorded as two SEPARATE nullable timestamp
--    columns (arrival_checked_at, departure_checked_at) on the SAME
--    row, rather than two separate checkpoint rows: this keeps exactly
--    one row per monitored RoutePoint per operation (matching the
--    generation rule 1:1), avoids inventing a second identity for
--    "the same physical checkpoint", and lets a BOTH-type checkpoint's
--    two confirmations be queried/patched independently without a
--    self-join. ARRIVAL-type checkpoints only ever populate
--    arrival_checked_at; DEPARTURE-type only ever populate
--    departure_checked_at; both are enforced by CHECK constraints
--    below (DB backstop) in addition to app-layer validation.
--  - expected_at (departure_at + planned_offset_minutes) is NOT
--    persisted anywhere in this migration -- it is derived on read by
--    the application layer, same anti-duplication principle as
--    Offer's derived expiration status. Likewise "delay" (actual -
--    expected) is never a stored column here.
--  - actual timestamps (arrival_checked_at/departure_checked_at) are
--    real columns, written only by a server-side confirmation action
--    (`now()`), never client-supplied, never pre-filled/defaulted.
--  - This version supports the departure's product's OUTBOUND route
--    only. Return-route operations are explicitly deferred (see
--    brief); route_point_id must belong to the outbound route of the
--    operation's departure's product, enforced at the application
--    layer (not expressible as a portable CHECK across three joined
--    tables), not by this migration's constraints.
--  - Driver/Guide assignment: NOT modeled. No DRIVER/GUIDE UserRole
--    value and no staff-assignment table are introduced (explicit
--    project constraint -- see brief). Confirmation actions are gated
--    by the existing RBAC floor only (AGENT+), enforced entirely in
--    the application layer; nothing here encodes "who is assigned".
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================
-- CheckpointType already exists (created in 004_route_points.sql);
-- reused here unchanged, not redefined.

CREATE TABLE transport_operations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  departure_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT transport_operations_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT transport_operations_departure_tenant_fk
    FOREIGN KEY (agency_id, departure_id) REFERENCES scheduled_departures (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT transport_operations_agency_id_key UNIQUE (agency_id, id),
  -- At most one Operation per Departure (see decision notes above).
  CONSTRAINT transport_operations_agency_departure_key UNIQUE (agency_id, departure_id)
);

CREATE TABLE operation_checkpoints (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  route_point_id TEXT NOT NULL,
  -- Snapshotted from RoutePoint.checkpoint_type at generation time.
  -- Reuses the enum from 004_route_points.sql; not duplicated.
  checkpoint_type "CheckpointType" NOT NULL,
  arrival_checked_at TIMESTAMPTZ,
  departure_checked_at TIMESTAMPTZ,
  notes TEXT,
  -- Optional, manual-entry-only free text (e.g. "Posto Ipiranga BR-101
  -- km 42"). No GPS/geofencing/automatic collection of any kind.
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT operation_checkpoints_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operation_checkpoints_operation_tenant_fk
    FOREIGN KEY (agency_id, operation_id) REFERENCES transport_operations (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operation_checkpoints_route_point_tenant_fk
    FOREIGN KEY (agency_id, route_point_id) REFERENCES route_points (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT operation_checkpoints_agency_id_key UNIQUE (agency_id, id),
  -- Generation creates exactly one checkpoint per monitored RoutePoint
  -- per Operation; this is the DB backstop against a duplicate.
  CONSTRAINT operation_checkpoints_agency_operation_point_key
    UNIQUE (agency_id, operation_id, route_point_id),
  -- DB backstop (app layer also validates for a clean 400): an
  -- ARRIVAL-only checkpoint must never carry a departure confirmation,
  -- and vice versa. BOTH allows either/both independently.
  CONSTRAINT operation_checkpoints_arrival_type_check
    CHECK (arrival_checked_at IS NULL OR checkpoint_type IN ('ARRIVAL', 'BOTH')),
  CONSTRAINT operation_checkpoints_departure_type_check
    CHECK (departure_checked_at IS NULL OR checkpoint_type IN ('DEPARTURE', 'BOTH'))
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX transport_operations_agency_idx ON transport_operations (agency_id);
CREATE INDEX transport_operations_agency_departure_idx
  ON transport_operations (agency_id, departure_id);

CREATE INDEX operation_checkpoints_agency_idx ON operation_checkpoints (agency_id);
CREATE INDEX operation_checkpoints_agency_operation_idx
  ON operation_checkpoints (agency_id, operation_id);
CREATE INDEX operation_checkpoints_agency_route_point_idx
  ON operation_checkpoints (agency_id, route_point_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Same 4-policy-per-table tenant pattern as 002/003/004.
-- current_agency_id() is defined in 002 and reused here unchanged.

ALTER TABLE transport_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_checkpoints ENABLE ROW LEVEL SECURITY;

ALTER TABLE transport_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE operation_checkpoints FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transport_operations_select_tenant ON transport_operations;
DROP POLICY IF EXISTS transport_operations_insert_tenant ON transport_operations;
DROP POLICY IF EXISTS transport_operations_update_tenant ON transport_operations;
DROP POLICY IF EXISTS transport_operations_delete_tenant ON transport_operations;

DROP POLICY IF EXISTS operation_checkpoints_select_tenant ON operation_checkpoints;
DROP POLICY IF EXISTS operation_checkpoints_insert_tenant ON operation_checkpoints;
DROP POLICY IF EXISTS operation_checkpoints_update_tenant ON operation_checkpoints;
DROP POLICY IF EXISTS operation_checkpoints_delete_tenant ON operation_checkpoints;

CREATE POLICY transport_operations_select_tenant ON transport_operations
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY transport_operations_insert_tenant ON transport_operations
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY transport_operations_update_tenant ON transport_operations
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY transport_operations_delete_tenant ON transport_operations
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY operation_checkpoints_select_tenant ON operation_checkpoints
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY operation_checkpoints_insert_tenant ON operation_checkpoints
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY operation_checkpoints_update_tenant ON operation_checkpoints
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY operation_checkpoints_delete_tenant ON operation_checkpoints
  FOR DELETE
  USING (agency_id = current_agency_id());

-- ============================================================
-- RUNTIME ROLE GRANTS
-- ============================================================
-- Grants for transport_operations/operation_checkpoints are added to
-- the test role via a to_regclass-guarded block appended to
-- tests/integration/database/002_prepare_local_roles.sql, keyed off
-- to_regclass('public.transport_operations') IS NOT NULL, matching
-- the pattern used for routes/route_points so domains that only apply
-- 001+002(+003)(+004) are unaffected.
