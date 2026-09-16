-- ============================================================
-- PESCADOR v2: MULTI-SOURCE TRAVEL SEARCH
-- ============================================================
-- Requested directly: the old Pescador (single-URL capture -> review ->
-- publish) is replaced by a search aggregator. The agent registers
-- reusable "fontes de busca" (search sources -- a URL template with
-- {origin}/{destination}/{departureDate}/{returnDate} placeholders,
-- pointed at wherever they search fares on the internet). Then, for a
-- concrete need, the agent runs a "pesquisa" (search): fills in
-- origin/destination/dates/how many results (1, 5 or 10) and the system
-- queries up to that many registered sources, extracting one real result
-- per source via the same SSRF-guarded fetch+extract pipeline the old
-- capture flow already used (extractOfferFromUrl in pescador.ts) --
-- no fabricated data, and real third-party search APIs can be plugged in
-- per-source later without changing this shape.
--
-- Sources are the reusable part (a small registry, kept until the agent
-- removes one that stopped making sense). Search results are explicitly
-- NOT a repository -- "os valores mudam direto" (fares change
-- constantly) -- so they carry no soft-delete/audit trail and the agent
-- can freely delete them; the only durable outcome is publishing a
-- result into a real `offers` row, mirroring publishCapture's shape.
-- ============================================================

CREATE TABLE pescador_sources (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id    TEXT NOT NULL,
  name         TEXT NOT NULL,
  url_template TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pescador_sources_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT pescador_sources_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX pescador_sources_agency_idx ON pescador_sources (agency_id);

CREATE TABLE pescador_searches (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id          TEXT NOT NULL,
  origin             TEXT,
  destination        TEXT NOT NULL,
  departure_date     DATE NOT NULL,
  return_date        DATE,
  results_limit      SMALLINT NOT NULL,
  created_by_user_id TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pescador_searches_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT pescador_searches_agency_id_key UNIQUE (agency_id, id),
  CONSTRAINT pescador_searches_results_limit_check CHECK (results_limit IN (1, 5, 10)),
  CONSTRAINT pescador_searches_date_range_check
    CHECK (return_date IS NULL OR departure_date <= return_date)
);

CREATE INDEX pescador_searches_agency_idx ON pescador_searches (agency_id, created_at DESC);

CREATE TABLE pescador_search_results (
  id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id          TEXT NOT NULL,
  search_id          TEXT NOT NULL,
  source_id          TEXT,
  -- Snapshot of the source's name at fetch time -- kept even if the
  -- source row is later deleted, so a past result stays legible.
  source_name        TEXT NOT NULL,
  target_url         TEXT NOT NULL,
  title              TEXT,
  description        TEXT,
  price              NUMERIC(12,2),
  currency           TEXT,
  fetch_error        TEXT,
  published_offer_id TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pescador_search_results_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT pescador_search_results_search_tenant_fk
    FOREIGN KEY (agency_id, search_id) REFERENCES pescador_searches (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  -- Deliberately NOT a composite (agency_id, source_id) tenant FK: with
  -- ON DELETE SET NULL, Postgres nulls out every column in a composite FK,
  -- which would try to null agency_id too and fail NOT NULL. A plain
  -- single-column FK on the source's globally-unique id avoids that --
  -- the app always sets source_id from a source already scoped to the
  -- current tenant, so this stays safe in practice.
  CONSTRAINT pescador_search_results_source_fk
    FOREIGN KEY (source_id) REFERENCES pescador_sources (id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX pescador_search_results_search_idx ON pescador_search_results (agency_id, search_id);

ALTER TABLE pescador_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE pescador_sources FORCE ROW LEVEL SECURITY;

CREATE POLICY pescador_sources_select_tenant ON pescador_sources
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY pescador_sources_insert_tenant ON pescador_sources
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY pescador_sources_update_tenant ON pescador_sources
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY pescador_sources_delete_tenant ON pescador_sources
  FOR DELETE USING (agency_id = current_agency_id());

ALTER TABLE pescador_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE pescador_searches FORCE ROW LEVEL SECURITY;

CREATE POLICY pescador_searches_select_tenant ON pescador_searches
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY pescador_searches_insert_tenant ON pescador_searches
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY pescador_searches_delete_tenant ON pescador_searches
  FOR DELETE USING (agency_id = current_agency_id());

ALTER TABLE pescador_search_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE pescador_search_results FORCE ROW LEVEL SECURITY;

CREATE POLICY pescador_search_results_select_tenant ON pescador_search_results
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY pescador_search_results_insert_tenant ON pescador_search_results
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY pescador_search_results_update_tenant ON pescador_search_results
  FOR UPDATE USING (agency_id = current_agency_id()) WITH CHECK (agency_id = current_agency_id());
CREATE POLICY pescador_search_results_delete_tenant ON pescador_search_results
  FOR DELETE USING (agency_id = current_agency_id());

REVOKE ALL ON pescador_sources FROM PUBLIC;
REVOKE ALL ON pescador_searches FROM PUBLIC;
REVOKE ALL ON pescador_search_results FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime_local') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON pescador_sources TO travel_app_runtime_local;
    GRANT SELECT, INSERT, UPDATE, DELETE ON pescador_searches TO travel_app_runtime_local;
    GRANT SELECT, INSERT, UPDATE, DELETE ON pescador_search_results TO travel_app_runtime_local;
  END IF;
END $$;
