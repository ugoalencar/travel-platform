-- ============================================================
-- EXCURSÃO TEMPLATES + REUSABLE DEPARTURES
-- ============================================================
-- Requested directly: "uma excursão pode ser usada várias vezes então
-- ela deve ser cadastrada com todas as suas características menos a
-- data porque essa muda na hora de usar a excursão, o agente escolhe a
-- excursão e pode colocar o período." 071_excursions.sql's `excursions`
-- table carried its own start_date/end_date, so every reuse meant
-- creating a whole new excursion row and re-typing every shared field
-- again -- exactly what this feature was supposed to eliminate.
--
-- Splits the single `excursions` table into:
--   - excursions: the reusable TEMPLATE (name, destination, transport
--     type, airline/land details, shared sale/cost) -- no dates.
--   - excursion_departures: one dated USE of a template (start_date,
--     end_date, optional per-use notes) -- an agent picks a template,
--     sets a period, this is what customers actually get assigned to.
-- excursion_customers now hangs off the departure, not the template
-- directly, since the same customer could ride the same excursion
-- template on two different departures.
--
-- Migrates existing data 1:1: every current excursion becomes a
-- template plus exactly one departure carrying its old dates, so
-- nothing already created (or fanned out to a customer) is lost.
-- ============================================================

CREATE TABLE excursion_departures (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id    TEXT NOT NULL,
  excursion_id TEXT NOT NULL,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,

  CONSTRAINT excursion_departures_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT excursion_departures_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT excursion_departures_excursion_tenant_fk
    FOREIGN KEY (agency_id, excursion_id) REFERENCES excursions (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT excursion_departures_date_range_check CHECK (start_date <= end_date)
);

CREATE INDEX excursion_departures_excursion_idx
  ON excursion_departures (agency_id, excursion_id) WHERE deleted_at IS NULL;

-- One departure per existing excursion, carrying forward its dates --
-- keeps every already-fanned-out record (Trip/AirService/LandService)
-- traceable to a departure after excursion_customers is repointed below.
INSERT INTO excursion_departures (agency_id, excursion_id, start_date, end_date, created_at, updated_at)
SELECT agency_id, id, start_date, end_date, created_at, updated_at
FROM excursions;

ALTER TABLE excursion_customers ADD COLUMN excursion_departure_id TEXT;

UPDATE excursion_customers ec
SET excursion_departure_id = ed.id
FROM excursion_departures ed
WHERE ed.excursion_id = ec.excursion_id
  AND ed.agency_id = ec.agency_id;

ALTER TABLE excursion_customers ALTER COLUMN excursion_departure_id SET NOT NULL;

ALTER TABLE excursion_customers ADD CONSTRAINT excursion_customers_departure_tenant_fk
  FOREIGN KEY (agency_id, excursion_departure_id) REFERENCES excursion_departures (agency_id, id)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE excursion_customers DROP CONSTRAINT excursion_customers_excursion_tenant_fk;
ALTER TABLE excursion_customers DROP CONSTRAINT excursion_customers_unique;
ALTER TABLE excursion_customers ADD CONSTRAINT excursion_customers_unique
  UNIQUE (agency_id, excursion_departure_id, customer_id);
ALTER TABLE excursion_customers DROP COLUMN excursion_id;

ALTER TABLE excursions DROP CONSTRAINT excursions_date_range_check;
ALTER TABLE excursions DROP COLUMN start_date;
ALTER TABLE excursions DROP COLUMN end_date;

ALTER TABLE excursion_departures ENABLE ROW LEVEL SECURITY;
ALTER TABLE excursion_departures FORCE ROW LEVEL SECURITY;

CREATE POLICY excursion_departures_select_tenant ON excursion_departures
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY excursion_departures_insert_tenant ON excursion_departures
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY excursion_departures_update_tenant ON excursion_departures
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY excursion_departures_delete_tenant ON excursion_departures
  FOR DELETE USING (agency_id = current_agency_id());

REVOKE ALL ON excursion_departures FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime_local') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON excursion_departures TO travel_app_runtime_local;
  END IF;
END $$;
