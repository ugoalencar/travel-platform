-- ============================================================
-- AGENT AREA GRANTS (Navigable Pilot Flow track, 2026-09-15)
-- ============================================================
-- Requested directly: "eu quero poder definir isso via admin ele sempre
-- vai ser um agent eu defino como admin o que cada agente vai poder
-- fazer" -- role-based access alone (OWNER/ADMIN/MANAGER/AGENT/VIEWER)
-- can't express "this specific AGENT, and no other, can also see
-- Sales/Financial" without promoting them out of AGENT entirely. The
-- existing `permission_restrictions` table (051) only ever NARROWS a
-- role's default access agency-wide -- it can't grant one individual
-- user something their role doesn't already have. This table is the
-- inverse and orthogonal: a per-user, per-area GRANT, additive on top
-- of the role floor, never replacing it.
--
-- Areas are a small, curated, hardcoded set (not a generic permission
-- builder) -- exactly the two named directly: SALES and FINANCIAL.
-- SALES needs no backend enforcement change (AGENT's role floor
-- already permits /sales/* -- see routes/sales.ts -- it was only ever
-- hidden from the AGENT sidebar); this table controls that visibility.
-- FINANCIAL genuinely needs a backend exception, wired narrowly into
-- the two read-only overview routes (/financial/dashboard,
-- /financial/summary) that represent "acompanhar o financeiro" --
-- every other financial route (receivables, payables, DRE, reports,
-- mutations) stays MANAGER/ADMIN-only regardless of this grant.
-- ============================================================

CREATE TABLE agent_area_grants (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('SALES', 'FINANCIAL')),
  granted_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT agent_area_grants_user_fk
    FOREIGN KEY (agency_id, user_id) REFERENCES users (agency_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT agent_area_grants_unique UNIQUE (agency_id, user_id, area)
);

CREATE INDEX agent_area_grants_user_idx ON agent_area_grants (agency_id, user_id);

ALTER TABLE agent_area_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_area_grants FORCE ROW LEVEL SECURITY;

CREATE POLICY agent_area_grants_select_tenant ON agent_area_grants
  FOR SELECT USING (agency_id = current_agency_id());
CREATE POLICY agent_area_grants_insert_tenant ON agent_area_grants
  FOR INSERT WITH CHECK (agency_id = current_agency_id());
CREATE POLICY agent_area_grants_delete_tenant ON agent_area_grants
  FOR DELETE USING (agency_id = current_agency_id());

REVOKE ALL ON agent_area_grants FROM PUBLIC;
