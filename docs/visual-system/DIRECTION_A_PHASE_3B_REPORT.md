# Direction A — Phase 3B Report

Final major visual reconstruction phase: closes the visual experience end-to-end across the public Landing page, staff Login/MFA/Forgot/Reset, Signup/Onboarding, and Platform Admin. No redesign of already-approved Direction A screens (Agency Dashboard, Customer App, Customer 360, Finance, Operations, Pipeline). No Auth/MFA/RBAC/RLS/Tenant/financial-formula changes.

- **Main HEAD before:** `baed5fa` (docs: record confirmed green CI result for Phase 3A)
- **Main HEAD after:** `f04270b` (feat(auth,marketing,platform-admin): close Direction A end-to-end — Phase 3B)

## Pages changed

**apps/marketing** (public landing):
- `src/index.css` — added Direction A tokens (`--color-travel-navy`, `--color-travel-cyan`, `--color-action-blue`), mirrored from `apps/agency` since marketing is a fully separate deploy target.
- `src/pages/LandingPage.tsx` — full rebuild: navy/cyan gradient hero with real headline/subheadline/CTAs, 6 real product-area cards (CRM/Pipeline/Trips/Finance/Team/Customer Portal), a factual security section (5 claims, all backed by real implemented behavior — tenant isolation, RBAC, MFA, audit, sessions), gradient closing CTA, footer. Every CTA is a real link (`agencySignupUrl()`, `agencyLoginUrl()`, `/demo`, `/pricing`) — none new, none fabricated.
- `src/pages/PricingPage.tsx` — restyled to Direction A tokens; fixed a real dead CTA (`Escolher plano` had no `onClick`/`href` on any of the 3 plan cards) by wiring the two priced plans to the real signup URL and the "Empresarial" (custom-quote) plan to the real `/demo` lead-capture route.
- `src/pages/TrialSignup.tsx` — removed a dead `<a href="/terms">` link (no `/terms` route exists and no reviewed legal content exists to publish) — replaced with plain, non-linked text rather than fabricating a Terms page.

**apps/agency** (staff auth + signup + onboarding):
- `src/pages/LoginPage.tsx` — rebuilt as a split layout (navy brand panel + form card, matching the Login spec's "minimal, elegant, trustworthy" personality). Same 2-step state machine (credentials → MFA) and same `login`/`verifyMfa` calls, unchanged. Added: differentiated error copy using `AuthApiError.status` (401 vs 403 vs network failure), an MFA "Voltar" action (resets local state, no backend call — no recovery-code action was added since no recovery-code endpoint exists anywhere in the backend).
- `src/pages/ForgotPasswordPage.tsx` / `src/pages/ResetPasswordPage.tsx` — restyled to Direction A tokens; Reset gained a client-side-only password-confirmation field (backend still takes a single `newPassword`, unchanged).
- `src/pages/SignupPage.tsx` — rebuilt as a real 2-step client-side wizard (Agência → Conta) with a progress indicator, matching every backend-accepted field (`agencyName`, `contactName`, `contactEmail`, `contactPhone`, `country`, `companyIdentifier`, `password`) with a single real `signUp()` call at the end. No "Segurança" (MFA enrollment) step was added — no MFA-enrollment UI exists anywhere in the app yet (only unconsumed backend routes), so adding that step would have meant either a dead step or fabricating a whole new enrollment flow; documented as a gap, not built.
- `src/pages/OnboardingWizardPage.tsx` — restyled stepper/buttons to Direction A tokens; enriched the "Concluído" step with a real summary (agency name, invites sent, branding-configured yes/no) sourced from state already held by the component. Same real Profile→Branding→Team→Done flow and API calls, unchanged.

**apps/platform-admin** (control plane):
- `src/pages/DashboardPage.tsx` — added a navy/violet gradient hero header; **removed two hardcoded fake values** ("Incidentes Ativos" was hardcoded to `"1"`, "Saúde do Sistema" was hardcoded to `"Saudável"`) and replaced the health card with a real `GET /api/health` call.
- `src/pages/HealthPage.tsx` — full rewrite: was 100% hardcoded fake data (fake latency/uptime per "component"). Now calls the real `/health`, `/readiness`, `/version` endpoints and shows only what they actually return; does not show fabricated latency/uptime history since no such telemetry is persisted anywhere in the backend.
- `src/pages/IncidentsPage.tsx` — full rewrite: was 100% hardcoded fake incidents (2 fabricated rows). No incident-tracking table/endpoint exists in the backend at all — replaced with an honest empty state pointing to the real Health page, rather than inventing an incidents domain.
- `src/pages/SubscribersPage.tsx` — added a real "Plano" column using the `subscription.plan_name` field the API already returns but the table never displayed.

## Components introduced

None new — every visual change reused each app's own established local-component conventions (page-local hero/stat-card patterns already established in Phase 1/3A for `apps/agency`; plain Tailwind for `apps/marketing`/`apps/platform-admin`, matching their existing separate styling approach). No new shared component library was introduced.

## APIs reused

- `signUp`, `login`, `verifyMfa`, `forgotPassword`, `resetPassword` (`apps/agency/src/lib/authApi.ts`) — unchanged.
- `agencySignupUrl()`/`agencyLoginUrl()` (`apps/marketing/src/lib/agencyAppUrl.ts`) — unchanged.
- `/settings/agency`, `/settings/branding`, `/settings/invitations`, `/settings/onboarding-step`, `/settings/onboarding/complete` (onboarding) — unchanged.
- `GET /health`, `GET /readiness`, `GET /version` (`services/api/src/routes/infrastructure.ts`) — newly *consumed* by the frontend for the first time (real, pre-existing backend routes; zero backend changes).
- `GET /api/platform/subscribers` — the `subscription.plan_name` field it already returns is now displayed.

## Backend changes

**None.** No migration, no route, no schema change. Every improvement either reused an already-exposed endpoint the frontend had never called (`/health`/`/readiness`/`/version`) or an already-returned field the frontend had never displayed (`subscription.plan_name`).

## Real, pre-existing issue found and deliberately NOT fixed (documented per policy)

During live verification, every Platform Admin data page that queries `subscriber_tenants`, `subscriptions`, `plans`, `leads`, or `support_cases` failed with Postgres error `42501` (insufficient_privilege). Root cause, traced to the source: the runtime DB role (`travel_app_runtime_local`) has **zero grants on 32 platform-domain tables** (billing, entitlements, feature flags, leads, subscriptions, support, audit logs — the entire Platform Admin backend surface). Confirmed via direct `information_schema.role_table_grants` query, and confirmed the migrations that created these tables (026, 027, 028, 031, 036, and others) never included a `GRANT` statement, unlike every other table in the schema.

This was **not** fixed this round. Widening those grants would mean the tenant-scoped agency-facing runtime role gains read/write access to platform-wide billing/support/audit data — the exact kind of RBAC/tenant-boundary change this phase's rules explicitly forbid ("do not alter RBAC", "do not weaken Auth/RLS/RBAC/Tenant"). It is very plausibly intentional: Platform Admin routes may be designed to run under a distinct, more-privileged database role in real deployments, and this local-staging instance's single `DATABASE_URL` for `api-staging` may simply not reflect that separation. Fixing this safely requires understanding the intended production role topology, which is outside a visual-propagation phase's scope. **Flagging this for engineering review is the correct outcome here, not silently patching a permissions boundary.**

Practical effect: the Platform Admin Dashboard's financial/growth/funnel/plan-distribution charts and the Subscribers/Support list pages cannot show real data in this local-staging environment right now — they correctly show their real error state (verified: "Erro: Não foi possível carregar as métricas", not a crash, not fake data) rather than fabricating numbers. This is pre-existing and not caused by this round's changes (this round made zero backend changes and only added `/health` consumption, which itself works correctly — confirmed live, `200 OK`).

## Screenshots

Captured live via Playwright against real local-staging data (production builds served through the actual Caddy topology):

- Landing (1440 desktop, 390 mobile), Pricing.
- Login (1440 split-layout, 390 mobile).
- Real end-to-end: Login with a real staff account → landed on the real Dashboard.
- Forgot Password.
- Real end-to-end: Signup (2-step wizard, real unique agency) → real `POST /api/agencies/signup` → redirected to `/onboarding` → advanced through Profile → Branding (skip) → Team (skip) → Done, showing a real summary of the just-created agency.
- Platform Admin: Login, Dashboard (real error state, documented above), Subscribers, Health (real OK/READY/version), Incidents (honest empty state).

(Screenshots taken during the session and removed afterward per this repo's working-directory convention.)

## Responsive QA

Landing and Login validated at both 1440 and 390 live via Playwright — confirmed no horizontal scroll, hero/card grids reflow correctly, split-layout Login collapses to single-column on mobile (left brand panel hidden below `lg:`, matching existing `CustomerNav`-style breakpoint conventions from Phase 2). Signup/Onboarding/Platform Admin validated at 1440 only this round (both already used responsive grid utilities before this change; not separately re-verified at 1024/390 given the round's scope).

## Auth QA

- Real credentials login exercised end-to-end (real staff account, real session, real redirect).
- Real signup exercised end-to-end (real agency + OWNER user created, real onboarding-required redirect via `AppShell`'s existing `onboardingCompletedAt` check).
- Forgot Password screenshot-verified (generic no-enumeration message preserved, unchanged behavior).
- MFA step verified logically (same state machine, same `verifyMfa` call) — not exercised live this round since the test account has no MFA enrolled; the split-layout redesign did not touch the MFA branch's data flow, only its presentation and the new "Voltar" affordance.
- 401/403 differentiation added to `LoginPage.tsx` (`credentialsErrorMessage()`) — not live-exercised against a real suspended account this round (would require creating one), but the logic reads `AuthApiError.status` exactly as the existing `authApi.ts` already exposes it.

## Platform Admin QA

- Separate `/platform-auth/*` login pipeline confirmed still fully separate from agency auth — logged in as a real `platform_users` account, landed on the real Dashboard route.
- Confirmed no Platform Admin route is reachable via an Agency-role session or vice versa (separate apps, separate origins, separate cookie/session schemes — unchanged this round).
- Confirmed the newly-added `/health` consumption returns real data with no fabricated fallback content when it fails (`{status:'down'}` state, not a fake "Saudável").

## Security QA

- No Auth/MFA/RLS/RBAC/Tenant code touched. No token moved into `localStorage` (agency session remains `sessionStorage`-only per existing `session.ts`; the only `localStorage` use, before and after, is the non-sensitive remembered agency slug).
- No tenant or role selection introduced anywhere on the frontend — the DB-grants finding above was explicitly *not* worked around by widening a role's access, precisely to avoid weakening the tenant/role boundary.
- Confirmed no Platform Admin access is reachable through an Agency-role session (separate origins, separate auth pipelines, unchanged).
- Confirmed no customer-portal auth leakage — none of this round's changes touch `apps/customer` or the `customer-api`/`customer-auth` pipeline at all.

## Test results

- `apps/agency`: **118/118 passing** (unchanged — no dedicated auth/signup/onboarding tests existed before this round; none were removed or weakened).
- `apps/marketing`, `apps/platform-admin`: 0 tests (pre-existing — both run `vitest run --passWithNoTests` by design, confirmed unchanged from before this round).
- Typecheck (`tsc -p tsconfig.json`, root — all workspaces): clean.
- Lint (`eslint apps/agency/src apps/marketing/src apps/platform-admin/src --max-warnings=0`): 2 pre-existing warnings, both in files untouched this round (`ReportsPage.test.tsx`, `platform-admin/SettingsPage.tsx`) — confirmed present in the last green CI run before this round.
- Build (`vite build` for all three apps): clean.

## CI run id / status

**Green.** Confirmed via real GitHub Actions run `35257147121` (`gh run watch --exit-status`, exit code 0) on commit `f04270b`. All Quality Gates steps passed (lint, typecheck, secret scan, dependency audit, migration naming, unit tests, security tests, database/RLS integration tests, build); only pre-existing warnings unrelated to this round's files.

## FINAL STATUS

**DIRECTION A — PHASE 3B READY FOR HUMAN VISUAL REVIEW**

One real, pre-existing backend permissions gap was found and intentionally left unfixed (see above) — flagged for engineering review, not silently patched, since fixing it safely is outside this phase's visual-propagation scope. Stopping here per the phase's explicit instruction — not continuing into secondary page redesigns, major new features, or architecture refactors.
