# Full Managed Backups and Configurable Exports Implementation Plan

> **For agentic workers:** Use inline execution for this plan. Work in the current non-main checkout, preserve all preexisting changes, and stop before applying any migration or configuring an online provider.

**Goal:** Deliver daily encrypted tenant backups in private managed storage, assisted in-app recovery, and configurable CSV exports in Travel Platform Full.

**Architecture:** A persistent worker claims due schedules under PostgreSQL locking, validates the active OWNER, creates each snapshot using the tenant runtime, encrypts it with a versioned server key, and stores it through the configured private object-storage adapter. OWNER-only API routes manage schedules and runs; a server allowlist drives tenant-scoped CSV queries and the existing safe serializer.

**Tech Stack:** TypeScript, Fastify, PostgreSQL migrations/RLS, Node.js crypto, existing file-storage adapters, React, Vitest.

## Global Constraints

- Full only; no Lite implementation.
- Do not read real `.env` files, access production/staging, deploy, commit, or apply migrations.
- Never trust agency IDs, table names, column names, SQL, or storage keys from the browser.
- Preserve RLS, tenant-scoped transactions, owner authorization, step-up, no-store, and audit.
- Preserve the user's dirty checkout; edit only the listed files and inspect each target before editing.
- Keep the existing manual password-protected backup and empty-destination restore behavior.
- Worker/storage/key configuration must fail closed and be documented as a release prerequisite.

---

### Task 1: Define persistence and server-managed backup envelope

**Files:**
- Create: `infrastructure/migrations/118_managed_tenant_backups.sql`
- Create: `services/api/src/tenant-backup-managed-crypto.ts`
- Test: `services/api/tests/tenant-backup-managed-crypto.test.ts`
- Test: `tests/integration/database/managed-tenant-backups.integration.test.ts`

**Deliverable:** Additive RLS-protected schedule/run metadata and a versioned AES-256-GCM envelope using a server-only key; no object bytes or plaintext stored in PostgreSQL.

- [x] Inspect migrations 115–117 and adjacent tenant-RLS tests; preserve their grants and naming conventions.
- [x] Write crypto tests first for round-trip, agency AAD mismatch, bad tag/key, unsupported key version, and missing/invalid key configuration.
- [x] Run `npm.cmd run test --workspace=@travel-platform/api -- tenant-backup-managed-crypto.test.ts`; confirm the new tests fail before implementation.
- [x] Implement a pure crypto module with explicit key input, random 12-byte IV, authenticated agency/version metadata, and key zeroing after use.
- [x] Add schedule/run tables with agency foreign key, unique run per agency/local date, due index, bounded state enum, storage object key, timestamps, hash/count metadata, and OWNER/timezone fields.
- [x] Enable and FORCE RLS on tenant tables; add agency-context policies and runtime grants only after checking role/grant patterns in migration 117.
- [x] Add integration assertions for isolation, no-context denial, immutable run ownership, and unique daily run; do not apply the migration.
- [x] Rerun focused crypto tests and `npm.cmd run migrations:validate`.

### Task 2: Implement dataset catalog and safe CSV query compiler

**Files:**
- Create: `services/api/src/report-dataset-export.ts`
- Create: `services/api/tests/report-dataset-export.test.ts`
- Modify: `services/api/src/routes/reports.ts`
- Modify: `services/api/src/app.ts`
- Modify: `services/api/tests/reports-csv-http.test.ts`

**Deliverable:** Catalog and export endpoint for sales, customers, receivables, payables, operational expenses, and agency revenue; selectable allowlisted fields/filters and customer joins where supported.

- [x] Inspect existing Full query helpers, table columns, permission checks, CSV tests, and uncommitted report-projection work before touching route registration.
- [x] Write parser/compiler tests for allowed datasets/columns, required date range, relation-safe customer columns, fixed filter enums, injection-shaped values, tenant ID rejection, empty selections, and row/byte bounds.
- [x] Run `npm.cmd run test --workspace=@travel-platform/api -- report-dataset-export.test.ts`; confirm expected failures.
- [x] Define typed dataset descriptors in server code; build SQL only from static SQL fragments and bound values. Bind tenant scope through `DatabaseRuntime.withTenantTransaction`, never by request `agencyId`.
- [x] Reuse `sendReportCsv`, `MAX_CSV_ROWS`, `MAX_CSV_BYTES`, and formula neutralization. Return `private, no-store`, nosniff, attachment headers.
- [x] Add `GET /reports/export/catalog` and `POST /reports/export`; require the approved OWNER boundary for the configurable export.
- [x] Record required audit metadata (dataset, selected field keys, normalized filters, row count), excluding names, documents, values, secrets, and SQL.
- [x] Add HTTP tests for OWNER success, insufficient role, RLS tenant scope, invalid input, CSV injection, bounds, and audit behavior; run focused tests and API typecheck.

### Task 3: Add durable daily worker and schedule APIs

**Files:**
- Create: `services/api/src/tenant-backup-scheduler.ts`
- Create: `services/api/src/backup-worker.ts`
- Create: `services/api/tests/tenant-backup-scheduler.test.ts`
- Create: `services/api/tests/backup-worker.test.ts`
- Modify: `services/api/src/routes/backup.ts`
- Modify: `services/api/src/tenant-backup.ts`
- Modify: `services/api/src/server.ts` or create dedicated worker bootstrap under `services/api/src/` after confirming startup conventions
- Modify: `services/api/package.json`
- Modify: root `package.json` only if workspace command convention requires it

**Deliverable:** A separately runnable persistent worker that claims one due run atomically, processes each agency under an explicit verified OWNER context, retries failures safely, and applies 30-day retention.

- [x] Inspect tenant context factories, `DatabaseRuntime`, `PlatformDatabaseRuntime`, audit transaction behavior, storage adapters, and server shutdown before choosing the narrowest worker runtime.
- [x] Add worker/service tests for `FOR UPDATE SKIP LOCKED` claim semantics via mocked transaction interface, same-agency/local-date idempotency, invalidated OWNER, disabled schedule, duplicate candidate claim, storage failure/retry state, schedule changes, and retention preserving the latest successful snapshot.
- [x] Implement scheduling parsing for `HH:mm` plus valid IANA timezone, next-due calculation, DST-safe local-date idempotency, and bounded retry/backoff without timers in the web API process.
- [x] Require explicit job inputs. The worker must establish a tenant context from a currently active OWNER row and then use the tenant DB runtime; do not read ambient context from an API request or expose platform-wide reads to regular routes.
- [x] Snapshot using existing `exportTenantBackup` internals after extracting a reusable plaintext snapshot operation; preserve the manual password-encrypted endpoint.
- [x] Store ciphertext at a server-minted key under a private backup namespace using existing storage adapter; expose no signed public URLs and mark the run successful only after storage write and metadata verification.
- [x] Add OWNER-only GET status/list and PUT schedule routes; require current-password step-up for schedule enable/disable or modifications. Add no-store download/verify/restore-managed endpoints reusing the existing restore verifier and empty-destination guard.
- [x] Use compare-and-set/DB row locks for job claims and unique `(agency_id, scheduled_local_date)` runs. Sanitize errors and include mandatory audit events.
- [x] Add API package script `start:backup-worker` to run the compiled standalone worker; implement graceful stop and bounded polling.
- [x] Do not configure actual cron infrastructure or secrets; status remains disabled unless storage and key configuration validate.
- [x] Run worker/route unit tests, API typecheck, and migration validation; integration tests stay unexecuted unless the disposable database is explicitly authorized.

### Task 4: Build the Full Backup and CSV configuration UI

**Files:**
- Modify: `apps/agency/src/components/settings/TenantBackupTab.tsx`
- Modify: `apps/agency/src/components/settings/TenantBackupTab.test.tsx`
- Modify: `apps/agency/src/pages/SettingsPage.tsx` only if tab ownership/navigation requires it
- Modify: `apps/agency/src/lib/api.ts` only if a typed download helper is needed

**Deliverable:** OWNER can configure daily schedule and timezone, see success/failure history, download or verify/restore a managed snapshot, retain manual backup controls, and configure/download CSV datasets.

- [x] Inspect current component/API download patterns and tests; preserve uncommitted edits and avoid broad SettingsPage changes.
- [x] Add UI tests for initial state, schedule save with reauthentication, CSV criteria, download, and existing manual recovery behavior; Settings retains the OWNER-only tab boundary.
- [x] Add export catalog-driven dataset selection; render date range, columns, and only the filters the server catalog advertises. Default to customer relation columns when supported.
- [x] POST validated criteria, handle the CSV response as a blob with a sanitized server filename, use browser download/save interaction, revoke object URLs, and show clear empty/limit/error messages.
- [x] Show automated backup readiness separately from schedule state so missing worker/storage/key cannot appear as active. Display next run, last success, retention, encrypted status, and recovery exclusions in Portuguese.
- [x] Never place secrets, backup data, or user financial values in browser logs/local storage. Clear current password fields after mutations.
- [x] Run `npm.cmd run test --workspace=@travel-platform/agency -- TenantBackupTab.test.tsx` and agency typecheck.

### Task 5: Update architecture, help, and operational runbooks

**Files:**
- Modify: `docs/adr/ADR-010-backup-operacional-por-agencia-full.md`
- Modify: `docs/adr/ADR-011-full-backup-assisted-recovery.md`
- Modify: `docs/06-frontend/GUIA-DE-USO-TRAVEL-PLATFORM-FULL.md`
- Create: `docs/08-devops/FULL-MANAGED-BACKUP-RUNBOOK.md`
- Modify: `docs/07-testing/database-integration-tests.md` if needed for migration 118 scenario

**Deliverable:** Accepted backup decisions describe the scheduled architecture, dataset export scope, encryption/key setup, worker operations, retention, recovery gates, and explicit pre-release provider configuration.

- [x] Update ADR-010 as superseded for scheduled managed storage while preserving existing manual export/history constraints.
- [x] Update ADR-011 to distinguish uploaded manual recovery from managed-snapshot recovery; retain same-agency, same-schema, empty-destination behavior.
- [x] Document worker startup/supervision, required keyring/storage variables using examples only, private bucket setup, schedule status meanings, retention, failure handling, rotation compatibility, and restore drill steps.
- [x] Update Full help with exact datasets, date/field/filter configuration, origins of values, CSV-vs-recovery distinction, daily schedule state, exclusions, and restore constraints.
- [x] Run a placeholder/contradiction scan and link docs from the relevant official index files if required.

### Task 6: Focused verification and completion report

**Files:**
- No additional source files unless a focused gate exposes a defect.

**Deliverable:** Local evidence for all authorized code/documentation changes and a clear list of external activation prerequisites.

- [x] Run focused API tests for the new crypto, scheduler, worker, dataset compiler, and HTTP routes.
- [x] Run focused Agency `TenantBackupTab` tests, agency/API typechecks, scoped lint, relevant builds, `npm.cmd run migrations:validate`, and `git diff --check`.
- [x] Review the final diff and verify no `.env`, generated output, backup object, deployment config, remote URL, credential, or unrelated existing edit was added by this task.
- [x] Do not apply migration 118, create/configure a bucket, store production keys, run backup against Gadotti, or deploy. Report these as release gates rather than claiming automatic backup is live.
