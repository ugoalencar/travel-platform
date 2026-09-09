# TRAVEL PLATFORM — PRODUCTION DEPLOY + SMOKE + GO-LIVE

## Mission
Take the exact release-locked candidate to production safely and verify it as a live system. No new features. No architecture redesign. Never deploy a SHA different from the release-locked SHA.

## Preconditions
Require P0=0, P1=0, full gates PASS, CI exact SHA PASS, tag SHA=release SHA, release lock PASS.

## 1 — Immutable deployment identity
Record RELEASE_SHA, RELEASE_TAG and MAIN_SHA. Verify tag points to release SHA and deployment source resolves to same SHA. Never deploy from a floating local branch.

## 2 — Production configuration audit
Validate without printing secrets: NODE_ENV=production, DB connection/runtime role, external Redis and required fail-closed behavior, OIDC/OAuth2, MFA, CAPTCHA when required, CORS allowlist, public/API URLs, TLS, secure cookies, session/token settings, signing/encryption secrets, document/object storage, email provider if used, observability, audit logging and backup destination. Reject dev endpoints, unsafe dev-auth, localhost DB, unsafe in-memory Redis fallback, wildcard CORS and public document storage.

## 3 — Backup and rollback readiness
Confirm successful timestamped backup, restore procedure and rollback method/owner. Run safe restore verification only on non-production target if available. If backup cannot be verified, STOP.

## 4 — Production migration preflight
Inspect current migration state, target, pending migrations and destructive/blocking behavior. Never rerun or edit applied historical migrations manually. Execute only supported migration process. After migration verify count, schema objects, RLS/FORCE, indexes, constraints and runtime role.

## 5 — Deploy exact release
Use actual deployment mechanism already configured. Deploy RELEASE_TAG/RELEASE_SHA exactly. Monitor logs. On build/runtime/health failure, stop rollout or rollback according to platform capability; do not silently continue.

## 6 — Infrastructure health
Verify API process/readiness, DB, Redis, Agency bundle/API target/no dev-auth, Customer Portal bundle/API target/no admin navigation/auth flow, logs without secret leakage, no repeated 5xx storm, no migration/Redis/auth loops.

## 7 — Production smoke
Use synthetic/approved test accounts. Agency: Login → Dashboard → Customer search/360 → Trips → Offers → Marketing → Proposals → Bookings → Sales → Financial → Reports → Logout/Login. Customer: Login → Home → own Trips → own Proposals → own Bookings → Profile → Logout/Login. Pescador: approved public test URL only, verify SSRF protections, capture/review, no external publish unless approved. Documents: synthetic image only, secure retrieval, masking, no public raw URL, correct tenant/customer scope.

## 8 — Security live checks
Verify tenant isolation, customer cannot access staff APIs, unauthorized requests rejected, production dev-auth impossible, document access private, rate limit active, MFA correct, security headers, restrictive CORS and no internal stack traces to browser. No destructive pentest against production.

## 9 — Financial smoke
Using synthetic data if policy permits: controlled sale, generated revenue, receivable, totals, dashboard and report consistency; clean up according to supported process. If financial mutation is not allowed, do read-only verification and state limitation.

## 10 — Go-live decision
Go live only if P0=0, P1=0, DEPLOY PASS, HEALTH PASS, AUTH PASS, TENANT ISOLATION PASS, AGENCY SMOKE PASS, CUSTOMER SMOKE PASS, DATABASE PASS, REDIS PASS, no 5xx storm and no security regression. Use configured progressive rollout/canary only if supported.

## 11 — Evidence
Create/update `docs/release/PRODUCTION_GO_LIVE.md` with deployed SHA/tag, deployment ID if available, migration count, health/readiness, Agency/Customer smoke, tenant isolation, auth, Redis, DB, documents, Pescador, Financial, error/log summary and rollback readiness. Never include secrets.

## Final response
Return DEPLOYED SHA, DEPLOYED TAG, PRODUCTION MIGRATIONS, BACKUP, ROLLBACK READY, DATABASE, REDIS, API HEALTH, API READINESS, AGENCY, CUSTOMER PORTAL, AUTH, MFA, TENANT ISOLATION, RLS/RBAC, DEV-AUTH PRODUCTION SAFETY, PESCADOR, DOCUMENTS, FINANCIAL, AGENCY SMOKE, CUSTOMER SMOKE, P0, P1, PRODUCTION LOGS, DEPLOYMENT DOCUMENT. Final verdict: `LIVE — PRODUCTION GO-LIVE SUCCESSFUL`, `ROLLBACK EXECUTED — <reason>`, or `BLOCKED_EXTERNAL — <exact missing credential/infrastructure>`.
