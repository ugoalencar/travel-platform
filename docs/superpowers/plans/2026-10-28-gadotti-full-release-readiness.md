# Gadotti Full Release Readiness Plan

> **Execution:** Inline in the existing checkout. Preserve all pre-existing changes; do not commit, push, deploy, or access Lite online.

**Goal:** Prepare a locally verified Full release candidate and isolated demo OWNER account without changing Gadotti's live data. Target routing requested by the user: public landing at `travelplataforma.com.br`, Gadotti Full at `gadotti.travelplataforma.com.br`, and a temporary provider URL for the separate demo. Lite must not be the destination or runtime for this plan.

**Architecture:** Inventory the shared dirty checkout first, then use a newly named local Full database for schema and demo verification. Create the demo agency and OWNER through the Full signup API, keep its credentials outside source files, and produce a commit/release manifest that excludes Lite-only changes and live customer data.

**Tech Stack:** Node.js, TypeScript, Fastify, React, PostgreSQL, Docker Compose, Vitest, PowerShell.

## Global Constraints

- Preserve the current branch and all pre-existing working-tree entries (537 before this plan; current status reports 538 entries including the plan).
- Never use the demo orchestrator against an existing database; it drops the public schema.
- Never connect to or mutate the online Lite/Gadotti database in this task.
- Use only a uniquely named local Full demo database for migrations and demo-account creation.
- Do not include a demo tenant, credentials, generated output, or Lite-only changes in a release commit.
- Do not commit, push, deploy, or change production configuration.
- Do not report release-ready until database migration, UI smoke, and quality gates have evidence.

---

### Task 1: Inventory the checkout and the current Full release scope

**Files:** No source changes. Read `git status`, active Full API/UI, `QUALITY-GATES.md`, `SCRIPTS.md`, and release/deployment docs.

- [x] Record branch and base revision; group all dirty paths into Full, Lite, shared, and unknown without staging. Branch: `wip/organizacao-2026-10-20`; HEAD: `67ff9f9`; inventory: 320 Full/shared, 150 Lite, 65 agent notes, 3 other.
- [x] Identify whether any files are already staged and preserve the existing index. No staged files.
- [x] Record the current Full test database and the local login database separately; do not merge their contents. Demo uses isolated Docker DB `travel-gadotti-full-demo-20261028-postgres` on `127.0.0.1:55660`; integration suites use separate uniquely named databases.
- [x] Decide whether a safe Full-only commit boundary can be formed from the current changeset. **No:** the checkout contains extensive mixed pre-existing work and Full/shared paths; exact commit boundary is not established, so nothing was staged.

### Task 2: Build an isolated local Full demo database

**Files:** No schema-source edits. Create a uniquely named local Docker Compose project/volume and use the checked-in migrations.

- [x] Verify the chosen container name and port do not already exist.
- [x] Create the demo database with a unique project/container and a fixed local-only loopback bind (`127.0.0.1:55660`).
- [x] Apply migrations to this newly created empty database only; migration validation passed (118 files).
- [x] Verify schema version, RLS/grants, API readiness, and that no Gadotti records were copied. Demo migrations/readiness/login passed; no Gadotti data was copied. Full RLS/grant suite did not pass (see gates).

### Task 3: Create and verify a separate demo OWNER

**Files:** No credential files. Use the Full `/api/agencies/signup` endpoint against the isolated demo database.

- [x] Check uniqueness of the reserved demo email and keep the tenant separate from Gadotti.
- [x] Create one synthetic agency and its OWNER through the existing authenticated-account creation flow; create no customer, sale, or financial fixtures.
- [x] Verify login and role through the API without printing session tokens; revoke the verification session.
- [x] Return the local URL, agency slug, demo email, and one-time password directly to the user only; never write them to Git.

### Task 4: Validate the Full release candidate locally

**Files:** No source changes unless a reproducible defect is found; then add a focused regression test and minimal fix.

- [ ] Run Full API/Agency tests, typechecks, lint, and builds; report warnings separately from errors. Agency suite passed 289/289, focused help test 16/16, API typecheck/build pass, API lint has 0 errors and 14 warnings. The payables regression passed in an isolated DB; the full `financial.test.ts` suite still has six fixture failures from missing `employee_commission_payment_policies`. Earlier API suite output also reported missing `agency_module_settings` in partial test DBs. Full API gates are not green.
- [ ] Run database/RLS integration coverage only against its uniquely named disposable test database. Fixture-order fixes are in place; full rerun remains running and currently reports four failures in `user-permission-overrides.integration.test.ts`.
- [x] Smoke-test API health/readiness, login, backup status and export catalog (200); UI help route is covered by the Agency component test. The API returned six export datasets. Managed backup is not configured with storage/keyring/worker.
- [x] Verify the Full DB has the latest migration and that no automatic backup is claimed successful without a completed stored run. The disposable DB has migrations through 118; no managed backup run was created.

### Task 5: Prepare a reviewable commit and release handoff

**Files:** Update this plan and create a Full release manifest under `docs/release/` if a safe scope is established.

- [ ] List exact Full files intended for a later commit; keep Lite and unrelated pre-existing work unstaged. Boundary remains unsafe to define; no files staged.
- [ ] Run `git diff --check` on the candidate and confirm no secrets, credentials, `.env`, demo database volume, or generated build output are included. `git diff --check` exits 0 with line-ending warnings; repository-wide `secrets:scan` fails on possible secrets in `.tmp` and test fixtures; no files were staged.
- [ ] Report remaining migration, provider, tenant-migration, operational-backup, and deployment gates without claiming online readiness. Online Gadotti migration, managed backup provider/keyring/worker, and deploy/migration/rollback procedures remain unconfigured or unverified.

## Findings during local verification

- The Full help page exposed a previous-session internal UX audit note block to users. It was removed from `apps/agency/src/pages/HelpPage.tsx`; `App.test.tsx` now asserts the audit notes are absent and the revenue page remains linked. Focused `App.test.tsx` passed 16/16.
- `test:db` initially failed because runtime/platform roles were created only after all migrations, while migrations conditionally grant privileges only when roles exist. The isolated DB test setup was adjusted to provision those local roles before migration; verify the full suite before treating this as resolved.
- `secrets:scan` reported possible-secret findings in pre-existing `.tmp` artifacts and tests. These paths were not read or modified; classify before any commit, and exclude all `.tmp` output from any future release candidate.
- The local demo OWNER is `demo@travel-platform.test` in agency `travel-platform-demo-b05dd61f`; account credentials were returned directly to the user and are not stored here. Backup status is disabled (no managed storage/keyring/worker), so this is a UI/API demo and not a recovery-ready customer environment.
- Release remains blocked: 539 dirty status entries including extensive pre-existing mixed Full/Lite/shared work; no safe Full-only commit boundary; failing/running full suites; scanner findings; no verified Gadotti migration, provider-managed backup, deployment, or rollback setup. No commit, push, or deploy was performed.
- Local authenticated browser E2E on 2026-10-29: login succeeded; all 52 Agency routes rendered without failed API responses or JavaScript errors; a synthetic customer and sale were created and listed (POST `/api/customers` and `/api/sales` each returned 201); the financial agency-revenue route and export catalog returned 200 with six export datasets. Payables initially returned 500 (`42702 column reference "amount" is ambiguous`); regression test reproduced it, `PAYABLE_COLUMNS` now qualifies each comma-separated name after trimming, the targeted isolated DB regression passed, and the 52-route smoke passed again. Backup status returned 200 but reports automatic backup `configured=false`, `enabled=false`, `ready=false` (`storageConfigured=false`, `encryptionConfigured=false`).
- User chose a temporary demo URL (no custom DNS action). Provider inventory: Vercel CLI is authenticated to the Hobby team `ugoalencars-projects`, but this checkout links to `travel-platform-marketing` and has no Full demo project; Render CLI authentication is expired; Supabase lists only the existing `travel-lite-gadotti` project in organization `Ugo Alencar`. Do not reuse that Lite project for Full. A separate database and Fastify host are required before a safe public demo deployment; quoting/provisioning the database needs organization/cost approval and Render access renewal.
- Online route target recorded: `travelplataforma.com.br` = marketing landing; `gadotti.travelplataforma.com.br` = Full Agency app after migration/cutover; demo gets a temporary isolated preview URL. No DNS was changed and no Full deployment was performed.
