# Release Runbook

**Document Version:** 1.0
**Date:** 2026-09-11
**Status:** Ops/Release Hardening Wave 2 (Agent 01)

---

## Overview

This runbook covers the release/update pipeline, feature-flag usage, version
metadata, and rollback procedure for the Travel Platform API
(`services/api`). It operationalizes:

- `docs/travel_platform_ops_security_pack/release/RELEASE_UPDATE_STRATEGY.md`
- `docs/travel_platform_ops_security_pack/release/ZERO_DOWNTIME_MIGRATIONS.md`
- `docs/travel_platform_ops_security_pack/runbooks/RELEASE.md`
- `docs/travel_platform_ops_security_pack/uat/FINAL_GATES.md`

It complements `docs/BACKUP-RESTORE-RUNBOOK.md` (data recovery) — this
document is scoped to application releases, not disaster recovery.

---

## Pipeline Stages

```
Development -> CI -> Staging -> Migration Validation -> Security Gates
  -> Human UAT -> Canary -> Production -> Monitoring
```

### Final gates (must all be green before Production; never skip a real
failure to "unblock" a release)

- lint (`npm run lint` in `services/api`)
- typecheck (`npm run typecheck`)
- unit tests (`npx vitest run`)
- integration tests (`tests/integration/database/*`, requires local Postgres)
- security tests (SEC-* suites under `services/api/tests/`)
- migration validation (new migration applies cleanly against a fresh DB;
  see "Migration safety" below)
- build (`npm run build`)
- secrets scan
- dependency audit (`npm audit`)
- route/browser smoke
- backup restore drill (see `docs/BACKUP-RESTORE-RUNBOOK.md`)
- cross-tenant tests (RLS isolation suites, e.g. `*-e2e.test.ts`)

---

## Feature Flags

Feature flags are a **kill switch**, not an authorization mechanism. They
gate whether an already-authorized code path is currently rolled out —
they never replace an RBAC check (`requireRole()` / `requirePlatformRole()`
must still run independently).

**Schema** (already existed — `infrastructure/migrations/
033_landing_page_and_flags.sql`): `feature_flags` (name, scope, target_id,
percentage_rollout, enabled, config, metadata) and `feature_flag_audit`
(one row per toggle: action, old_value, new_value, changed_by, changed_at).

**Service layer:** `services/api/src/feature-flags.ts`
- `listFeatureFlags(database)` — all flags
- `getFeatureFlag(database, name)` — single flag or null
- `isFeatureEnabled(database, name, { tenantId? })` — kill-switch read.
  Resolves `GLOBAL` (always) and `TENANT_ID` (only when `tenantId` matches
  `target_id`) scopes. `PLAN_ID`/`USER_ID`-scoped flags currently resolve
  to `false` (fail closed) until a resolver for those scopes exists — do
  not guess a match.
- `setFeatureFlagEnabled(database, name, { enabled, changedBy })` —
  admin-only write; always inserts a `feature_flag_audit` row.

**Routes** (`services/api/src/platform-routes.ts`, mounted under
`/platform/*`, platform-principal auth required):
- `GET /platform/feature-flags` — list (any authenticated platform
  principal, same posture as the other `/platform/*` list routes).
- `POST /platform/feature-flags/:name/toggle` — body `{ "enabled": bool }`.
  Requires `PLATFORM_OWNER` or `PLATFORM_ADMIN` (`requirePlatformRole`).
  Any other platform role gets 401. A non-boolean body gets 400. An
  unknown flag name gets 404.

**Known flags** (from `RELEASE_UPDATE_STRATEGY.md`, documented in
`KNOWN_FEATURE_FLAGS` in `feature-flags.ts` — not an enforced allow-list,
new rows can still be created directly in the table or via migration):
`OCR_DOCUMENTS`, `DIGITAL_SIGNATURES`, `PARTNER_PORTAL`, `UPSELL_ENGINE`,
`INSURANCE`, `MARKETING_AUTOMATIONS`.

**Usage in application code:** call `isFeatureEnabled()` only after the
normal RBAC check for the route has already passed, e.g.:

```ts
requireRole(UserRole.AGENT);
if (!(await isFeatureEnabled(options.database, 'OCR_DOCUMENTS', { tenantId: getAgencyId() }))) {
  throw new NotFoundError('OCR ingestion is not enabled for this agency');
}
```

---

## Version / Build Metadata

`GET /version` (unauthenticated — no sensitive data, needed for
release/rollback tooling to curl without a token) returns:

```json
{
  "appVersion": "0.1.0",
  "buildSha": "abc1234",
  "migrationVersion": "047_operacao_occurrences_posttrip",
  "deploymentId": "unknown",
  "releasedAt": "unknown"
}
```

Resolution (`services/api/src/version.ts`, `resolveVersionInfo()`):
- `appVersion` — `version` field of `services/api/package.json`.
- `buildSha` — `GIT_SHA`, falling back to `BUILD_SHA`, then
  `VERCEL_GIT_COMMIT_SHA`, then `'unknown'`. Set `GIT_SHA` in the deploy
  pipeline (e.g. `GIT_SHA=$(git rev-parse HEAD)`).
- `migrationVersion` — the highest-numbered `NNN_*.sql` file under
  `infrastructure/migrations/` shipped in this build (what the deployed
  code's schema expectation is, not a live "what ran against the DB"
  check).
- `deploymentId` — `DEPLOYMENT_ID`, falling back to `RENDER_INSTANCE_ID`,
  then `'unknown'`. Set by the deploy platform/pipeline.
- `releasedAt` — `RELEASED_AT` (ISO 8601), defaults to `'unknown'`. Set by
  the deploy pipeline at release time.

Never leaks a filesystem path or stack trace — every field independently
falls back to `'unknown'` on any read failure rather than throwing.

Record `appVersion`/`buildSha`/`migrationVersion`/`deploymentId`/
`releasedAt` in the deployment log at every release (curl `/version`
immediately after deploy and archive the response).

---

## Migration Safety (Expand -> Deploy -> Backfill -> Contract)

Rule: **never** ship a destructive `DROP TABLE`/`DROP COLUMN` in the same
migration that introduces the feature depending on the old shape being
gone, and **never** rewrite an already-applied migration file — only add
a new, higher-numbered one.

**Audit performed 2026-09-11** (Agent 01, ops/release hardening wave 2):
searched all 47 migrations (`infrastructure/migrations/001_*.sql` through
`047_*.sql`) for active `DROP TABLE` / `DROP COLUMN` / `DROP TYPE` /
`RENAME` statements outside of comments.

- Every `DROP TABLE`/`DROP TYPE` hit is inside a commented `-- Down:
  Rollback` section at the bottom of its migration (documentation only,
  never executed by the migration runner).
- Every *active* `DROP ...` statement found is `DROP POLICY IF EXISTS ...`
  immediately followed by `CREATE POLICY` for the same policy name — the
  standard idempotent "redefine this RLS policy" pattern used throughout
  `002_rls_policies.sql` and every RLS-touching migration since. This is
  not destructive (no data or table loss) and does not remove application
  functionality.
- No migration in the 025-047 range (the recent SaaS/control-plane/
  operations batch) drops a column or table that a same-migration feature
  then depends on being gone.

**Conclusion: the existing migration history is expand/contract-safe.**
No corrective migration was required. This is a point-in-time audit, not
automated enforcement — see "Migration lint" below for the guard added
this wave.

### Migration lint (added this wave)

A lightweight guard belongs in CI (not implemented as a blocking CI step
in this pass — flagged below for human follow-up): reject a PR that adds
a migration containing an active (non-commented) `DROP TABLE`,
`DROP COLUMN`, or `DROP TYPE` unless the PR description explicitly
confirms it is a Contract-phase migration for a feature already fully
rolled out and off. A simple version:

```bash
git diff --name-only main... -- infrastructure/migrations/ | while read -r f; do
  grep -nE '^\s*(DROP TABLE|ALTER TABLE .*DROP COLUMN|DROP TYPE)' "$f" && \
    echo "::warning file=$f::Destructive DDL in a new migration — confirm this is a Contract-phase migration for an already-disabled feature"
done
```

---

## Rollback Procedure

1. **Feature flag OFF.** If the release is gated behind a flag, flip it
   off first via `POST /platform/feature-flags/:name/toggle` — this is
   the fastest mitigation and requires no deploy.
2. **Rollback the application deployment** to the previous `buildSha`
   (from `/version` history / deployment log).
3. **Database stays forward-compatible.** Because migrations are
   expand-safe (see above), the previous application version continues
   to work against the current schema without a DB rollback. Do not run
   a destructive down-migration as part of a release rollback.
3. **Open an incident** if the rollback was triggered by a production
   defect (not just a canary abort) — follow the org's incident process;
   attach the `/version` output from both the failed and restored
   deployments.

## Deploy Checklist (per `RELEASE.md`)

**Before:**
- `main` clean, CI green
- migration validated against a fresh DB
- security gates green
- staging green
- current backup taken (`docs/BACKUP-RESTORE-RUNBOOK.md`)
- rollback plan written down (which flag(s), which prior `buildSha`)

**Deploy:**
- expand-safe migration applied
- deploy
- smoke test (`GET /health`, `GET /readiness`, `GET /version`)
- canary rollout, monitor
- full rollout

**After:**
- metrics reviewed
- error rates reviewed
- tenant isolation spot-checked (cross-tenant test suite green)
- version/build/migration metadata recorded in the deployment log

---

## Human Approval Required (not touched by this wave)

The following were explicitly out of scope for this wave and are flagged
for human review rather than acted on:

- Wiring the migration-lint check above into an actual CI job/branch
  protection rule.
- Deciding the concrete `deploymentId`/`releasedAt` source for the real
  hosting platform (Render/Vercel/other — no production deploy config
  exists in this repo to infer from).
- Any change to Auth/Tenant/RLS/RBAC structure, DNS/TLS, or secrets
  providers.
- Actually wiring `isFeatureEnabled()` calls into the six named feature
  areas (OCR_DOCUMENTS, DIGITAL_SIGNATURES, PARTNER_PORTAL,
  UPSELL_ENGINE, INSURANCE, MARKETING_AUTOMATIONS) — those flags exist in
  the mechanism and are documented, but no application code path
  currently reads them (out of scope: "don't rebuild existing working
  features").
