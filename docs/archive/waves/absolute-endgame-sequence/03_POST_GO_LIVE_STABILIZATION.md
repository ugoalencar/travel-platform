# TRAVEL PLATFORM — POST-GO-LIVE STABILIZATION

## Mission
Verify the newly deployed platform remains healthy after go-live. No new features. Only P0/P1 production defects, operational correctness, observability, performance/security regressions, and deployment/documentation defects.

## 1 — Production identity
Verify DEPLOYED_SHA == RELEASE_SHA and DEPLOYED_TAG == RELEASE_TAG. Investigate immediately if not.

## 2 — Runtime stability
Inspect available telemetry/logs for 5xx rate, anomalous 4xx, latency spikes, DB saturation, Redis errors, auth/MFA failures, document access failures, Pescador outbound failures, background job failures, restarts/memory issues and frontend asset errors. Do not expose secrets or private customer data.

## 3 — Core business verification
Repeat non-destructive checks for Agency Dashboard, Customer 360, Trips, Offers, Proposals, Bookings, Sales, Financial and Reports; Customer login, Home, Trips, Proposals, Bookings and Profile. Confirm no regression after caches/restarts/deployment propagation.

## 4 — Data integrity
Verify migration state stable, no retry-induced duplicates, financial idempotency intact, tenant keys present, no orphan document metadata, no cross-tenant exposure and no unexpected failed audit writes. Prefer read-only checks.

## 5 — P0/P1 convergence
For any P0/P1: isolate root cause, dedicated hotfix branch, smallest safe fix, local gates, focused tests, full required gates, PR/CI exact SHA, deploy hotfix, smoke again, record new production SHA. Never hot-edit production files, bypass CI or force push. Document P2/P3 for maintenance unless release safety is affected.

## 6 — Operational readiness
Verify deployment, rollback, backup, restore, env-var inventory without values, monitoring, incident handling, release process, tenant/security invariants, migration process and document storage/access policy. Fill documentation gaps.

## 7 — Stabilization report
Create/update `docs/release/POST_GO_LIVE_STABILIZATION.md` with current production SHA, release tag, available health evidence, error/auth/DB/Redis summaries, Agency/Customer/Financial/tenant checks, P0/P1, hotfix SHA and known P2/P3.

## Final response
Return PRODUCTION SHA, RELEASE TAG, RUNTIME HEALTH, DATABASE, REDIS, AUTH, MFA, TENANT ISOLATION, AGENCY, CUSTOMER, PESCADOR, DOCUMENTS, FINANCIAL, P0, P1, HOTFIXES, OPERATIONAL DOCS, BACKUP/ROLLBACK. Final verdict: `STABLE — GO-LIVE VALIDATED` or `UNSTABLE — <exact blocker>`.
