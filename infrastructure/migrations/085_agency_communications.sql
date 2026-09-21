-- Migration: Agency Communications
-- Purpose: Tenant-scoped communications (banners, notices, campaigns)
--          for agency-to-customer messaging via Customer App.
-- Direction: up

-- ============================================================
-- 1. ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE agency_communication_type AS ENUM ('OFFER', 'NOTICE', 'CAMPAIGN', 'INFORMATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE agency_communication_status AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE agency_communication_placement AS ENUM ('CUSTOMER_APP_HOME', 'CUSTOMER_APP_OFFERS', 'AGENCY_DASHBOARD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. TABELA
-- ============================================================

CREATE TABLE IF NOT EXISTS agency_communications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  type agency_communication_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  cta_label TEXT,
  cta_url TEXT,
  placement agency_communication_placement NOT NULL DEFAULT 'CUSTOMER_APP_HOME',
  display_priority INTEGER NOT NULL DEFAULT 0,
  target_segment_id TEXT,
  visible_from TIMESTAMPTZ,
  visible_until TIMESTAMPTZ,
  status agency_communication_status NOT NULL DEFAULT 'DRAFT',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT agency_communications_agency_fk
    FOREIGN KEY (agency_id) REFERENCES agencies (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT agency_communications_segment_tenant_fk
    FOREIGN KEY (agency_id, target_segment_id)
    REFERENCES customer_segments (agency_id, id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT agency_communications_created_by_fk
    FOREIGN KEY (agency_id, created_by)
    REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT agency_communications_period_chk
    CHECK (visible_from IS NULL OR visible_until IS NULL OR visible_from <= visible_until),
  CONSTRAINT agency_communications_agency_id_key UNIQUE (agency_id, id)
);

-- ============================================================
-- 3. RLS
-- ============================================================

ALTER TABLE agency_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_communications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_communications_select_tenant ON agency_communications;
DROP POLICY IF EXISTS agency_communications_insert_tenant ON agency_communications;
DROP POLICY IF EXISTS agency_communications_update_tenant ON agency_communications;
DROP POLICY IF EXISTS agency_communications_delete_tenant ON agency_communications;

CREATE POLICY agency_communications_select_tenant ON agency_communications
  FOR SELECT USING (agency_id = current_setting('app.current_agency_id')::text);

CREATE POLICY agency_communications_insert_tenant ON agency_communications
  FOR INSERT WITH CHECK (agency_id = current_setting('app.current_agency_id')::text);

CREATE POLICY agency_communications_update_tenant ON agency_communications
  FOR UPDATE USING (agency_id = current_setting('app.current_agency_id')::text);

CREATE POLICY agency_communications_delete_tenant ON agency_communications
  FOR DELETE USING (agency_id = current_setting('app.current_agency_id')::text);

-- ============================================================
-- 4. GRANTS
-- ============================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime_local') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON agency_communications TO travel_app_runtime_local;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'travel_app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON agency_communications TO travel_app_runtime;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- 5. ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS agency_communications_placement_idx
  ON agency_communications (agency_id, placement, status, display_priority DESC);

CREATE INDEX IF NOT EXISTS agency_communications_segment_idx
  ON agency_communications (agency_id, target_segment_id)
  WHERE target_segment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agency_communications_status_idx
  ON agency_communications (agency_id, status, visible_from, visible_until);

-- ============================================================
-- 6. COMENTÁRIOS
-- ============================================================

COMMENT ON TABLE agency_communications IS 'Comunicações da agência (banners, avisos, campanhas) — tenant-scoped';
COMMENT ON COLUMN agency_communications.type IS 'Tipo: OFFER (destaque), NOTICE (aviso), CAMPAIGN (campanha), INFORMATION (info)';
COMMENT ON COLUMN agency_communications.placement IS 'Onde exibir: CUSTOMER_APP_HOME, CUSTOMER_APP_OFFERS, AGENCY_DASHBOARD';
COMMENT ON COLUMN agency_communications.target_segment_id IS 'Segmento-alvo (NULL = todos os clientes do tenant)';
COMMENT ON COLUMN agency_communications.status IS 'DRAFT → SCHEDULED → ACTIVE → EXPIRED → ARCHIVED';
