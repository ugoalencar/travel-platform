-- Air Operations domain (Wave A / Domain 12 slice: AIR only, Land is a later wave).
--
-- Models one flight SEGMENT per row. A single air "booking" (e.g. an outbound +
-- return round trip, or a multi-leg connection) is multiple `air_services` rows
-- sharing the same `trip_id`; `direction`/`sequence` order the segments that
-- belong together. No separate parent "air booking" wrapper table is introduced --
-- trip_id + direction + sequence is sufficient to group segments correctly without
-- inventing an extra entity.
--
-- `supplier_payment_status` reuses the existing "FinancialObligationStatus" enum
-- (OPEN/PARTIALLY_PAID/PAID/CANCELLED) from 010_financial_foundation.sql rather
-- than inventing a parallel status vocabulary, per the Payables precedent.
--
-- `booking_id` is a nullable FK into the Transportation domain's `bookings` table
-- (005_booking.sql). That table models bus/transport reservations tied to
-- scheduled_departures; it is unrelated to air segments in almost every real case,
-- but the column is kept nullable/optional per spec in case a future flow wants to
-- link an air segment to a transport booking record. It is not populated by seed
-- data this pass.

-- `trips` (001_initial_schema.sql) only has a UNIQUE(agency_id, sale_id)
-- constraint, not the (agency_id, id) pair every other tenant-scoped FK
-- target in this codebase carries. Add it here, additively, so
-- air_services can FK to (agency_id, trip_id) like every other
-- tenant-scoped relation.
ALTER TABLE trips ADD CONSTRAINT trips_agency_id_key UNIQUE (agency_id, id);

CREATE TYPE "AirCabinClass" AS ENUM ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST');

CREATE TYPE "AirServiceStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

CREATE TYPE "AirSegmentDirection" AS ENUM ('OUTBOUND', 'RETURN', 'INTERNAL');

CREATE TABLE air_services (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  booking_id TEXT,
  supplier_id TEXT,
  customer_id TEXT NOT NULL,
  dependent_id TEXT,

  airline TEXT NOT NULL,
  consolidator TEXT,

  direction "AirSegmentDirection" NOT NULL DEFAULT 'OUTBOUND',
  sequence INTEGER NOT NULL DEFAULT 1,

  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  departure_date DATE NOT NULL,
  departure_time TEXT,
  arrival_date DATE NOT NULL,
  arrival_time TEXT,
  flight_number TEXT,
  cabin_class "AirCabinClass" NOT NULL DEFAULT 'ECONOMY',

  booking_locator TEXT,
  ticket_number TEXT,
  baggage TEXT,
  seat TEXT,

  fare NUMERIC(10, 2) NOT NULL DEFAULT 0,
  taxes NUMERIC(10, 2) NOT NULL DEFAULT 0,
  fees NUMERIC(10, 2) NOT NULL DEFAULT 0,
  commission NUMERIC(10, 2),
  cost NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sale_value NUMERIC(10, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',

  supplier_due_date DATE,
  supplier_payment_status "FinancialObligationStatus" NOT NULL DEFAULT 'OPEN',
  status "AirServiceStatus" NOT NULL DEFAULT 'PENDING',

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT air_services_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT air_services_trip_tenant_fk
    FOREIGN KEY (agency_id, trip_id) REFERENCES trips (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT air_services_booking_tenant_fk
    FOREIGN KEY (agency_id, booking_id) REFERENCES bookings (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT air_services_supplier_tenant_fk
    FOREIGN KEY (agency_id, supplier_id) REFERENCES suppliers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT air_services_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT air_services_dependent_tenant_fk
    FOREIGN KEY (agency_id, dependent_id) REFERENCES customer_dependents (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT air_services_dates_check
    CHECK (arrival_date >= departure_date),
  CONSTRAINT air_services_values_non_negative_check
    CHECK (fare >= 0 AND taxes >= 0 AND fees >= 0 AND cost >= 0 AND sale_value >= 0
           AND (commission IS NULL OR commission >= 0)),
  CONSTRAINT air_services_sequence_positive_check
    CHECK (sequence > 0),
  CONSTRAINT air_services_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX air_services_agency_idx ON air_services (agency_id);
CREATE INDEX air_services_agency_trip_idx ON air_services (agency_id, trip_id);
CREATE INDEX air_services_agency_customer_idx ON air_services (agency_id, customer_id);
CREATE INDEX air_services_agency_supplier_idx ON air_services (agency_id, supplier_id);
CREATE INDEX air_services_agency_status_idx ON air_services (agency_id, status);

ALTER TABLE air_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE air_services FORCE ROW LEVEL SECURITY;

CREATE POLICY air_services_select_tenant ON air_services
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY air_services_insert_tenant ON air_services
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY air_services_update_tenant ON air_services
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY air_services_delete_tenant ON air_services
  FOR DELETE
  USING (agency_id = current_agency_id());
