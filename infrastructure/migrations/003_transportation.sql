-- ============================================================
-- TRANSPORTATION DOMAIN V1
-- Travel Platform
-- ============================================================
-- Adds: Route, TransportProduct, Supplier, ScheduledDeparture.
--
-- Scope decisions (see brief for full detail):
--  - P0-1: Route stops are informational only (free-text `notes`).
--    No operational RouteStop table in this version.
--  - P0-2: Overbooking is not permitted. ScheduledDeparture.capacity
--    is a hard limit enforced by a CHECK constraint.
--  - P1-1/P1-2: Booking is explicitly out of scope. Nothing here
--    creates a Booking table; ScheduledDeparture/TransportProduct are
--    shaped so a future Booking table is not blocked.
--  - P2-1: Commission table is untouched.
--  - P2-2: TransportProduct.active (administrative state) and
--    TransportProduct.publicly_bookable are independent columns.
--
-- Deferred (documented, not built here):
--  - TransportOperation (planned vs executed). ScheduledDeparture
--    already represents "the plan"; "executed" data has no approved
--    field set or lifecycle, so inventing one now would violate the
--    project's anti-invention rule. Deferred in full.
--  - RouteStop (operational stops table). Deferred per P0-1.
--  - Booking. Explicitly out of scope for this task.
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

-- Decision-backed per P1-1: a round trip is one outbound + one return
-- Route on a single TransportProduct.
CREATE TYPE "TripType" AS ENUM ('ONE_WAY', 'ROUND_TRIP');

-- Decision-backed: the brief's own framing places OWN/SUBCONTRACTED/
-- RESELL on the departure (it can vary per ScheduledDeparture), not
-- fixed irreversibly on Supplier or TransportProduct.
CREATE TYPE "DepartureServiceType" AS ENUM ('OWN', 'SUBCONTRACTED', 'RESELL');

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE routes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  estimated_duration INTEGER,
  distance NUMERIC(10, 2),
  -- Informational only (P0-1). Doubles as a free-text place to note
  -- intermediate stops without a relational RouteStop table.
  notes TEXT,
  -- Plain boolean per the project's anti-invention rule: this is a
  -- two-value active/inactive concept and does not need a dedicated
  -- enum. The existing "Status" enum (ACTIVE/INACTIVE/SUSPENDED) has
  -- a third value with no approved meaning here, so it is not reused.
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT routes_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT routes_estimated_duration_non_negative_check
    CHECK (estimated_duration IS NULL OR estimated_duration >= 0),
  CONSTRAINT routes_distance_non_negative_check
    CHECK (distance IS NULL OR distance >= 0),
  CONSTRAINT routes_agency_id_key UNIQUE (agency_id, id)
);

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  document TEXT,
  contact TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT suppliers_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT suppliers_agency_id_key UNIQUE (agency_id, id)
);

CREATE TABLE transport_products (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trip_type "TripType" NOT NULL,
  outbound_route_id TEXT NOT NULL,
  return_route_id TEXT,
  price NUMERIC(10, 2) NOT NULL,
  -- Administrative state. Independent from publicly_bookable (P2-2).
  active BOOLEAN NOT NULL DEFAULT true,
  -- Independent from `active` (P2-2): a product can be administratively
  -- active but not yet offered for public/e-commerce booking, or vice
  -- versa. Defaults to false: nothing is publicly bookable until an
  -- operator explicitly opts in.
  publicly_bookable BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT transport_products_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT transport_products_outbound_route_tenant_fk
    FOREIGN KEY (agency_id, outbound_route_id) REFERENCES routes (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT transport_products_return_route_tenant_fk
    FOREIGN KEY (agency_id, return_route_id) REFERENCES routes (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT transport_products_price_non_negative_check
    CHECK (price >= 0),
  -- Cross-column CHECK referencing the TripType enum: legitimate SQL,
  -- matches this codebase's existing CHECK-constraint style (see
  -- wishes_date_range_check etc.). Application layer still validates
  -- this at request time for a clean error message; the CHECK is the
  -- database-level backstop.
  CONSTRAINT transport_products_return_route_required_check
    CHECK (
      (trip_type = 'ONE_WAY' AND return_route_id IS NULL)
      OR (trip_type = 'ROUND_TRIP' AND return_route_id IS NOT NULL)
    ),
  CONSTRAINT transport_products_agency_id_key UNIQUE (agency_id, id)
);

CREATE TABLE scheduled_departures (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  departure_at TIMESTAMPTZ NOT NULL,
  arrival_expected_at TIMESTAMPTZ,
  -- Hard capacity limit (P0-2). No overbooking, no override column.
  capacity INTEGER NOT NULL,
  supplier_id TEXT,
  -- Decision-backed enum (see DepartureServiceType above): varies per
  -- departure, so it lives here rather than on Supplier or Product.
  service_type "DepartureServiceType" NOT NULL,
  -- No SCHEDULED/DEPARTED/CANCELLED/COMPLETED lifecycle enum: no
  -- approved decision exists for those values, and inventing one would
  -- violate the anti-invention rule. The single boolean below is added
  -- only because it is mechanically necessary for the "hard capacity
  -- limit" rule to be meaningful once Booking exists: a cancelled
  -- departure must not count toward future availability. It carries no
  -- other workflow meaning and is not a status enum.
  cancelled BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT scheduled_departures_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT scheduled_departures_product_tenant_fk
    FOREIGN KEY (agency_id, product_id) REFERENCES transport_products (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT scheduled_departures_supplier_tenant_fk
    FOREIGN KEY (agency_id, supplier_id) REFERENCES suppliers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT scheduled_departures_capacity_non_negative_check
    CHECK (capacity >= 0),
  CONSTRAINT scheduled_departures_arrival_after_departure_check
    CHECK (arrival_expected_at IS NULL OR arrival_expected_at >= departure_at),
  CONSTRAINT scheduled_departures_agency_id_key UNIQUE (agency_id, id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX routes_agency_idx ON routes (agency_id);
CREATE INDEX routes_agency_active_idx ON routes (agency_id, active);

CREATE INDEX suppliers_agency_idx ON suppliers (agency_id);
CREATE INDEX suppliers_agency_active_idx ON suppliers (agency_id, active);

CREATE INDEX transport_products_agency_idx ON transport_products (agency_id);
CREATE INDEX transport_products_agency_outbound_route_idx
  ON transport_products (agency_id, outbound_route_id);
CREATE INDEX transport_products_agency_return_route_idx
  ON transport_products (agency_id, return_route_id);
CREATE INDEX transport_products_agency_active_idx ON transport_products (agency_id, active);
CREATE INDEX transport_products_agency_publicly_bookable_idx
  ON transport_products (agency_id, publicly_bookable);

CREATE INDEX scheduled_departures_agency_idx ON scheduled_departures (agency_id);
CREATE INDEX scheduled_departures_agency_product_departure_idx
  ON scheduled_departures (agency_id, product_id, departure_at);
CREATE INDEX scheduled_departures_agency_supplier_idx
  ON scheduled_departures (agency_id, supplier_id);
CREATE INDEX scheduled_departures_agency_departure_at_idx
  ON scheduled_departures (agency_id, departure_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Same 4-policy-per-table tenant pattern as 002_rls_policies.sql.
-- current_agency_id() is defined there and reused here unchanged.

ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_departures ENABLE ROW LEVEL SECURITY;

ALTER TABLE routes FORCE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;
ALTER TABLE transport_products FORCE ROW LEVEL SECURITY;
ALTER TABLE scheduled_departures FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS routes_select_tenant ON routes;
DROP POLICY IF EXISTS routes_insert_tenant ON routes;
DROP POLICY IF EXISTS routes_update_tenant ON routes;
DROP POLICY IF EXISTS routes_delete_tenant ON routes;

DROP POLICY IF EXISTS suppliers_select_tenant ON suppliers;
DROP POLICY IF EXISTS suppliers_insert_tenant ON suppliers;
DROP POLICY IF EXISTS suppliers_update_tenant ON suppliers;
DROP POLICY IF EXISTS suppliers_delete_tenant ON suppliers;

DROP POLICY IF EXISTS transport_products_select_tenant ON transport_products;
DROP POLICY IF EXISTS transport_products_insert_tenant ON transport_products;
DROP POLICY IF EXISTS transport_products_update_tenant ON transport_products;
DROP POLICY IF EXISTS transport_products_delete_tenant ON transport_products;

DROP POLICY IF EXISTS scheduled_departures_select_tenant ON scheduled_departures;
DROP POLICY IF EXISTS scheduled_departures_insert_tenant ON scheduled_departures;
DROP POLICY IF EXISTS scheduled_departures_update_tenant ON scheduled_departures;
DROP POLICY IF EXISTS scheduled_departures_delete_tenant ON scheduled_departures;

CREATE POLICY routes_select_tenant ON routes
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY routes_insert_tenant ON routes
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY routes_update_tenant ON routes
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY routes_delete_tenant ON routes
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY suppliers_select_tenant ON suppliers
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY suppliers_insert_tenant ON suppliers
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY suppliers_update_tenant ON suppliers
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY suppliers_delete_tenant ON suppliers
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY transport_products_select_tenant ON transport_products
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY transport_products_insert_tenant ON transport_products
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY transport_products_update_tenant ON transport_products
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY transport_products_delete_tenant ON transport_products
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY scheduled_departures_select_tenant ON scheduled_departures
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY scheduled_departures_insert_tenant ON scheduled_departures
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY scheduled_departures_update_tenant ON scheduled_departures
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY scheduled_departures_delete_tenant ON scheduled_departures
  FOR DELETE
  USING (agency_id = current_agency_id());

-- ============================================================
-- RUNTIME ROLE GRANTS
-- ============================================================
-- Extends the same travel_app_runtime_local grants set up by
-- tests/integration/database/002_prepare_local_roles.sql. In a real
-- deployment this should be folded into whatever grants the
-- production runtime role already has; the local test role is
-- extended separately by
-- tests/integration/database/004_prepare_transport_roles.sql so this
-- migration file stays pure schema/RLS (no side effects on roles that
-- do not exist yet in a fresh apply of 001+002+003 alone).
