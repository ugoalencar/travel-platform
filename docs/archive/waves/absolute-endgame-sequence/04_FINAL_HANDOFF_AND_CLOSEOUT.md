# TRAVEL PLATFORM — FINAL HANDOFF + PROJECT CLOSEOUT

## Mission
Close the release cycle with complete technical and operational handoff. Do not alter product behavior unless a release-blocking documentation/configuration defect is discovered.

## 1 — Freeze release facts
Capture PRODUCTION_SHA, RELEASE_TAG, MAIN_SHA and MIGRATION_COUNT. Verify production identity and repository identity.

## 2 — Repository hygiene
Verify main clean, release branch state known, no accidental uncommitted production fixes, no untracked secret files, no stale temporary credentials, no abandoned critical hotfix branch, tags pushed, release docs committed and CI green on final relevant SHA. Do not delete useful historical branches unless repository policy requires it.

## 3 — Documentation index
Ensure final docs point clearly to architecture, Auth/Tenant/RBAC/RLS, migrations, local development, Agency, Customer Portal, Customer 360, Documents/OCR-ready, Pescador, Offers & Marketing, Financial, testing, deployment, rollback, backup/restore, production go-live, incident handling and known limitations. Create/update concise release index if needed.

## 4 — Environment inventory
Document required environment variable names/purposes only; never secret values. Classify required production, optional, local-only and deprecated. Explicitly identify dev-auth variables that must never be enabled in production, DB, Redis, OIDC, MFA, CAPTCHA, document storage, email and observability.

## 5 — Security handoff
Document invariants future developers must preserve: tenant isolation, RLS/FORCE, tenant-safe runtime DB role, RBAC hierarchy, separate staff/customer auth, production dev-auth prohibition, document privacy, rate limiting, MFA, audit events and migration immutability.

## 6 — Release inventory
Record final release SHA/tag, production deployment ID if available, migration count, test counts, security test count, P0/P1, known P2/P3, rollback point and backup confirmation.

## 7 — Product handoff checklist
Agency: Dashboard, Customer 360, Addresses, Dependents, Documents/OCR-ready, Wishes, Trips, Pescador, Offers, Marketing, Proposals, Bookings, Sales, Financial, Reports, Settings. Customer Portal: Home, Trips, Proposals, Bookings, Profile, permitted Documents. Security: tenant isolation, RLS, RBAC, staff/customer separation.

## 8 — Closeout document
Create `docs/release/FINAL_HANDOFF.md` with Release, Production SHA, Tag, Main SHA, Migration count, Quality gates, Production health, Database, Redis, Auth, Tenant isolation, Agency, Customer Portal, Pescador, Documents/OCR, Offers & Marketing, Financial, P0/P1, known P2/P3, Backup, Rollback, Monitoring and genuine next maintenance priorities only.

## Final response
Return PRODUCTION SHA, TAG, MAIN SHA, MIGRATIONS, CI, QUALITY GATES, PRODUCTION HEALTH, P0, P1, BACKUP, ROLLBACK, MONITORING, RELEASE DOCS, SECURITY HANDOFF and PRODUCT HANDOFF. Final verdict: `PROJECT RELEASE CYCLE CLOSED — PRODUCTION HANDOFF COMPLETE` or `HANDOFF BLOCKED — <exact blocker>`.
