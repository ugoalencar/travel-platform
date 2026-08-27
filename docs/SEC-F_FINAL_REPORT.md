SEC-F — AUDIT LOGGING

BASE SHA
efb377cc5741e3acafcd26f589d83529108003bf

HEAD SHA
5b36a33a40fceb917f49a1ef78b32a9b4e1250f5

FILES CHANGED
- docs/03-security/audit-logging.md
- infrastructure/migrations/015_audit_logging.sql
- services/api/src/audit-log.ts
- services/api/src/financial.ts
- services/api/tests/audit-log.test.ts
- services/api/tests/financial.test.ts
- tests/integration/database/002_prepare_local_roles.sql
- tests/integration/database/003_rls_runtime_test.sql
- tests/integration/database/database.integration.test.ts
- docs/SEC-F_FINAL_REPORT.md

AUDIT EVENT MODEL
`audit_logs` stores immutable id/time, trusted tenant, actor type/id, typed
event/entity references, outcome, and allowlisted JSONB metadata.

EVENT TYPES
Typed names cover authentication, MFA, security blocks, administration,
entitlements, payments, booking/proposal/sale lifecycles, and customer profile
updates. Future SEC-B/SEC-D events require no branch imports.

APPEND-ONLY
The table has SELECT and INSERT RLS policies only. Runtime test-role grants
only SELECT and INSERT; UPDATE and DELETE are revoked and database-tested.

TENANT SCOPE
Writes and reads take `agency_id` exclusively from `getTenantContext()`.
RLS/FORCE RLS prevents cross-tenant reads and cross-tenant inserts.

RUNTIME DB PRIVILEGES
The disposable runtime role is explicitly granted SELECT/INSERT only on
`audit_logs`; database integration proves UPDATE/DELETE are denied.

TRANSACTION SEMANTICS
`recordPayment()` awaits the audit insert through the same tenant transaction.
The focused test proves audit insert failure propagates as payment failure.

REDACTION
Metadata is a strict allowlist. Tests prove password/TOTP/recovery/auth/cookie
or token values, full CPF/passport, and request bodies are excluded.

AUTH EVENTS
Typed auth event names are available. This base has no real login/logout
handler or tenant-safe failed-login persistence path to instrument.

ADMIN EVENTS
Typed user, role, agency-settings, and entitlement event names are available;
the base mutation paths were not changed in this stream.

FINANCIAL EVENTS
`PAYMENT_RECORDED` is persisted in the payment transaction with only amount,
currency, method, and direction metadata.

BOOKING/PROPOSAL/SALE EVENTS
Typed lifecycle names are available. Existing booking/proposal/sale mutations
remain uninstrumented pending their owning feature integration work.

READ API
No public audit-read API was added. The internal read service is tenant-scoped,
bounded to 100 rows, and supports an allowlisted event-type filter.

RETENTION/INTEGRITY
Backup inclusion and a separate least-privilege SIEM/export path are
documented. Retention duration and archive/deletion policy remain unapproved.

MIGRATION
015_audit_logging.sql is additive; it creates indexes, a tenant-safe RESTRICT
FK to agencies, JSON shape checks, and no cascading audit-history deletion.

RLS/FORCE RLS
Enabled and forced on `audit_logs`; tested with a non-superuser,
non-BYPASSRLS runtime role.

P0
None.

P1
- Authentication, user/role/settings/entitlement, booking, proposal, sale,
  and customer-profile mutation paths still need event emission integration.
- A retention duration, archival/deletion controls, and production SIEM/export
  role need legal, LGPD, operations, and cost-owner decisions.

P2
- Decide whether a privileged tenant audit-read API is needed, including role,
  pagination/filter surface, and retention-aware export behavior.
- Decide source-IP and user-agent minimization/hashing requirements once the
  production proxy topology is defined.

P3
None.

TESTS
PASS: `npm test --workspace @travel-platform/api -- audit-log.test.ts` (5/5).
PASS: `npm run test:db` (9/9), including audit RLS, cross-tenant denial, and
runtime UPDATE/DELETE denial.
PASS: `npm run test:security` (52/52).
PASS: `npm test --workspace @travel-platform/customer -- --reporter=dot`
(537/537).
BLOCKED: post-assertion rerun of `financial.test.ts` collided with the shared
fixed Docker container name. The prior full run reached the new stored-event
test and failed only because audit history was intentionally retained between
tests; the assertion was corrected to match the created payment id.

DATABASE
PASS: `npm run test:db` (9/9).

LINT
BLOCKED: `npm run lint` fails in pre-existing `services/api/src/app.ts`
unsafe CORS/Helmet type diagnostics, outside SEC-F files. SEC-F-only ESLint
passes.

TYPECHECK
BLOCKED: `npm run typecheck` fails because shared node_modules lacks
`@fastify/cors` and `@fastify/helmet`, producing pre-existing app.ts errors.
SEC-F-only TypeScript checking with repository-compatible bundler resolution
passes.

BUILD
BLOCKED: `npm run build` fails in pre-existing app.ts for the same missing
Fastify CORS/Helmet modules and implicit-any diagnostics. Customer/domain/
creative-engine builds completed.

HUMAN DECISIONS REQUIRED
- Approve retention duration and archival/deletion policy.
- Assign production ownership for an audit SIEM/export role and backup
restoration verification.
- Define the real authentication event integration, especially failed login
events before an agency can be safely resolved.
- Decide a privileged audit-read API and source-IP/user-agent minimization
policy when production proxy topology is known.

FINAL VERDICT
COMPLETE

DO NOT PUSH.
DO NOT OPEN PR.
DO NOT MERGE.
PARE.
