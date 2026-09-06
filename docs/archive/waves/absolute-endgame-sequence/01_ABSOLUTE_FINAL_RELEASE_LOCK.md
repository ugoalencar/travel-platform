# TRAVEL PLATFORM — ABSOLUTE FINAL RELEASE LOCK

## Mission
Freeze the Travel Platform into one exact, reproducible, releaseable candidate. This is not another feature wave.

Target: P0=0, P1=0, Agency visual PASS, Customer visual PASS, Human UAT PASS, security PASS, migrations PASS, build PASS, exact release SHA known, CI success on that exact SHA, release documentation complete, annotated RC tag created, staging ready or deployed if infrastructure is available.

## Autonomy
Resolve all technical and reversible issues yourself. Do not stop for naming choices, localized test fixes, frontend polish regressions, safe dependency/test-fixture fixes, documentation gaps, safe merge conflict resolution, branch housekeeping or reproducible build issues.

Stop only for missing external credentials, unavailable external infrastructure, destructive/irreversible production action, unresolved structural Auth/Tenant/RLS/RBAC redesign, or a true P0/P1 that cannot be safely fixed.

## 1 — Ground truth
Run `git status`, `git branch --show-current`, `git fetch --all --prune`, `git log --oneline --decorate -30`. Resolve current HEAD, origin/main HEAD, release/product-completion-final HEAD, unpushed commits, worktree cleanliness, divergence and whether final visual work is integrated. Never rely on old SHAs.

## 2 — Defect convergence
Inspect TODO/release reports, skipped/failing tests, browser QA, accessibility, console/network, migrations, build and security. Any P0/P1: fix, test, commit, rerun affected flow and final gates. Required P0=0 and P1=0.

## 3 — Full gates
Inspect package.json and use real scripts only. At minimum when present: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:security`, `npm run migrations:validate`, `npm run build`. Also run `test:db`, `recovery:drill`, `secrets:scan`, `security:check` when present/applicable. If any gate fails, fix, commit, rerun affected gate, then rerun complete set. Final release SHA must be exact SHA that passed all gates.

## 4 — Database safety
Verify migration count, unique sequential numbering, zero-to-head, historical integrity of 016/017, validity of 019+, no duplicate numbers, no silent rewrite of applied historical migrations, RLS/FORCE and tenant-safe production DB role. Run DB/recovery harness if present. Never perform destructive operations on shared/staging/production data.

## 5 — Production dev-auth safety
Prove NODE_ENV=production cannot enable dev-auth; ALLOW_DEV_AUTH cannot bypass production gate; Agency browser cannot select arbitrary tenant/role; customer dev-auth remains separate from staff dev-auth; production build injects no unsafe x-dev-* headers; Customer Portal cannot access Agency-only features. Return evidence/test names.

## 6 — Browser smoke
Start runtime from candidate SHA. If unchanged: Agency 5173, Customer 5174, API 4000. Smoke Agency: Dashboard, Customers, Customer 360, Addresses, Dependents, Documents, Wishes, Trips, Pescador, Offers, Marketing, Proposals, Bookings, Sales, Financial, Reports, Settings. Smoke Customer: Home, Trips, Proposals, Bookings, Profile, Documents if exposed. Confirm no unexplained 401/403/404/500, console errors, React warnings, failed API calls, and persistence survives reload.

## 7 — Release branch lock
Final branch: `release/product-completion-final`. Integrate safely if work lives elsewhere. No force push, destructive rebase, --no-verify, blind conflict resolution, `git add .`, `git add -A`, or amend of shared commits. Explicit staging only. Worktree must end clean. Record RELEASE_SHA.

## 8 — Release document
Create/update `docs/release/FINAL_RELEASE_LOCK.md` with exact SHA, branch, date/time, migration count, lint, typecheck, tests, security, DB tests, migration validation, secrets scan, build, Agency/Customer visual, responsive, accessibility, Agency/Customer/cross-module UAT, tenant isolation, RLS, RBAC, staff/customer separation, production dev-auth safety, P0/P1, rollback, and only genuine non-blocking P2/P3.

## 9 — Push and exact-SHA CI
Push release branch safely and wait for CI on exact RELEASE_SHA. Older CI is invalid evidence. If CI fails, fix, commit, rerun full gates, push, wait again, update RELEASE_SHA.

## 10 — Tag
Only after local full gates and exact-SHA CI pass. Follow repo convention; otherwise tag `v1.0.0-rc1` annotated with `Travel Platform v1.0.0 Release Candidate 1`. Verify `git rev-list -n 1 v1.0.0-rc1` equals RELEASE_SHA. Push tag.

## 11 — Staging
Inspect repo for actual staging deployment method. Do not invent scripts. Verify backup/restore, PostgreSQL compatibility, external Redis, env validation, secrets, OIDC, MFA, CAPTCHA if required, TLS, CORS, migrations, health/readiness and observability. If credentials/infra exist, deploy exact release SHA/tag and smoke test. If not, return STAGING=BLOCKED_EXTERNAL with exact missing dependency.

## Final response
Return factual fields only: FINAL RELEASE SHA, BRANCH, WORKTREE, MIGRATIONS, ZERO-TO-HEAD, LINT, TYPECHECK, UNIT TESTS, SECURITY, DB TESTS, SECRETS, BUILD, AGENCY VISUAL, CUSTOMER VISUAL, RESPONSIVE, ACCESSIBILITY, AGENCY UAT, CUSTOMER UAT, CROSS-MODULE UAT, TENANT ISOLATION, PRODUCTION DEV-AUTH SAFETY, P0, P1, RELEASE LOCK DOCUMENT, REMOTE RELEASE BRANCH, CI ON EXACT RELEASE SHA, TAG, TAG SHA MATCH, STAGING, STAGING SMOKE.

Final verdict must be `RELEASE LOCKED — READY FOR PRODUCTION DEPLOYMENT` or `BLOCKED — <exact blocker>`. Do not return conditional pass for locally fixable issues.
