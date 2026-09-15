-- ============================================================
-- AGENT AREA GRANTS -- PER-MODULE GRANULARITY (Navigable Pilot Flow
-- track, 2026-09-15)
-- ============================================================
-- Requested directly: "preciso de configuração total tipo se eu
-- escolher financeiro devo marcar os módulos que ele tem acesso" --
-- the coarse SALES/FINANCIAL toggle from 064 wasn't granular enough.
-- Widens the same table's `area` column to a full per-module value set
-- (still additive, still a curated hardcoded list -- not a generic
-- permission builder): each Sales/Financial screen the admin already
-- sees in their own sidebar is individually grantable.
--
-- SALES_* modules need no new backend enforcement -- routes/proposals.ts,
-- /bookings (routes/trips.ts), and routes/sales.ts already permit AGENT
-- read access (VIEWER/AGENT role floors), so these three were only ever
-- a sidebar-visibility gap, same as 064's original SALES grant.
-- FINANCIAL_* modules are each wired to their own read-only GET route in
-- routes/financial.ts (services/api/src/area-grants.ts) -- mutations on
-- every module stay MANAGER/ADMIN-only regardless of any grant, matching
-- the "acompanhar" (read-only, accompany) framing this feature started
-- from.
--
-- Order matters here: the old coarse values (SALES / FINANCIAL) must be
-- migrated to the new per-module values BEFORE the new, narrower CHECK
-- constraint is added -- adding a CHECK first validates existing rows
-- immediately and fails while they still hold the old values.
-- ============================================================

ALTER TABLE agent_area_grants DROP CONSTRAINT agent_area_grants_area_check;

-- Old coarse grants (SALES / FINANCIAL) from 064 don't map 1:1 onto the
-- new per-module values -- migrate them to "everything in that area" so
-- nobody silently loses access already granted.
UPDATE agent_area_grants SET area = 'SALES_PROPOSALS' WHERE area = 'SALES';
INSERT INTO agent_area_grants (agency_id, user_id, area, granted_by_user_id)
SELECT agency_id, user_id, 'SALES_BOOKINGS', granted_by_user_id
FROM agent_area_grants WHERE area = 'SALES_PROPOSALS'
ON CONFLICT DO NOTHING;
INSERT INTO agent_area_grants (agency_id, user_id, area, granted_by_user_id)
SELECT agency_id, user_id, 'SALES_SALES', granted_by_user_id
FROM agent_area_grants WHERE area = 'SALES_PROPOSALS'
ON CONFLICT DO NOTHING;

UPDATE agent_area_grants SET area = 'FINANCIAL_OVERVIEW' WHERE area = 'FINANCIAL';

ALTER TABLE agent_area_grants ADD CONSTRAINT agent_area_grants_area_check
  CHECK (area IN (
    'SALES_PROPOSALS', 'SALES_BOOKINGS', 'SALES_SALES',
    'FINANCIAL_OVERVIEW', 'FINANCIAL_RECEIVABLES', 'FINANCIAL_PAYABLES',
    'FINANCIAL_CASH', 'FINANCIAL_RECONCILIATION', 'FINANCIAL_REVENUES',
    'FINANCIAL_EXPENSES', 'FINANCIAL_DRE', 'FINANCIAL_REPORTS'
  ));
