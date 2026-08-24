-- ============================================================
-- CONFIGURABLE MULTI-PIPELINE
-- Travel Platform
-- ============================================================
-- Replaces the single fixed CommercialStage enum on
-- commercial_opportunities with an agency-configurable set of
-- Pipelines, each with its own ordered PipelineStages.
--
-- DATA SAFETY: this migration NEVER loses a row. It:
--   1. Creates pipelines / pipeline_stages / pipeline_access tables.
--   2. Adds commercial_opportunities.pipeline_id / stage_id as NULLABLE.
--   3. For every agency, creates a default "Comercial" pipeline with 9
--      stages that map 1:1 to the 9 old CommercialStage enum values.
--   4. Backfills every existing commercial_opportunities row's new
--      pipeline_id/stage_id from its old `stage` value, scoped per-agency.
--   5. Only THEN alters pipeline_id/stage_id to NOT NULL and adds the FKs.
--   6. Keeps the old `stage` column as a deprecated, unused, read-only
--      artifact rather than dropping it -- the safer of the two options
--      allowed by the brief, since dropping a column is irreversible and
--      the column costs nothing to keep. It is never written to by any
--      route after this migration.
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE "PipelineStageColor" AS ENUM (
  'NEUTRAL',
  'BLUE',
  'YELLOW',
  'ORANGE',
  'RED',
  'GREEN',
  'PURPLE'
);

CREATE TYPE "PipelineStageVisualLevel" AS ENUM (
  'NORMAL',
  'ATTENTION',
  'SUCCESS'
);

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE pipelines (
  id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id              TEXT NOT NULL,
  name                   TEXT NOT NULL,
  description            TEXT,
  active                 BOOLEAN NOT NULL DEFAULT true,
  notifications_enabled  BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pipelines_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT pipelines_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX pipelines_agency_idx ON pipelines (agency_id);
CREATE INDEX pipelines_agency_active_idx ON pipelines (agency_id, active);

CREATE TABLE pipeline_stages (
  id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id              TEXT NOT NULL,
  pipeline_id            TEXT NOT NULL,
  name                   TEXT NOT NULL,
  sequence               INTEGER NOT NULL,
  color_key            "PipelineStageColor" NOT NULL,
  visual_level           "PipelineStageVisualLevel" NOT NULL DEFAULT 'NORMAL',
  active                 BOOLEAN NOT NULL DEFAULT true,
  notifications_enabled  BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pipeline_stages_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT pipeline_stages_pipeline_tenant_fk
    FOREIGN KEY (agency_id, pipeline_id) REFERENCES pipelines (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT pipeline_stages_agency_id_key UNIQUE (agency_id, id)
);

CREATE INDEX pipeline_stages_agency_pipeline_sequence_idx
  ON pipeline_stages (agency_id, pipeline_id, sequence);

CREATE TABLE pipeline_access (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id   TEXT NOT NULL,
  pipeline_id TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pipeline_access_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT pipeline_access_pipeline_tenant_fk
    FOREIGN KEY (agency_id, pipeline_id) REFERENCES pipelines (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT pipeline_access_user_tenant_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT pipeline_access_agency_pipeline_user_key UNIQUE (agency_id, pipeline_id, user_id)
);

CREATE INDEX pipeline_access_agency_user_idx ON pipeline_access (agency_id, user_id);

-- ============================================================
-- ADD NULLABLE COLUMNS TO commercial_opportunities (step 2)
-- ============================================================

ALTER TABLE commercial_opportunities ADD COLUMN pipeline_id TEXT;
ALTER TABLE commercial_opportunities ADD COLUMN stage_id TEXT;

-- ============================================================
-- DEFAULT "Comercial" PIPELINE + 9 STAGES PER AGENCY (step 3)
-- One default pipeline per agency (every agency gets one, not just
-- agencies with existing opportunities -- simplest safe option per the
-- brief, and needed so every agency has somewhere to create new
-- opportunities post-migration).
-- ============================================================

INSERT INTO pipelines (id, agency_id, name, description, active)
SELECT gen_random_uuid()::TEXT, a.id, 'Comercial',
       'Pipeline padrao criado automaticamente na migracao para pipelines configuraveis.',
       true
FROM agencies a;

-- Stage mapping: exact 1:1 order/name preservation of the old
-- CommercialStage enum, sequence 1-9, sensible default colors/levels.
INSERT INTO pipeline_stages (id, agency_id, pipeline_id, name, sequence, color_key, visual_level, active)
SELECT gen_random_uuid()::TEXT, p.agency_id, p.id, stage_def.name, stage_def.sequence,
       stage_def.color_key::"PipelineStageColor", stage_def.visual_level::"PipelineStageVisualLevel", true
FROM pipelines p
JOIN LATERAL (
  VALUES
    ('PROSPECTING',      1, 'NEUTRAL', 'NORMAL'),
    ('INTEREST',         2, 'BLUE',    'NORMAL'),
    ('QUOTE',            3, 'BLUE',    'NORMAL'),
    ('PROPOSAL_SENT',    4, 'YELLOW',  'NORMAL'),
    ('WAITING_CUSTOMER', 5, 'YELLOW',  'ATTENTION'),
    ('NEGOTIATION',      6, 'ORANGE',  'ATTENTION'),
    ('WON',              7, 'GREEN',  'SUCCESS'),
    ('POST_SALE',        8, 'PURPLE',  'NORMAL'),
    ('LOST',             9, 'RED',     'ATTENTION')
) AS stage_def(name, sequence, color_key, visual_level) ON true
WHERE p.name = 'Comercial';

-- ============================================================
-- BACKFILL commercial_opportunities.pipeline_id/stage_id (step 4)
-- Scoped per-agency: the default pipeline is per-agency, not global.
-- ============================================================

UPDATE commercial_opportunities co
SET pipeline_id = ps.pipeline_id,
    stage_id    = ps.id
FROM pipeline_stages ps
JOIN pipelines p ON p.agency_id = ps.agency_id AND p.id = ps.pipeline_id
WHERE ps.agency_id = co.agency_id
  AND p.name = 'Comercial'
  AND ps.name = co.stage::TEXT;

-- ============================================================
-- VERIFY BACKFILL COMPLETE BEFORE ENFORCING NOT NULL (step 5)
-- Aborts the whole migration transaction if any row was missed, so this
-- never silently ships a NULL pipeline_id/stage_id.
-- ============================================================

DO $$
DECLARE
  missing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM commercial_opportunities
  WHERE pipeline_id IS NULL OR stage_id IS NULL;

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'Migration 008 backfill incomplete: % commercial_opportunities row(s) have no pipeline_id/stage_id',
      missing_count;
  END IF;
END $$;

ALTER TABLE commercial_opportunities ALTER COLUMN pipeline_id SET NOT NULL;
ALTER TABLE commercial_opportunities ALTER COLUMN stage_id SET NOT NULL;

ALTER TABLE commercial_opportunities
  ADD CONSTRAINT commercial_opportunities_pipeline_tenant_fk
  FOREIGN KEY (agency_id, pipeline_id) REFERENCES pipelines (agency_id, id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE commercial_opportunities
  ADD CONSTRAINT commercial_opportunities_stage_tenant_fk
  FOREIGN KEY (agency_id, stage_id) REFERENCES pipeline_stages (agency_id, id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX commercial_opportunities_agency_pipeline_idx
  ON commercial_opportunities (agency_id, pipeline_id);
CREATE INDEX commercial_opportunities_agency_stage_id_idx
  ON commercial_opportunities (agency_id, stage_id);

-- ============================================================
-- RLS (mirrors 002_rls_policies.sql's 4-policy-per-table pattern exactly)
-- ============================================================

ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_access ENABLE ROW LEVEL SECURITY;

ALTER TABLE pipelines FORCE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages FORCE ROW LEVEL SECURITY;
ALTER TABLE pipeline_access FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipelines_select_tenant ON pipelines;
DROP POLICY IF EXISTS pipelines_insert_tenant ON pipelines;
DROP POLICY IF EXISTS pipelines_update_tenant ON pipelines;
DROP POLICY IF EXISTS pipelines_delete_tenant ON pipelines;

DROP POLICY IF EXISTS pipeline_stages_select_tenant ON pipeline_stages;
DROP POLICY IF EXISTS pipeline_stages_insert_tenant ON pipeline_stages;
DROP POLICY IF EXISTS pipeline_stages_update_tenant ON pipeline_stages;
DROP POLICY IF EXISTS pipeline_stages_delete_tenant ON pipeline_stages;

DROP POLICY IF EXISTS pipeline_access_select_tenant ON pipeline_access;
DROP POLICY IF EXISTS pipeline_access_insert_tenant ON pipeline_access;
DROP POLICY IF EXISTS pipeline_access_update_tenant ON pipeline_access;
DROP POLICY IF EXISTS pipeline_access_delete_tenant ON pipeline_access;

CREATE POLICY pipelines_select_tenant ON pipelines
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY pipelines_insert_tenant ON pipelines
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY pipelines_update_tenant ON pipelines
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY pipelines_delete_tenant ON pipelines
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY pipeline_stages_select_tenant ON pipeline_stages
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY pipeline_stages_insert_tenant ON pipeline_stages
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY pipeline_stages_update_tenant ON pipeline_stages
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY pipeline_stages_delete_tenant ON pipeline_stages
  FOR DELETE
  USING (agency_id = current_agency_id());

CREATE POLICY pipeline_access_select_tenant ON pipeline_access
  FOR SELECT
  USING (agency_id = current_agency_id());

CREATE POLICY pipeline_access_insert_tenant ON pipeline_access
  FOR INSERT
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY pipeline_access_update_tenant ON pipeline_access
  FOR UPDATE
  USING (agency_id = current_agency_id())
  WITH CHECK (agency_id = current_agency_id());

CREATE POLICY pipeline_access_delete_tenant ON pipeline_access
  FOR DELETE
  USING (agency_id = current_agency_id());
