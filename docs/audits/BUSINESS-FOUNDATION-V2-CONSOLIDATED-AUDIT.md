# Business Foundation V2 Consolidated Audit

Date: 2026-08-25
Mode: read-only final product readiness review

## Executive Summary

Business Foundation V2 is coherent as a single product foundation, but it is not ready for staging, production, or a real agency pilot without blocker closure.

The system now connects Customer, Wish, Offer, Proposal, Sale, Receivable, Payment, Trip, Booking, ScheduledDeparture, TransportOperation, OperationalStaff, CommercialOpportunity, Pipeline, FollowUp, CustomerInteraction, and ExternalOfferCapture into one recognizable operating model. The strongest areas are tenant isolation, route-level RBAC, booking capacity concurrency, field checkpoint concurrency, customer-portal IDOR coverage, and manual Pescador governance.

The main cross-module risks are financial state drift, incomplete production/deployment operating model, stale canonical documentation, and incomplete consolidated database/RLS gate coverage.

No merge, feature development, schema change, or product decision was performed.

## Overall Verdict

READY FOR HUMAN AUDIT REVIEW.

Not ready for staging.
Not ready for production.
Not ready for real agency pilot.
Not ready for the next product batch until blockers are triaged by humans.

## Staging Readiness

STAGING READY: NO.

Reasons:

- Business Foundation V2 is still PR #18, not integrated into `origin/main`.
- Staging environment and deployment workflow remain deferred in DevOps docs.
- Migration execution/runbook for staging is not defined.
- The canonical DB/RLS integration test does not validate the full 001-013 migration chain.

## Production Readiness

PRODUCTION READY: NO.

Reasons:

- No production operating model was found for deploy, secrets, migrations, rollback, monitoring, backup/restore, or incident response.
- Financial flows have data integrity gaps that matter for real money.
- D2, D3, D4, and ARCH-CUSTOMER-APP-01 remain open.
- Product source-of-truth docs contradict implemented state.

## Real Agency Pilot Readiness

REAL AGENCY PILOT READY: NO.

Reasons:

- Sale update can diverge from linked receivable.
- Payment/allocation idempotency is not defined.
- Cancellation/refund/accounting semantics are not complete enough for real customer operations.
- Many high-volume views remain unpaginated or client-aggregated.
- Customer/staff application boundary remains an open architecture decision.

## P0

Count: 3

1. Business Foundation V2 is not on `origin/main`; PR #18 is open and mergeable, but not merged.
2. Staging/production operating model is not configured.
3. Canonical database/RLS integration gate validates only the old 001/002 baseline, not the complete 001-013 migrated schema.

## P1

Count: 5

1. Sale updates can drift from linked receivable values.
2. Payment and allocation operations lack explicit business idempotency.
3. Customer app boundary remains unresolved under ARCH-CUSTOMER-APP-01.
4. Product vision and architectural finding docs contradict implemented state.
5. Financial Foundation is not yet a complete production finance/accounting model.

## P2

Count: 7

1. Several list endpoints are unpaginated.
2. Customer 360-style workflows aggregate large datasets client-side.
3. Customer Portal booking list has N+1 query risk.
4. PipelineAccess default-open-until-restricted requires explicit product/security acceptance.
5. D2 is only partially resolved by OperationalStaff/assignment foundation.
6. D3 is only partially resolved by whole-booking cancellation V1.
7. Pescador is manual foundation only, with automation/crawler/compliance deferred.

## P3

Count: 4

1. Build has known Vite large-chunk warning.
2. Lint has known React hook dependency warning in `OperationDetailsPage.tsx`.
3. Local worktree hygiene is noisy: primary checkout is stale/diverged, old worktrees remain.
4. External Mermaid Diagram Sync Assistant check is `ACTION_REQUIRED` on PR #18.

## Commercial Journey

Customer -> Wish -> Offer -> Proposal -> Sale -> Receivable -> Trip/Booking -> Post-sale is partially automatic and partially manual.

- Customer: implemented.
- Wish: implemented, tenant-scoped.
- Offer: implemented, tenant-scoped, public/customer-visible flags exist.
- Proposal: implemented, lifecycle actions exist for send/cancel/accept/decline.
- Sale: implemented, created explicitly; not automatically created from proposal acceptance.
- Receivable: automatically created from positive-total sale creation.
- Payment: manual recording and allocation.
- Trip/Booking: implemented, but commercial-to-booking linkage remains operator-driven.
- Post-sale: Commercial Cockpit can identify post-sale candidates, but post-sale execution remains manual.

User-stuck points:

- Proposal acceptance does not automatically create Sale.
- Sale edit can leave Receivable out of sync.
- Payment retry/double-submit handling is not defined.
- Post-sale is surfaced but not workflow-complete.

## Transport Journey

Route -> TransportProduct -> ScheduledDeparture -> Booking -> TransportOperation -> Checkpoints is coherent.

- Route: implemented.
- TransportProduct: implemented with one-way/round-trip constraints.
- ScheduledDeparture: implemented with capacity.
- Booking: implemented with locked capacity checks and passenger atomics.
- Cancellation: whole-booking V1 implemented, idempotent, releases capacity.
- TransportOperation: implemented and seeded from route points.
- OperationalStaff assignment: implemented.
- Checkpoints: implemented with server timestamps and duplicate confirmation protection.
- Concurrency: booking capacity and field checkpoint confirmation are covered by tests.

Remaining gaps are product-depth gaps, not foundation-breakers: partial cancellation, refunds, penalties, customer-initiated cancellation, richer mobile field UX, offline mode, and driver/guide identity evolution.

## Financial

Implemented foundation:

- Receivable
- Payable
- Payment
- PaymentAllocation
- OperationalCost
- Cash-flow dashboard
- Sale margin

Positive findings:

- Partial payments are supported.
- Over-allocation is blocked against both payment and target amounts.
- Receivable status moves through open/partial/paid semantics.
- Sale paid-state requires full receivable allocation.
- Financial routes are restricted to manager/admin-style roles, with writes held to admin.
- Cross-tenant isolation is covered in tests and implementation patterns.

Blockers:

- Sale update does not synchronize linked receivable amount/status.
- Payment/allocation idempotency is not defined.
- D4 remains open for refunds, reconciliations, invoices, accounting periods, chargebacks, provider events, and regulatory semantics.

## CRM / Pipeline

The manager can answer many operational questions with current surfaces:

- Who needs return today: Commercial task/follow-up queries exist.
- Who is overdue: overdue follow-up and overdue receivable surfaces exist.
- Which proposals are stuck: no-response proposal query exists.
- Who travels soon: upcoming trip queries exist.
- Which sales closed: Sale lifecycle/status exists.
- Who needs post-sale: post-sale candidate query exists.
- Complete customer history: Customer 360-style view exists, but with scale risk.

Pipeline model:

- Multiple pipelines: implemented.
- Custom stages: implemented.
- Colors/order: implemented.
- Same-tenant access: implemented.
- Cross-tenant access: blocked.
- Default-open-until-restricted: implemented and tested.

Verdict: safe enough as foundation, but default-open visibility requires explicit acceptance before production.

## Customer Portal

Positive findings:

- Customer API is separated under `/customer-api/*`.
- Customer auth is separate from staff auth hooks.
- Customer sees only own trips/bookings/proposals.
- Same-agency different-customer IDOR is covered.
- Cross-agency customer access is covered.
- Customer spoofing via input does not override established identity.
- Staff-only routes are not satisfied by customer headers.
- No internal financial endpoint was found in the customer API.
- Operational internal controls are not exposed through the customer API.

Remaining blockers:

- ARCH-CUSTOMER-APP-01 is still open.
- Customer Portal list/query shape needs scale hardening.

## Field Operations

Positive findings:

- Operational staff exists.
- Capabilities and assignments exist.
- Field agents see assigned operations.
- Managers/admins can see broader agency operations.
- Checkpoint confirmation requires authorization.
- Duplicate confirmation is blocked.
- Timestamp is server-side.
- Concurrent duplicate checkpoint confirmations produce exactly one success and one conflict.

Gaps for real driver/guide use:

- D2 identity model remains open.
- Offline/poor-network operation is not addressed.
- Mobile-first operational ergonomics remain outside this audit.
- Supplier/operator identity boundaries remain undecided.

## Pescador

Implemented foundation:

- Manual capture.
- Review.
- Approve/reject.
- Explicit publish.
- Human approval before publish.
- RLS and RBAC.
- Per-agency source URL deduplication.

Confirmed:

- No auto-publish.
- No production crawler.

Remaining gaps:

- Provenance model is minimal.
- Deduplication is limited.
- External compliance and crawler policy are deferred.

## Security

No direct runtime tenant bypass was identified in the audited flows.

Positive coverage:

- IDOR tests exist across customer, wish, trip, offer, proposal, sale, booking, commercial, customer portal, and transportation paths.
- Mass-assignment protections reject ownership/status/tenant fields in many route bodies.
- Tenant spoofing via query/body is not trusted.
- Role floors are explicit in routes.
- Customer spoofing is covered in Customer Portal security tests.
- Pipeline cross-tenant bypass is tested.
- Financial routes are not exposed to customer portal.
- Safe generic error responses are covered in E2E.
- Booking and checkpoint race conditions are tested.
- Dev auth is blocked in production.

Security blocker:

- DB/RLS verification coverage is incomplete for the consolidated 001-013 schema.

## Performance

High-volume surfaces reviewed:

- Commercial Dashboard
- Pipeline
- Agenda
- Customer 360
- Financial Dashboard
- Bookings
- Operations

Findings:

- Multiple list endpoints remain unbounded.
- Customer 360 pulls broad datasets and aggregates client-side.
- Customer Portal booking list has N+1 risk.
- Some dashboard/bot-readiness queries may become expensive without pagination/windowing.
- Migration indexes cover many tenant/status/date joins, but query-level pagination policy is not uniform.

No P0 performance blocker was identified. These are P2/P3 scale risks before real agency use.

## Documentation Drift

Real divergences:

- `PRODUCT-VISION-AND-SCOPE.md` still contains stale lower-section statements that Financial has no tables, Pescador has no code, booking cancellation is deferred, proposal accept/decline are missing, and Sale lifecycle is pending.
- `docs/adr/ARCHITECTURAL-FINDINGS-REGISTRY.md` has stale D2/D3/D4/Sale/Proposal/Pescador statements relative to PR #18.
- `schema.prisma` generated comments reference the old 001/002 baseline and old policy/check counts.
- Domain docs for Financial Foundation, Booking Cancellation, Commercial Batch 02, and Pescador are more current than the product/architecture registries.

## Human Decisions

### D2

Status: PARTIALLY RESOLVED, STILL OPEN.

OperationalStaff and assignments exist, but broader driver/guide identity, supplier/operator identity, and app-access model remain undecided.

### D3

Status: PARTIALLY RESOLVED, STILL OPEN.

Whole-booking cancellation V1 exists. Partial cancellation, refunds, fees, supplier penalties, deadlines, and customer-initiated cancellation remain undecided.

### D4

Status: PARTIALLY RESOLVED, STILL OPEN.

Financial foundation exists. Full finance/accounting semantics remain undecided.

### ARCH-CUSTOMER-APP-01

Status: OPEN.

Customer API/UI exist, but application/deployment/security boundary remains undecided.

### New Decision Candidates

- FIN-IDEMPOTENCY-01: payment and allocation retry/idempotency semantics.
- SALE-RECEIVABLE-SYNC-01: whether sale financial fields are immutable after receivable creation or must synchronize receivables.
- PIPELINE-ACCESS-DEFAULT-01: default-open vs private-by-default pipeline visibility.

These are decision candidates only; this audit does not resolve them.

## Quality Gate Evidence

Remote PR #18:

- `Quality Gates`: SUCCESS.
- HEAD: `741e11e4f3e917a557be637f38eb951fbc59bd40`.
- Mergeable: `MERGEABLE`.
- External Mermaid check: `ACTION_REQUIRED`.

Local audit verification:

- `npm run migrations:validate`: PASS, 13 migrations found.
- `npm run secrets:scan`: PASS, no obvious secrets found.
- `npm run security:check`: PASS with ADR-accepted `deepmerge-ts` warning.
- `npm run test:security`: PASS, 5 files, 52 tests.
- `npm run test:db`: PASS, 1 file, 9 tests, with coverage caveat.
- `npm run lint`: PASS, with one existing React hook dependency warning.
- `npm run typecheck`: PASS.
- `npm run test`: PASS, 3 Turbo tasks successful; API 45 files/676 tests, Customer 52 files/399 tests, Domain security tests passed.

Not rerun after the latest formatting-only report change:

- `npm run build`.

Reason: latest instruction says not to repeat work by routine; remote PR CI already has Quality Gates success and this audit changed documentation only.

## Next Recommended Batch

Do not start Financeiro expansion, D2 expansion, D3 expansion, D4 expansion, or the next product batch yet.

Recommended closure batch:

1. Human review of PR #18 and this audit.
2. Update canonical DB/RLS integration coverage for migrations 001-013.
3. Reconcile product vision, architectural registry, and `schema.prisma` generated comments.
4. Decide D2, D3, D4, and ARCH-CUSTOMER-APP-01.
5. Fix Sale -> Receivable sync/idempotency rules.
6. Define staging environment, deployment, migration, rollback, secrets, monitoring, and backup/restore operating model.
7. Re-run all quality gates after blocker fixes and after main advances.

## Final Verdict

READY FOR HUMAN AUDIT REVIEW.

PARE.
