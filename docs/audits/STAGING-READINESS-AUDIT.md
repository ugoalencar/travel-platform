# Staging Readiness Audit

Audit date: 2026-08-25
Branch: `feature/staging-readiness-remediation`
Baseline HEAD: `741e11e4f3e917a557be637f38eb951fbc59bd40`
Scope: Accelerated Batch 03 consolidated audit, P0/P1 remediation, and local staging-readiness verification.

## Executive Verdict

AUDIT PASS: local staging baseline is ready for human review.

This branch remediates the P0/P1 issues that could be fixed without a new product decision. It does not make the system production-ready and does not replace human review, PR approval, environment provisioning, secret configuration, real backup execution, or external staging smoke testing.

## P0/P1 Summary

P0 FOUND: 3
P0 FIXED: 3
P0 REMAINING: 0 for local staging-readiness baseline.

P1 FOUND: 8
P1 FIXED: 5
P1 REMAINING: 3, all requiring human/product/operations decision.

## P0 Findings

1. Database/RLS gate drift: `test:db` still validated only the early migration set and did not cover all current tenant tables.
   Status: FIXED.
   Evidence: database integration test now applies all ordered migrations from `infrastructure/migrations`, validates the current table set, verifies FORCE RLS on every tenant table, and derives grants from the current migrated surface.

2. Staging health model was incomplete: `/health` existed, but no dependency-aware readiness endpoint existed for orchestrators.
   Status: FIXED.
   Evidence: `/readiness` returns 200 only when the configured readiness check succeeds and returns 503 without leaking dependency details on failure.

3. Write-route abuse control was absent at API foundation level.
   Status: FIXED.
   Evidence: configurable in-memory write-method rate limit added for POST/PUT/PATCH/DELETE, with tests proving 429 behavior.

## P1 Findings

1. Sale-to-Receivable drift when Sale financial fields changed after receivable creation.
   Status: FIXED.
   Evidence: Sale updates now synchronize unallocated receivables, create/cancel linked receivables as totals cross zero, and reject financial edits after allocation.

2. Staging/production backup and recovery baseline was undocumented.
   Status: FIXED.
   Evidence: `docs/08-devops/backup-and-recovery.md` added with RPO/RTO, backup, restore, and restore-drill expectations.

3. DevOps environment documentation did not state the current staging readiness boundary.
   Status: FIXED.
   Evidence: `docs/08-devops/environments.md` updated with staging readiness criteria and pilot gating.

4. Deployment documentation did not distinguish liveness from readiness.
   Status: FIXED.
   Evidence: `docs/08-devops/deployment.md` documents `/health` and `/readiness`.

5. Product scope document was stale for Batch 02 local implementation status.
   Status: FIXED.
   Evidence: `docs/PRODUCT-VISION-AND-SCOPE.md` now marks Proposal lifecycle, Booking cancellation, Financial foundation, and Pescador manual capture as local implementations pending integration.

6. Generic immutable audit log is not defined.
   Status: REMAINING, human decision required.
   Current state: specific domain audit fields exist for cancellation/checkpoints/payment/capture workflows, but there is no cross-domain immutable audit-log taxonomy, retention model, or storage contract.

7. Full production finance/accounting/payment/refund model is not defined.
   Status: REMAINING, human decision required.
   Current state: financial foundation exists; payment gateway, refund automation, partial passenger cancellation, and full accounting close remain deferred.

8. Customer application boundary for long-term deployment is still architectural policy, not implementation separation.
   Status: REMAINING, human decision required.
   Current state: staff and customer portal still share the current web app shell per existing architecture decision.

## Requested Audit Areas

Migration ordering: PASS. Ordered migrations 001 through 013 validated dynamically in `test:db`.

`schema.prisma` drift: PASS for current baseline documentation. Prisma schema header was updated so it no longer claims it reflects only early migrations or hard-coded policy counts.

RLS: PASS. `test:db`, security tests, and real-Postgres integration tests validate runtime role behavior, FORCE RLS, fail-closed tenant context, and raw-query isolation proofs.

Tenant isolation: PASS. Covered across Customer, Wish, Trip, Offer, Proposal, Sale, Transportation, Booking, Field Operations, Financial, Customer Portal, Pescador, Commercial Cockpit, and PipelineAccess tests.

Customer Portal: PASS for current scope. IDOR, same-agency customer isolation, cross-agency isolation, identity spoofing, and dev-auth production blocking are covered.

Booking concurrency: PASS. Capacity conflict, atomic passenger creation, round-trip atomicity, cancellation idempotency, and capacity release are covered.

Field Operations concurrency: PASS. Duplicate checkpoint confirmations are protected with clean conflicts and timestamp preservation.

Sale: PASS. Sale route/E2E tests pass, and Sale-to-Receivable drift remediation is covered.

Commercial Cockpit: PASS for current scope. Query, dashboard, configurable pipeline, demo seed stability, and RBAC/tenant gates pass.

PipelineAccess: PASS. Access enforcement and configurable pipeline tests pass in the aggregate quality gate.

Customer 360: PASS for current scope through Customer, Commercial Cockpit, Proposal, Sale, and Customer Portal coverage. No new Customer 360 product expansion was introduced.

Rate limiting: PASS. API write-rate limit is active by default and configurable. Current implementation is process-local, so distributed enforcement remains a deployment concern.

Health/readiness: PASS. `/health` remains liveness-only; `/readiness` is dependency-aware.

Backup/recovery: PASS for documentation baseline. Operational backup jobs and restore drills still require real environment provisioning.

Performance: PASS with warning. Build passes, but Vite reports one customer-app JS chunk at 506.04 kB after minification. This is not a staging blocker; code-splitting is recommended before scale testing.

## Quality Gates

PASS: `npm run migrations:validate`
PASS: `npm run secrets:scan`
PASS: `npm run security:check` with the existing ADR-accepted `deepmerge-ts` warning
PASS: `npm run test:security` - 5 files, 52 tests
PASS: `npm run test:db` - 1 file, 8 tests
PASS: `npm run lint` with one pre-existing React hook dependency warning in `apps/customer/src/pages/OperationDetailsPage.tsx`
PASS: `npm run typecheck`
PASS: `npm run test` - 3/3 Turborepo tasks successful; API 45 files, 681 tests
PASS: `npm run build` - 3/3 Turborepo tasks successful; Vite chunk warning noted
PASS: `git diff --check`

## Human Decisions Still Required

1. Generic immutable audit-log scope, taxonomy, retention, and storage model.
2. Production finance/accounting boundaries, payment gateway policy, refund automation, and partial cancellation roadmap.
3. Customer app deployment boundary and whether/when to split customer portal from staff UI.
4. Real staging environment configuration: secrets, database, backup jobs, restore drill, monitoring, and external smoke testing.

## Explicit Non-Scope Confirmation

Not started: final visual redesign, WhatsApp, AI bot, crawler, GPS, native mobile, push notifications, payment gateway, refund automation, partial passenger cancellation, airline/GDS, Financeiro-next, D2, or D3.

## Final Local Verdict

STAGING BASELINE READY FOR HUMAN REVIEW.
