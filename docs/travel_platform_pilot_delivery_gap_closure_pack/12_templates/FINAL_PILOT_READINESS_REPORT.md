# Final Pilot Readiness Report

Agent 07 (Integrator). Executed against `main` at commit `3d90719`, 2026-09-14.

## BASELINE

- **MAIN HEAD:** `3d90719fbf85adcfca9893609e9001e82b8441e`
- **APP VERSION:** not tagged (no version-bump convention in use); tracked by commit SHA + `/version` endpoint (`resolveVersionInfo()`)
- **MIGRATION VERSION:** `061_local_password_auth.sql` (61 sequential migrations, validated via `npm run migrations:validate`)

## CI/CD

- **TYPECHECK:** PASS (`tsc --noEmit`, clean across api + agency)
- **LINT:** PASS (`npm run lint`, 0 errors, 11 pre-existing warnings unrelated to this pack)
- **TESTS:** PASS (`npm run test` equivalent — full API suite, 86/86 files, 1461/1461 tests, run clean against a fresh disposable Postgres)
- **SECURITY:** not re-run in this final pass (`npm run test:security` is part of `ci.yml`'s gate; covered by the same suite run under `npm run test`)
- **SECRETS:** PASS (`npm run secrets:scan`, wired into `ci.yml`)
- **BUILD:** PASS (`npm run build`, all 7 workspaces — domain, api, marketing, platform-admin, customer, agency — clean)

`.github/workflows/ci.yml` already existed but had a real bug making every real CI run fail on `test`/`test:db`: it set `DATABASE_TEST_MODE=ci` pointing every test at the GitHub Actions Postgres service, but none of the 53 test files that manage their own disposable Postgres via `docker compose` ever read that variable — they would still try to spin up a container on the same port the Actions service already owns, guaranteeing a port conflict on every run. Fixed (commit `90cd4f9`): all 53 files now no-op their container lifecycle when `CI=true`, verified by actually simulating the real CI codepath locally (a Postgres standing in for the Actions service, zero `docker compose` calls made) — 84/84 files, 1442/1442 tests passing that way.

## FORGOT PASSWORD / RESET PASSWORD / EMAIL VERIFICATION / MFA / SESSION REVOCATION

**All of these did not exist anywhere in the product before this session.** `auth_sessions` and the MFA tables (`016_production_auth_captcha_mfa.sql`) existed as unused scaffolding for an OIDC/OAuth2 provider that was never wired up (`production-auth.ts`'s `authenticate()` always returned `null`); invitation acceptance set `password_hash` to an unusable random placeholder and never collected a real password from the invitee.

Built from scratch (commit `ec7c75d`, migration `061_local_password_auth.sql`):

- **FORGOT PASSWORD:** PASS — always-generic response (no user enumeration), high-entropy single-use hashed token, 30-minute expiry, revokes every session on success, fully audited.
- **RESET PASSWORD:** PASS — same token mechanism; verified end to end (old session dies, old password stops working, new one works) in `local-auth.test.ts`.
- **EMAIL VERIFICATION:** PASS, by design choice, not a separate flow — staff users are only ever created via invitation (an existing admin sends an email-bound link), so accepting the invitation already proves control of the inbox. Documented as a deliberate scope decision in the Agent 02 commit message, not an oversight.
- **MFA:** PASS — TOTP (RFC 6238) + 16 hashed single-use recovery codes, mandatory-by-default for OWNER/ADMIN via the pre-existing `mfa_requirements` table, every verification attempt (success and failure) logged to `mfa_totp_attempts`.
- **SESSION REVOCATION:** PASS — logout, self-service session list/revoke, password-reset-revokes-all, and (newly added) `PATCH /users/:id/status` (disable/suspend a staff user, ADMIN+) all revoke real rows in `auth_sessions`, not a client-side-only logout.

A real, pre-existing security bug was fixed along the way: `mfa-provider.ts`'s recovery-code hashing used a hardcoded, committed-to-source-control HMAC "secret" that provided no real keying — switched to plain SHA-256, matching every other high-entropy token in this codebase.

18 new tests (`local-auth.test.ts`, `auth-http.test.ts`) cover the full checklist in `MFA_SESSION_LIFECYCLE.md` and `PASSWORD_RECOVERY.md` line by line.

## ENTITLEMENTS / RBAC / RLS / TENANT ISOLATION

- **RBAC:** PASS — unchanged, `requireRole()` hierarchy intact throughout.
- **RLS / TENANT ISOLATION:** PASS — every new table (auth_sessions retrofit, password_reset_tokens) follows the established tenant-scoped + session-local-GUC public-lookup pattern (mirroring invitations/enrollment tokens exactly); FORCE ROW LEVEL SECURITY on every table; verified in the Wave 2 integration pass and again in this pack's own tests.
- **ENTITLEMENTS:** PASS, after two real fixes (commit `20b7dbd`):
  1. `routes/pescador.ts` had zero entitlement enforcement across all 8 handlers — every other `PlatformFeature`-gated domain was at 100% coverage; Pescador was not. Fixed.
  2. **The larger finding:** no code path anywhere ever granted a real agency an entitlement row. Entitlements are fail-closed by design (correct), but the only write path was a dev-only stopgap — meaning every real pilot customer would 403 permanently on Creative Studio, Campaigns, Social Publishing, Social Automation, and Pescador, forever, in production, with no admin UI able to fix it. Fixed: `completeOnboarding()` now grants the agency all 5 currently-wired features at onboarding completion. This is explicitly pilot-scoped — multi-plan branching is a tracked follow-up before a second, differently-priced customer is onboarded.

Full audit: `docs/travel_platform_pilot_delivery_gap_closure_pack/04_entitlements/ENTITLEMENT_AUDIT_REPORT.md`.

## BACKUP / RESTORE / OBSERVABILITY

- **OBSERVABILITY:** PASS, verified not just present — `/health`, `/readiness`, `/version`, `/metrics` (with real 2xx/3xx/4xx/5xx status-class counters), structured JSON logs with `requestId`/`correlationId`/`deploymentId` on every line, and auth/MFA failure visibility via the new audit events, all cross-checked against their existing test coverage.
- **BACKUP:** PASS locally, mechanism verified real — `recovery-drill.sh` (seed → backup → fresh target → restore → validate → cleanup, with hard guards refusing to run against any staging/production-looking host) was actually executed against a disposable local Postgres, not just confirmed to exist. Two real operational (not code) gaps found and documented: a Windows/Git-Bash pipe quirk in `pg_dump | psql`, and a pg_dump-client/server major-version mismatch that can make a backup *look* successful while silently failing to restore — both with concrete fixes for the real ops runbook.
- **RESTORE AGAINST REAL STAGING:** **BLOCKED** — no staging environment is provisioned or reachable from this session. This is explicitly Phase 8 work (`PILOT_STAGE_SEQUENCE.md` steps 2, 10), not a code-level gap; RPO/RTO against the pack's provisional targets (≤1h / ≤4h) cannot be measured until one exists.

Full report: `docs/travel_platform_pilot_delivery_gap_closure_pack/05_backup_observability/AGENT_04_REPORT.md`.

## CORE E2E / PORTAL E2E / UAT

**BLOCKED.** Two independent reasons, either one sufficient on its own:

1. **No staging environment** is provisioned or reachable from this session — E2E against staging is explicitly a Phase 8/9 activity (`PILOT_STAGE_SEQUENCE.md`), not something this session can execute.
2. **No frontend login exists.** `apps/agency` has zero UI for login, MFA, or password reset — the backend built this pack has no way for a human to reach it through the actual product. Worse than three missing pages: the app has no concept of a session anywhere (`App.tsx` has no auth guard on any route; `lib/api.ts`'s `fetch()` calls carry no `Authorization` header or any caller-identifying header at all; no session storage, no logout control, no 401 handling). This was deliberately **not attempted** in this pass rather than rushed — it touches the shared API client and root router every existing page depends on, precisely the kind of broad change this project's standing discipline says to slow down for. Full detail and the concrete shape of the required work: `docs/travel_platform_pilot_delivery_gap_closure_pack/06_frontend_e2e/AGENT_05_REPORT.md`.

11 of the 14 items in `CRITICAL_FRONTEND_COVERAGE.md` already have real, working pages (onboarding, invitations, permission restrictions, Customer 360, Wish, Offer, Proposal, Booking, Trip, Finance, Customer Portal) — this is not a broad frontend gap, it is specifically the identity/session surface.

## DOCS RECONCILED

Three documents describing a JWT + httpOnly-cookie authentication design that was accepted but never implemented (two prior half-built attempts exist in the code, neither matching the doc either) were corrected to describe the real implementation: `docs/adr/ADR-003-authentication.md` (reconciliation note added, historical decision preserved), `docs/PRODUCT-VISION-AND-SCOPE.md` (security matrix row), `docs/03-security/authentication.md` (rewritten: real endpoints, real session mechanism, real hashing, real rate limiting). Scoped specifically to auth docs — the area with confirmed real drift from this pack's own work — not claimed as a full repository-wide audit. Full report: `docs/travel_platform_pilot_delivery_gap_closure_pack/07_docs_reconciliation/AGENT_06_REPORT.md`.

## P0 / P1 / P2

- **P0 (blocks pilot):**
  1. No frontend login/session UI — a real pilot user cannot authenticate through the product today, regardless of how solid the backend is.
  2. No staging environment provisioned — blocks real backup/restore validation and E2E/UAT, both required by `PILOT_READY_GATE.md`.
- **P1 (should close before go-live, doesn't block starting staging work):**
  1. Multi-plan entitlement branching in `completeOnboarding()` — fine for one pilot customer on the full plan, must change before a second, differently-priced customer.
  2. pg_dump client/server version pinning for whoever runs backups against real staging (documented, not yet enforced by tooling).
- **P2 (tracked, not urgent):**
  1. Feature-flag mechanism (`feature-flags.ts`) is real but has zero consumers — fine as-is, adopt if/when a route needs a kill switch.
  2. Broader (non-auth) documentation drift was not audited in this pass.

## STANDBY ITEMS

Unchanged from `10_gates/STANDBY_LIST.md`: React Query, React Hook Form + Zod, `/api/v1`, Broker App, `shared/config/validation` packages, public agency landing pages, advanced marketplace, advanced partner portal, advanced social automation, advanced insurance/upsell.

## FINAL VERDICT

# BLOCKED

Not because the work done this pack is weak — CI/CD, Identity (login/MFA/password-recovery/session-revocation), Entitlements, and Observability are all now genuinely solid, verified against real Postgres and real test coverage, not just "present." Blocked on exactly two things, both listed above as P0, neither a backend code gap:

1. **Build the frontend session/login surface** (`apps/agency`) — the concrete, scoped follow-up documented in Agent 05's report.
2. **Provision a staging environment** — a human/infra decision (hosting, secrets, deploy pipeline) outside what a coding session can do on its own, required before backup/restore-against-real-staging, E2E, and UAT can even begin.

Once both exist, re-run this same audit — CI/CD, Identity, Entitlements, and Observability should not need to be revisited unless staging surfaces something the local disposable-Postgres testing couldn't.
