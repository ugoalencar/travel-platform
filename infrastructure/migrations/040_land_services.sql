-- Land Operations domain (Wave A / Domain 12 slice: LAND, structural sibling of AIR).
--
-- Models one land service line per row (accommodation night block, transfer,
-- car rental, tour, insurance, cruise, train, bus, guide, ticket, receptive
-- operator service, etc). Grouped by `trip_id`, same traveler-reference
-- approach as `air_services` (customer_id + optional dependent_id).
--
-- `supplier_payment_status` reuses the existing "FinancialObligationStatus"
-- enum, same precedent as air_services.
--
-- The `trips_agency_id_key` UNIQUE(agency_id, id) constraint was already
-- added additively in 039_air_services.sql -- not repeated here.

CREATE TYPE "LandServiceType" AS ENUM (
  'ACCOMMODATION', 'TRANSFER', 'CAR_RENTAL', 'TOUR', 'TRAVEL_INSURANCE',
  'CRUISE', 'TRAIN', 'BUS', 'GUIDE', 'TICKET', 'RECEPTIVE', 'OTHER'
);

CREATE TYPE "LandServiceStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

CREATE TABLE land_services (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  booking_id TEXT,
  supplier_id TEXT,
  customer_id TEXT NOT NULL,
  dependent_id TEXT,

  service_type "LandServiceType" NOT NULL DEFAULT 'ACCOMMODATION',
  description TEXT NOT NULL,

  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,

  cost NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sale_value NUMERIC(10, 2) NOT NULL DEFAULT 0,
  taxes NUMERIC(10, 2) NOT NULL DEFAULT 0,
  fees NUMERIC(10, 2) NOT NULL DEFAULT 0,
  commission NUMERIC(10, 2),
  currency TEXT NOT NULL DEFAULT 'BRL',

  supplier_due_date DATE,
  supplier_payment_status "FinancialObligationStatus" NOT NULL DEFAULT 'OPEN',
  status "LandServiceStatus" NOT NULL DEFAULT 'PENDING',

  confirmation_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT land_services_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT land_services_trip_tenant_fk
    FOREIGN KEY (agency_id, trip_id) REFERENCES trips (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT land_services_booking_tenant_fk
    FOREIGN KEY (agency_id, booking_id) REFERENCES bookings (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT land_services_supplier_tenant_fk
    FOREIGN KEY (agency_id, supplier_id) REFERENCES suppliers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT land_services_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT land_services_dependent_tenant_fk
    FOREIGN KEY (agency_id, dependent_id) REFERENCES customer_dependents (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT land_services_dates_check
    CHECK (end_date >= start_date),
  CONSTRAINT land_services_values_non_negative_check
    CHECK (cost >= 0 AND sale_value >= 0 AND taxes >= 0 AND fees >= 0
           AND (commission IS NULL OR commission >= 0)),
  CONSTRAINT land_services_quantity_positive_check
    CHECK (quantity > 0),
  CONSTRAINT land_services_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX land_services_agency_idx ON land_services (agency_id);
CREATE INDEX land_services_agency_trip_idx ON land_services (agency_id, trip_id);
CREATE INDEX land_services_agency_customer_idx ON land_services (agency_id, customer_id);
CREATE INDEX land_services_agency_supplier_idx ON land_services (agency_id, supplier_id);
CREATE INDEX land_services_agency_status_idx ON land_services (agency_id, status);

ALTER TABLE land_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE land_services FORCE ROW LEVEL SECURITY;

CREATE POLICY land_services_select_tenant ON land_services
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY land_services_insert_tenant ON land_services
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY land_services_update_tenant ON land_services
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY land_services_delete_tenant ON land_services
  FOR DELETE
  USING (agency_id = current_agency_id());
