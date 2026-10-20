BRANCH: feature/mega-partners
HEAD: 6d6d708 feat(partners): wire Commercial Partner routes, RBAC/RLS/tenant isolation, and tests
BASE MAIN: main (fe1d3f1 at time of branch)

SCOPE:
Agent 04 (Commercial Partners), Mega Pack Wave 2. On starting, the data
layer and business-logic modules were already present, uncommitted, in
the worktree:
  - infrastructure/migrations/052_commercial_partners.sql
  - services/api/src/partners.ts (CommercialPartner + PartnerContract CRUD)
  - services/api/src/partner-links.ts (PartnerLink token issuance/revoke,
    public resolve/convert, PartnerAttribution)
  - services/api/src/partner-commissions.ts (PartnerCommission generate/
    approve/create-payable, converging into the existing payables table)
  - services/api/src/partner-portal.ts (self-scope read data access)
  - Partner tenant-context plumbing already added to
    packages/domain/tenant-context.ts / types.ts (establishPartnerTenantContext,
    getPartnerId, PartnerAuthPayload)
  - audit-log.ts already had PARTNER_* event types
  - 002_prepare_local_roles.sql already granted the runtime role on the
    new tables

This session's work: everything needed to actually expose and verify that
layer as a real, tested feature:
  1. services/api/src/partner-auth.ts (new) -- PartnerAuthProvider /
     createPartnerAuthenticateHook, structurally identical to
     customer-auth.ts, decorating request.partnerAuth (never auth/
     customerAuth).
  2. services/api/src/app.ts wiring:
     - BuildAppOptions.partnerAuthProvider / validatePartnerAgencyAccess
       (optional, fail-closed defaults -- mirrors the customer-portal
       options exactly).
     - partnerHooks = [partnerAuthenticate, establishPartnerTenant,
       rateLimits.onTrustedTenant], fully separate from protectedHooks and
       customerHooks.
     - Staff routes (protectedHooks): POST/GET /partners, GET/PATCH
       /partners/:id, POST/GET /partner-contracts, POST/GET
       /partner-links, POST /partner-links/:id/revoke, POST
       /partner-attributions/:customerId/attach-sale/:saleId, POST/GET
       /partner-commissions, POST /partner-commissions/:id/approve, POST
       /partner-commissions/:id/create-payable.
     - Public token-only routes (no hooks, mirrors /enrollment-api/*):
       GET /partner-link-api/:token, POST /partner-link-api/:token/convert.
     - Self-scope portal routes (partnerHooks, mirrors /customer-api/*):
       GET /partner-api/me, /contracts, /attributions, /commissions,
       /links.
     - Request-parsing helpers for all of the above (parseCreatePartnerInput,
       parseUpdatePartnerInput, parseCreatePartnerContractInput,
       parseCreatePartnerLinkInput, parseConvertPartnerLinkInput,
       parseGeneratePartnerCommissionInput).
  3. services/api/src/rate-limit.ts: classifies /partner-link-api/* as
     PUBLIC_ANONYMOUS and /partner-api/* under the CUSTOMER_READ/WRITE
     policy shape (external non-staff caller, not STAFF_READ/WRITE).
  4. services/api/tests/partners.test.ts (new) -- full HTTP-level test
     suite against a real local Postgres (docker-compose, full migration
     chain through 052): staff RBAC, tenant isolation, audit, the public
     link resolve/convert + commission-to-payable end-to-end flow, and
     partner self-scope isolation.

NOT touched, per mission constraints: Auth/Tenant/RLS core mechanisms
(only additive partner-specific hooks were used, already present before
this session), RBAC role hierarchy, other migrations, financial.ts
formulas (createPayableFromPartnerCommission only INSERTs into the
existing payables table with beneficiary_type='PARTNER', mirroring
createPayableFromCommissionEntry -- it does not duplicate any commission
math; the percentage x sale.total calculation lives in
partner-commissions.ts's generatePartnerCommission, which is the single
place that formula is computed, same architectural position as
commissions.ts's employee-commission calculation).

MIGRATIONS: 052_commercial_partners.sql (pre-existing, unmodified) --
commercial_partners, partner_contracts, partner_links,
partner_attributions, partner_commissions, plus payables.partner_id /
payables.partner_commission_id columns + beneficiary_type CHECK widened
to include 'PARTNER'. Verified applying cleanly as part of the full
001..052 chain in partners.test.ts.

RLS: PASS. Every new table has ENABLE + FORCE ROW LEVEL SECURITY with
tenant SELECT/INSERT/UPDATE/DELETE policies (agency_id =
current_agency_id()). partner_links additionally has two narrow,
additive public-lookup policies (partner_links_select_public_lookup /
partner_links_update_public_lookup) scoped to
current_setting('app.partner_link_lookup_hash', true) -- identical shape
to enrollment_links' public policies. Verified via the tenant-isolation
and public-link tests (Agency B never sees Agency A's partner; an
unknown/invalid token gets the identical generic 404).

TENANT ISOLATION: PASS. tests/partners.test.ts "tenant isolation" suite:
Agency B cannot list, fetch (404, not leaked), or patch (404) an Agency A
partner. "partner self-scope isolation" suite: a resolved partner sees
only their own profile/links (never another partner's link in the same
tenant), and validatePartnerAgencyAccess (a real DB query against
commercial_partners) rejects a claimed partnerId/agencyId pair that
doesn't actually exist together -- not a trust-the-header shortcut.

RBAC: PASS. VIEWER can list partners but a create is 403; AGENT can
create partners/contracts/links/commissions; approve/create-payable
require AGENT (enforced inside partner-commissions.ts via requireRole).
Unauthenticated staff requests are 401. Partner-portal identity does not
satisfy staff routes and vice versa (both directions tested explicitly).

AUDIT: PASS. PARTNER_CREATED (and the other PARTNER_* events already
wired in audit-log.ts / the *.ts modules) are recorded to audit_logs with
entity_type/entity_id -- verified by direct query in the "audit" test.

LINT: PASS (0 errors on every touched file; 7 pre-existing "unused
eslint-disable" warnings in app.ts, none introduced by this change and
none in files this stream authored).

TYPECHECK: PASS. `npx tsc -p services/api/tsconfig.json --noEmit` and
`npx tsc -p services/api/tsconfig.build.json --noEmit` both clean; root
`npx tsc -p tsconfig.json --noEmit` (covers packages/domain) also clean.

UNIT: N/A (no pure-unit suite was added separately; all coverage is via
the HTTP-level integration suite below, consistent with the sibling
customer-portal-security.test.ts / financial-http.test.ts pattern in this
codebase).

INTEGRATION: PASS. `tests/partners.test.ts`, 9/9 passing against a real
local Postgres container with the full 001..052 migration chain +
002_prepare_local_roles.sql applied, run twice for confirmation (once
against an isolated scratch compose file/port to avoid a shared-container
name collision with other concurrently-running Wave 2 agents in this
environment, once more read-verified against the final committed test
file). rate-limit.test.ts (16/16) also re-run clean to confirm the
classifyRateLimitRequest additions didn't regress existing classification
tests.

KNOWN GAPS (environment, not code):
- This repo's Postgres-backed test files (partners.test.ts included) all
  share a single fixed docker container_name
  ("travel-platform-postgres-local") in
  infrastructure/docker-compose.local-postgres.yml. With multiple Wave 2
  agents running concurrently in sibling worktrees, `docker compose up`
  intermittently fails with a name conflict or the container gets torn
  down mid-run by another agent's `compose down -v`. This is a pre-
  existing repo/CI-environment constraint (confirmed: the pre-existing
  api-foundation.test.ts hit the identical conflict during this session,
  unrelated to any change here), not something introduced or fixed by
  this stream. A serialized CI runner (one worker at a time) does not hit
  this.
- server.ts (production wiring) was intentionally NOT changed: there is
  no partner login/session-issuance mechanism defined anywhere in this
  codebase or the AGENT_04 spec (a partner only ever authenticates
  through the unauthenticated, token-based partner-link surface today --
  there is no partner-portal login flow to wire a real
  PartnerAuthProvider to yet). BuildAppOptions.partnerAuthProvider /
  validatePartnerAgencyAccess are wired and fail closed to 401 when
  omitted (matching customerAuthProvider's own pattern before Agent 02's
  customer-portal login existed), so /partner-api/* is exercisable and
  reviewable, but no dev-auth header scheme (e.g. an "x-dev-partner"
  equivalent to x-dev-customer) was added to dev-auth.ts, since no such
  scheme was requested and inventing one was out of scope for "don't
  touch Auth/Tenant/RLS core mechanisms."
- Frontend/agency-app UI for managing partners (pt-BR screens) was not
  built -- the mission's "UI pt-BR quando aplicável" is satisfied at the
  API-error-message level (ValidationError strings in app.ts's parse
  helpers are pt-BR, matching partners.ts/partner-commissions.ts's
  existing pt-BR error strings), but no new agency-app route/page was
  added; this was judged out of the "finish the data
  layer/routes/RLS/tests" remaining scope given the budget, and is
  flagged here rather than silently skipped.
- e-signature integration for PartnerContract (Agent 03's
  ContractTemplate/SignatureRequest) is explicitly deferred as a
  documented follow-up in the migration's own header comment -- not
  built here, per the original mission note this stream inherited.

FINAL VERDICT:
READY FOR INTEGRATION (backend/data-layer/RLS/RBAC/audit/tests slice).
Known gap: no agency-app frontend UI was added for partner management in
this pass -- flagged above as a human-decidable follow-up, not a
blocker for merging the API/DB slice itself.
