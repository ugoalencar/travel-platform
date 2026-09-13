# Roadmap Phase 0 Worktree Inventory

Date: 2026-09-12
Branch: main
HEAD: fe1d3f17c983aec54d50b5870fca7e64d4207105

## Executive Summary

Phase 0 is partially complete. Quality gates are green, but `main` is not clean.

Estimated Phase 0 completion: 75%

Completed:
- Lint/type/build/security/DB gates are passing.
- Secret scanner hardening is implemented and covered by tests.
- Vitest 5 migration is implemented across workspace test packages.
- DB/RLS test container isolation is implemented and verified.
- Generated `graphify-out` and `vitest-report.json` artifacts are now ignored.
- Current runtime/build checkpoint is documented in `ROADMAP_PHASE0_CHECKPOINT.md`.

Remaining:
- Classify and either integrate, move out, ignore, or discard the large untracked Mega Pack/staging artifact set.
- Review the large API modularization diff before treating it as part of the baseline.
- Get `main` to a clean state after an explicit human decision on what to keep.

## Verified Gates

The following gates were run and passed:

- `npm run typecheck`
- `npm run lint`
- `npm run security:check`
- `npm run secrets:scan`
- `npm run test:security`
- `npm run test:db`
- `npm run build`

Known non-blocking warnings:
- Frontend build chunk-size warnings for agency/customer bundles.
- Existing lint warnings, with zero lint errors.

## Tracked Modified Files

### Security, Dependency, and DB/RLS Isolation Changes

These are the focused changes made during the current hardening work and are ready to be reviewed as a coherent patch:

- `package.json`
- `package-lock.json`
- `apps/agency/package.json`
- `apps/customer/package.json`
- `apps/marketing/package.json`
- `apps/platform-admin/package.json`
- `scripts/check-secrets.cjs`
- `scripts/check-secrets.d.cts`
- `tests/security/secrets-scanner.test.ts`
- `infrastructure/docker-compose.local-postgres.yml`
- `tests/integration/database/database.integration.test.ts`
- `services/api/src/financial.ts`
- `.gitignore`

Summary:
- Updated Vitest and coverage package to `^5.0.0`.
- Removed `describe.sequential` usage from API/DB test files for Vitest 5 compatibility.
- Hardened secret scanning around `.worktrees`, placeholders, and false positives.
- Isolated local DB/RLS compose project/container naming and random local port behavior.
- Fixed financial reference-table typing.
- Ignored generated `graphify-out` folders and `vitest-report.json` files.

### API Modularization / Mega Pack Changes

These appear to be broader pre-existing work and should be reviewed as a separate integration unit:

- `services/api/src/app.ts`
- `services/api/src/mfa-provider.ts`
- `services/api/src/settings-queries.ts`
- API route modules under `services/api/src/routes/`
- API connector/provider modules under `services/api/src/connectors/`
- Characterization tests under `services/api/tests/characterization/`
- `docs/05-api/openapi.yaml`

Observed size:
- `services/api/src/app.ts` has a very large diff: thousands of lines removed and route logic apparently moved into route modules.
- This looks like valid modularization work, but it should not be mixed silently with the hardening patch.

### Documentation Context Changes

- `docs/AI_CONTEXT.md`

This should be reviewed together with the modularization/staging documentation to ensure it reflects the active source tree.

## Untracked Files

Total untracked files after generated-artifact ignore cleanup: 190

By top-level group:
- `docs`: 149
- `services`: 32
- `scripts`: 3
- root-level files: 4

Root-level untracked:
- `SECURITY_AUDIT_CHECKPOINT.md`
- `ROADMAP_PHASE0_CHECKPOINT.md`
- `ROADMAP_PHASE0_WORKTREE_INVENTORY.md`
- `STOP_READ_BEFORE_EDITING.md`
- `docker-compose.staging.yml`

Untracked groups:
- `docs/travel_platform_mega_pack/`
- `docs/travel_platform_ops_security_pack/`
- `docs/travel_platform_staging_uat_golive_pack/`
- `docs/travel_platform_api_modularization_phase0/`
- `docs/travel_platform_api_modularization_phase1/`
- `docs/travel_platform_api_modularization_phase2/`
- `docs/travel_platform_visual_reconstruction_pack/`
- `docs/staging-uat-golive/`
- `docs/superpowers/plans/`
- `docs/superpowers/specs/`
- `services/api/src/routes/`
- `services/api/src/connectors/`
- `services/api/tests/characterization/`
- `scripts/`

## Risk Assessment

High risk:
- Mixing hardening fixes with the large API modularization diff may make review and rollback hard.
- Untracked generated folders such as `graphify-out/` can pollute future scans and commits.

Medium risk:
- Staging/UAT docs and scripts may be useful, but need classification before becoming part of official repo state.
- Route modularization may be correct, but needs its own smoke/API regression pass after review.

Low risk:
- Vitest 5 and DB/RLS isolation changes are already covered by gates.
- Secret scanner changes are covered by focused tests plus the repository scan.

## Recommended Next Actions

1. Create a review boundary:
   - Patch A: security/dependency/DB-RLS isolation changes.
   - Patch B: API modularization/Mega Pack route extraction.
   - Patch C: staging/UAT docs and scripts.
   - Patch D: generated artifacts or external packs.

2. Decide what to do with generated/noise outputs:
   - Keep only if they are official deliverables.
   - Otherwise add appropriate ignore rules or move them outside the repo.

3. Review the API modularization patch:
   - Confirm each route module is wired.
   - Confirm RBAC and tenant scoping remain server-side.
   - Run API test subsets and full build again after classification.

4. Clean `main` only after explicit approval:
   - Stage/commit accepted patches, or
   - Move/archive unaccepted artifacts outside the repository, or
   - Discard specific generated files only if explicitly authorized.

## Current Roadmap Position

Fase 0 - Consolidar `main`: 75%

Fase 1 - Fechar Mega Pack: cannot be called complete yet, because there may still be valid implementation in the current dirty tree or sibling worktrees that has not been integrated.

Fase 2 - Freeze do Produto: blocked until Fase 0 and Fase 1 gates are clean.
