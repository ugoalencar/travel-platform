-- ============================================================
-- EXCURSÕES (GROUP TRIPS)
-- ============================================================
-- Requested directly: "quando uma viagem aérea ou terrestre vai
-- agregar vários clientes para o mesmo destino... o atendente vai só
-- setar os clientes na excursão e assim todos os clientes recebem de
-- uma vez as configurações da viagem ao invés do agente ter que
-- colocar para cada um." Confirmed via research that Trip/AirService/
-- LandService are strictly single-customer-per-row with no existing
-- multi-customer concept, and Booking/ScheduledDeparture (capacity-
-- managed group reservations) use free-text passenger names with no
-- Customer linkage and no frontend -- neither fits this directly, so
-- this is a new, purpose-built fan-out entity: configure the shared
-- trip once, assign customers, and the backend creates one Trip + one
-- AirService/LandService row per assigned customer automatically.
--
-- excursions holds the shared config (destination, dates, and either
-- the air or land fields depending on transport_type -- both sets are
-- nullable since only one applies per row, matching the same "shared
-- config, fanned out per customer" columns AirService/LandService
-- already have individually). excursion_customers is the roster; each
-- row records which Trip/AirService/LandService was generated for that
-- customer so re-applying later can be idempotent per customer.
-- ============================================================

CREATE TYPE "ExcursionTransportType" AS ENUM ('AEREO', 'TERRESTRE');

CREATE TABLE excursions (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id          TEXT NOT NULL,
  name               TEXT NOT NULL,
  destination        TEXT NOT NULL,
  transport_type     "ExcursionTransportType" NOT NULL,
  start_date         DATE NOT NULL,
  end_date           DATE NOT NULL,
  notes              TEXT,

  -- Shared AEREO fields (used when transport_type = 'AEREO')
  airline            TEXT,
  origin             TEXT,
  flight_number      TEXT,
  cabin_class        TEXT,

  -- Shared TERRESTRE fields (used when transport_type = 'TERRESTRE')
  land_description   TEXT,
  land_service_type  TEXT,

  -- Shared commercial fields, applied to every fanned-out service row
  sale_value         NUMERIC(14,2),
  cost               NUMERIC(14,2),
  currency           TEXT NOT NULL DEFAULT 'BRL',

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,

  CONSTRAINT excursions_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT excursions_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT excursions_date_range_check CHECK (start_date <= end_date)
);

CREATE INDEX excursions_agency_idx ON excursions (agency_id) WHERE deleted_at IS NULL;

CREATE TABLE excursion_customers (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id       TEXT NOT NULL,
  excursion_id    TEXT NOT NULL,
  customer_id     TEXT NOT NULL,
  -- Set once the fan-out has created these records for this customer --
  -- nullable so a roster row can exist even if a create step partially
  -- fails, without losing track of who's assigned to the excursion.
  trip_id         TEXT,
  air_service_id  TEXT,
  land_service_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT excursion_customers_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT excursion_customers_excursion_tenant_fk
    FOREIGN KEY (agency_id, excursion_id) REFERENCES excursions (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT excursion_customers_customer_tenant_fk
    FOREIGN KEY (agency_id, customer_id) REFERENCES customers (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT excursion_customers_trip_tenant_fk
    FOREIGN KEY (agency_id, trip_id) REFERENCES trips (agency_id, id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT excursion_customers_unique UNIQUE (agency_id, excursion_id, customer_id)
);

CREATE INDEX excursion_customers_excursion_idx ON excursion_customers (agency_id, excursion_id);

ALTER TABLE excursions ENABLE ROW LEVEL SECURITY;
ALTER TABLE excursions FORCE ROW LEVEL SECURITY;

CREATE POLICY excursions_select_tenant ON excursions
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY excursions_insert_tenant ON excursions
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY excursions_update_tenant ON excursions
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY excursions_delete_tenant ON excursions
  FOR DELETE USING (agency_id = current_agency_id());

ALTER TABLE excursion_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE excursion_customers FORCE ROW LEVEL SECURITY;

CREATE POLICY excursion_customers_select_tenant ON excursion_customers
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY excursion_customers_insert_tenant ON excursion_customers
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY excursion_customers_update_tenant ON excursion_customers
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY excursion_customers_delete_tenant ON excursion_customers
  FOR DELETE USING (agency_id = current_agency_id());

REVOKE ALL ON excursions FROM PUBLIC;
REVOKE ALL ON excursion_customers FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime_local') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON excursions TO travel_app_runtime_local;
    GRANT SELECT, INSERT, UPDATE, DELETE ON excursion_customers TO travel_app_runtime_local;
  END IF;
END $$;
