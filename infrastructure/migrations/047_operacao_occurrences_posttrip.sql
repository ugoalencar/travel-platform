-- ============================================================
-- OPERAÇÃO: Ocorrências (trip-level incidents) and Pós-viagem
-- (post-trip checklist).
-- ============================================================
-- Minimal, tenant-scoped domains closing two Operação sidebar navigation
-- gaps (see docs/travel_platform_visual_functional_blueprint). Deliberately
-- small: no SLA tracking, no assignment workflow, no notifications -- just
-- enough structure to record and list real operational events.
-- ============================================================

-- PART 1: Ocorrências (trip operational incidents). Distinct from Platform
-- Admin's SaaS-level "Incidentes" domain -- this is agency-scoped trip/booking
-- operational tracking (delays, complaints, document problems, etc).
CREATE TYPE "TripOccurrenceType" AS ENUM (
  'ATRASO',
  'CANCELAMENTO',
  'PROBLEMA_DOCUMENTO',
  'RECLAMACAO',
  'OUTRO'
);

CREATE TYPE "TripOccurrenceSeverity" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');

CREATE TYPE "TripOccurrenceStatus" AS ENUM ('ABERTA', 'EM_ANDAMENTO', 'RESOLVIDA');

CREATE TABLE trip_occurrences (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  booking_id TEXT,
  type "TripOccurrenceType" NOT NULL,
  description TEXT NOT NULL,
  severity "TripOccurrenceSeverity" NOT NULL DEFAULT 'MEDIA',
  status "TripOccurrenceStatus" NOT NULL DEFAULT 'ABERTA',
  reported_by TEXT NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT trip_occurrences_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT trip_occurrences_trip_tenant_fk
    FOREIGN KEY (agency_id, trip_id) REFERENCES trips (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT trip_occurrences_reported_by_tenant_fk
    FOREIGN KEY (agency_id, reported_by) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT trip_occurrences_resolved_at_check
    CHECK (status <> 'RESOLVIDA' OR resolved_at IS NOT NULL)
);

-- trips_agency_id_key UNIQUE(agency_id, id) already exists (see
-- 039_air_services.sql), and users_agency_id_key already exists (see
-- 001_initial_schema.sql) -- both composite FKs above can reference them
-- directly.

CREATE INDEX trip_occurrences_agency_trip_idx ON trip_occurrences (agency_id, trip_id);
CREATE INDEX trip_occurrences_agency_status_idx ON trip_occurrences (agency_id, status);

ALTER TABLE trip_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_occurrences FORCE ROW LEVEL SECURITY;

CREATE POLICY trip_occurrences_select_tenant ON trip_occurrences
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY trip_occurrences_insert_tenant ON trip_occurrences
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY trip_occurrences_update_tenant ON trip_occurrences
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY trip_occurrences_delete_tenant ON trip_occurrences
  FOR DELETE
  USING (agency_id = current_agency_id());

-- PART 2: Pós-viagem checklist. One row per (trip, fixed checklist item).
-- Modeled as a table (not a JSON column on trips) so each item keeps its own
-- done/done_at/notes without read-modify-write races on a shared JSON blob.
CREATE TYPE "PostTripChecklistItem" AS ENUM (
  'SATISFACAO_ENVIADA',
  'AVALIACAO_RECEBIDA',
  'DOCUMENTOS_DEVOLVIDOS',
  'PROXIMA_OFERTA_SUGERIDA'
);

CREATE TABLE post_trip_checklist (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  item_key "PostTripChecklistItem" NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  done_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT post_trip_checklist_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT post_trip_checklist_trip_tenant_fk
    FOREIGN KEY (agency_id, trip_id) REFERENCES trips (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT post_trip_checklist_done_at_check
    CHECK (done = false OR done_at IS NOT NULL),
  CONSTRAINT post_trip_checklist_trip_item_key UNIQUE (agency_id, trip_id, item_key)
);

CREATE INDEX post_trip_checklist_agency_trip_idx ON post_trip_checklist (agency_id, trip_id);

ALTER TABLE post_trip_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_trip_checklist FORCE ROW LEVEL SECURITY;

CREATE POLICY post_trip_checklist_select_tenant ON post_trip_checklist
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY post_trip_checklist_insert_tenant ON post_trip_checklist
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY post_trip_checklist_update_tenant ON post_trip_checklist
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY post_trip_checklist_delete_tenant ON post_trip_checklist
  FOR DELETE
  USING (agency_id = current_agency_id());
