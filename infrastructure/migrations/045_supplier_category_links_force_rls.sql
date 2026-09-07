-- ============================================================
-- SUPPLIER_CATEGORY_LINKS: add missing FORCE ROW LEVEL SECURITY
-- Final integration audit fix (P1)
-- ============================================================
-- 038_supplier_extended.sql enabled RLS on supplier_category_links with
-- the standard 4-policy tenant pattern but omitted FORCE ROW LEVEL
-- SECURITY -- every other new tenant-owned table in this wave
-- (air_services, land_services, cost_centers, commission_plans,
-- employees, commission_entries, employee_deductions, payroll_entries)
-- has both ENABLE and FORCE. Without FORCE, the table owner (and any
-- role with BYPASSRLS or table ownership) would bypass the tenant
-- policies -- inconsistent with the rest of the wave's RLS posture.
-- Purely additive/corrective; no data or policy logic changes.
-- ============================================================

ALTER TABLE supplier_category_links FORCE ROW LEVEL SECURITY;
