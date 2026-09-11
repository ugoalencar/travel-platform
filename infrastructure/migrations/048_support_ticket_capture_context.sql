-- Migration: Support ticket capture context + audited support sessions
-- Purpose: SUPPORT-OBS wave 2 -- let agency staff open a support ticket
-- directly (previously support_cases could only be created by a platform
-- admin via /platform/support), and capture enough context on every
-- ticket for a support agent to correlate it with server logs, per
-- docs/travel_platform_ops_security_pack/support/SUPPORT_CENTER.md
-- ("Ticket deve capturar: agencyId, userId, route, appVersion, buildSha,
-- browser, timestamp, requestId/correlationId").
-- Status: additive only -- migration 036 (support_cases) and 034
-- (support_access_log) are already applied and are never rewritten here.
-- Created: 2026-09-11

-- ============================================================
-- support_cases: agency-originated tickets + capture context
-- ============================================================

-- subscriber_tenant_id was NOT NULL because every case used to be created
-- by a platform admin against a known subscriber tenant. An
-- agency-originated ticket (POST /support/tickets, agency staff auth)
-- instead carries agency_id directly from the authenticated tenant
-- context -- resolving subscriber_tenant_id would require querying the
-- platform-scoped subscriber_tenants table from an agency-scoped (RLS)
-- transaction, which is out of scope for this pass. Both columns are
-- therefore optional, with a check ensuring at least one identifies the
-- tenant.
ALTER TABLE support_cases ALTER COLUMN subscriber_tenant_id DROP NOT NULL;

ALTER TABLE support_cases ADD COLUMN IF NOT EXISTS agency_id TEXT REFERENCES agencies(id) ON DELETE CASCADE;
ALTER TABLE support_cases ADD COLUMN IF NOT EXISTS created_by_user_id TEXT;
ALTER TABLE support_cases ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'PLATFORM';

-- Diagnostic/capture context. route/app_version/build_sha/browser are
-- client-reported and used only for triage -- never trusted for
-- tenant/user identity (agency_id/created_by_user_id come from the
-- server-side authenticated tenant context, not the request body).
ALTER TABLE support_cases ADD COLUMN IF NOT EXISTS route TEXT;
ALTER TABLE support_cases ADD COLUMN IF NOT EXISTS app_version TEXT;
ALTER TABLE support_cases ADD COLUMN IF NOT EXISTS build_sha TEXT;
ALTER TABLE support_cases ADD COLUMN IF NOT EXISTS browser TEXT;
ALTER TABLE support_cases ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE support_cases ADD COLUMN IF NOT EXISTS correlation_id TEXT;

ALTER TABLE support_cases
  ADD CONSTRAINT support_cases_source_check CHECK (source IN ('PLATFORM', 'AGENCY'));

ALTER TABLE support_cases
  ADD CONSTRAINT support_cases_tenant_identified_check
  CHECK (subscriber_tenant_id IS NOT NULL OR agency_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS support_cases_agency_id_idx ON support_cases(agency_id);
CREATE INDEX IF NOT EXISTS support_cases_request_id_idx ON support_cases(request_id);

-- No RLS on support_cases: unchanged from migration 036 -- this table has
-- always been platform-admin-visible-only (accessed exclusively via
-- withPlatformTransaction from services/api/src/platform-services.ts),
-- and the new agency-originated insert path also goes through the
-- platform transaction (see createAgencySupportTicket), scoping by
-- agency_id at the query level rather than via RLS. Not a structural RLS
-- change.

-- ============================================================
-- support_access_log: audited "Support Session" (view-as-tenant)
-- Adds the fields needed to enforce "temporary session, explicit tenant,
-- reason, duration, read-only by default" per
-- docs/travel_platform_ops_security_pack/support/SUPPORT_CENTER.md.
-- The table itself (migration 034) already captures support_user_id,
-- impersonated_tenant_id, reason, access_start/access_end -- this only
-- adds the missing duration/scope fields.
-- ============================================================

ALTER TABLE support_access_log ADD COLUMN IF NOT EXISTS requested_duration_minutes INTEGER NOT NULL DEFAULT 30;
ALTER TABLE support_access_log ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE support_access_log ADD COLUMN IF NOT EXISTS read_only BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS support_access_log_expires_at_idx ON support_access_log(expires_at);

-- Down: Rollback
-- ALTER TABLE support_access_log DROP COLUMN read_only;
-- ALTER TABLE support_access_log DROP COLUMN expires_at;
-- ALTER TABLE support_access_log DROP COLUMN requested_duration_minutes;
-- ALTER TABLE support_cases DROP CONSTRAINT support_cases_tenant_identified_check;
-- ALTER TABLE support_cases DROP CONSTRAINT support_cases_source_check;
-- ALTER TABLE support_cases DROP COLUMN correlation_id;
-- ALTER TABLE support_cases DROP COLUMN request_id;
-- ALTER TABLE support_cases DROP COLUMN browser;
-- ALTER TABLE support_cases DROP COLUMN build_sha;
-- ALTER TABLE support_cases DROP COLUMN app_version;
-- ALTER TABLE support_cases DROP COLUMN route;
-- ALTER TABLE support_cases DROP COLUMN source;
-- ALTER TABLE support_cases DROP COLUMN created_by_user_id;
-- ALTER TABLE support_cases DROP COLUMN agency_id;
-- ALTER TABLE support_cases ALTER COLUMN subscriber_tenant_id SET NOT NULL;
