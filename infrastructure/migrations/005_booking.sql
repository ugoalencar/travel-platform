-- ============================================================
-- BOOKING DOMAIN V1
-- Travel Platform
-- ============================================================
-- Adds: Booking, BookingPassenger.
--
-- Scope decisions (see brief for full detail):
--  - Overbooking is forbidden (carried over from Transportation P0-2):
--    reserved passengers must never exceed a ScheduledDeparture's
--    capacity. This is enforced at the application-transaction level
--    (SELECT ... FOR UPDATE on scheduled_departures, then a COUNT
--    against non-cancelled bookings, inside the same transaction as
--    the INSERT) -- see services/api/src/bookings.ts. It is NOT
--    expressible as a single-row DB CHECK constraint because it is an
--    aggregate across rows in another table.
--  - Round trip: a Booking relates to BOTH an outbound and (optional)
--    return ScheduledDeparture as real FK relations, reusing the
--    existing TripType enum from Transportation (no duplicate enum).
--  - Multi-passenger: BookingPassenger is a child table, not a single
--    passenger-count integer.
--  - Booker vs Passenger: bookerCustomerId is a required tenant-safe
--    FK to customers (who owns the reservation). BookingPassenger is
--    NOT a Customer and does not FK to customers -- it stores minimal
--    identity (name only) per the explicit instruction not to
--    over-model passenger documentation.
--  - Booking is NOT a Sale: no price/discount/tax/currency/payment
--    columns are added here. Sale (not present in this branch) will
--    own pricing when that integration happens later.
--  - Lifecycle: no approved state machine exists. A single
--    `cancelled` boolean (mirroring scheduled_departures.cancelled)
--    is the anti-invention-compliant choice: a cancelled Booking
--    simply stops counting toward capacity consumption. No refund/
--    penalty/no-show semantics are attached.
--  - Temporal ordering of return_departure_id vs outbound_departure_id
--    (return must depart after outbound) is validated at the
--    application layer, not as a DB CHECK, because CHECK constraints
--    cannot reference another table's column.
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE bookings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  booker_customer_id TEXT NOT NULL,
  trip_type "TripType" NOT NULL,
  outbound_departure_id TEXT NOT NULL,
  return_departure_id TEXT,
  -- Mechanically necessary for capacity accounting (see header note),
  -- no other business meaning attached. Mirrors
  -- scheduled_departures.cancelled.
  cancelled BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bookings_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT bookings_booker_customer_tenant_fk
    FOREIGN KEY (agency_id, booker_customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT bookings_outbound_departure_tenant_fk
    FOREIGN KEY (agency_id, outbound_departure_id) REFERENCES scheduled_departures (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT bookings_return_departure_tenant_fk
    FOREIGN KEY (agency_id, return_departure_id) REFERENCES scheduled_departures (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Cross-column CHECK matching transport_products_return_route_required_check
  -- (003) / route_points_checkpoint_type_required_check (004) style:
  -- ROUND_TRIP requires a linked return departure, ONE_WAY forbids one.
  CONSTRAINT bookings_return_departure_required_check
    CHECK (
      (trip_type = 'ONE_WAY' AND return_departure_id IS NULL)
      OR (trip_type = 'ROUND_TRIP' AND return_departure_id IS NOT NULL)
    ),
  CONSTRAINT bookings_agency_id_key UNIQUE (agency_id, id)
);

CREATE TABLE booking_passengers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  booking_id TEXT NOT NULL,
  -- Minimal identity only (explicit instruction: do not build a
  -- duplicate Customer-like entity, do not over-model passenger
  -- documentation). Not a FK to customers.
  name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT booking_passengers_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT booking_passengers_booking_tenant_fk
    FOREIGN KEY (agency_id, booking_id) REFERENCES bookings (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT booking_passengers_name_not_blank_check
    CHECK (length(btrim(name)) > 0),
  CONSTRAINT booking_passengers_agency_id_key UNIQUE (agency_id, id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX bookings_agency_idx ON bookings (agency_id);
CREATE INDEX bookings_agency_outbound_departure_idx
  ON bookings (agency_id, outbound_departure_id);
CREATE INDEX bookings_agency_return_departure_idx
  ON bookings (agency_id, return_departure_id);
CREATE INDEX bookings_agency_booker_idx
  ON bookings (agency_id, booker_customer_id);

CREATE INDEX booking_passengers_agency_idx ON booking_passengers (agency_id);
CREATE INDEX booking_passengers_agency_booking_idx
  ON booking_passengers (agency_id, booking_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Same 4-policy-per-table tenant pattern as 002/003/004.
-- current_agency_id() is defined in 002 and reused here unchanged.

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_passengers ENABLE ROW LEVEL SECURITY;

ALTER TABLE bookings FORCE ROW LEVEL SECURITY;
ALTER TABLE booking_passengers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bookings_select_tenant ON bookings;
DROP POLICY IF EXISTS bookings_insert_tenant ON bookings;
DROP POLICY IF EXISTS bookings_update_tenant ON bookings;
DROP POLICY IF EXISTS bookings_delete_tenant ON bookings;

DROP POLICY IF EXISTS booking_passengers_select_tenant ON booking_passengers;
DROP POLICY IF EXISTS booking_passengers_insert_tenant ON booking_passengers;
DROP POLICY IF EXISTS booking_passengers_update_tenant ON booking_passengers;
DROP POLICY IF EXISTS booking_passengers_delete_tenant ON booking_passengers;

CREATE POLICY bookings_select_tenant ON bookings
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY bookings_insert_tenant ON bookings
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY bookings_update_tenant ON bookings
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY bookings_delete_tenant ON bookings
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY booking_passengers_select_tenant ON booking_passengers
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY booking_passengers_insert_tenant ON booking_passengers
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY booking_passengers_update_tenant ON booking_passengers
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY booking_passengers_delete_tenant ON booking_passengers
  FOR DELETE
  USING (agency_id = current_agency_id());

-- ============================================================
-- RUNTIME ROLE GRANTS
-- ============================================================
-- Grants for bookings/booking_passengers are added to the test role
-- via a to_regclass-guarded block appended to
-- tests/integration/database/002_prepare_local_roles.sql, keyed off
-- to_regclass('public.bookings') IS NOT NULL, so domains that only
-- apply earlier migrations are unaffected. This migration file stays
-- pure schema/RLS, matching 003/004's approach.
