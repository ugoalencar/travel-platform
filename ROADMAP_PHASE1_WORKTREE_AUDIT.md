# Roadmap Phase 1 Worktree Audit

Date: 2026-09-12
Baseline branch: main
Baseline HEAD: fe1d3f17c983aec54d50b5870fca7e64d4207105

## Executive Summary

Fase 1 is not complete yet.

Estimated Fase 1 completion: 55%

Reason:
- Several Mega Pack branches still have commits not present in `main`.
- Several Mega Pack worktrees have uncommitted files.
- The current `main` also contains a large dirty modularization/staging state that needs classification before integration can be called complete.

## Worktree Status Snapshot

Format:
- `main-only` = commits in `main` not in branch.
- `branch-only` = commits in branch not in `main`.
- `dirty files` = local uncommitted status count in the worktree.

| Worktree | Branch | HEAD | main-only | branch-only | dirty files | Status |
|---|---|---:|---:|---:|---:|---|
| `D:\.worktrees\mega-campaigns` | `feature/mega-campaigns` | `176ed44` | 0 | 1 | 9 | Needs integration review |
| `D:\.worktrees\mega-catalog` | `feature/mega-catalog` | `7129695` | 0 | 1 | 1 | Needs report/docs decision |
| `D:\.worktrees\mega-client-onboarding` | `feature/mega-client-onboarding` | `9cfcc2b` | 16 | 0 | 0 | Branch appears behind `main` |
| `D:\.worktrees\mega-contracts` | `feature/mega-contracts` | `542cd1c` | 0 | 1 | 4 | Needs integration review |
| `D:\.worktrees\mega-insurance` | `feature/mega-insurance` | `9a12251` | 0 | 2 | 0 | Needs integration review |
| `D:\.worktrees\mega-ocr` | `feature/mega-ocr` | `5de1b29` | 0 | 1 | 2 | Needs integration review |
| `D:\.worktrees\mega-pack-wave1-integration` | `feature/mega-pack-wave1-integration` | `f1be24b` | 6 | 0 | 0 | Branch appears behind `main` |
| `D:\.worktrees\mega-partners` | `feature/mega-partners` | `6d6d708` | 0 | 1 | 2 | Needs integration review |
| `D:\.worktrees\mega-saas-admin` | `feature/mega-saas-admin` | `0d2a28e` | 13 | 0 | 0 | Branch appears behind `main` |
| `D:\.worktrees\mega-traveler` | `feature/mega-traveler` | `fe1d3f1` | 0 | 0 | 13 | Same HEAD as `main`, but dirty |
| `D:\.worktrees\mega-upsell` | `feature/mega-upsell` | `4a3d7f1` | 0 | 2 | 3 | Needs integration review |
| `D:\.worktrees\saas-admin-ui-completion` | `feature/saas-admin-ui-completion` | `fe1d3f1` | 0 | 0 | 0 | Already aligned with `main` |
| `D:\.worktrees\security-wave1` | `feature/security-wave1-integration` | `3cd153d` | 224 | 0 | 0 | Branch appears behind `main` |

## Dirty Worktrees Requiring Attention

### `feature/mega-campaigns`

Dirty files:
- `services/api/src/partner-campaigns.ts`
- `services/api/tests/partner-campaigns.test.ts`
- `tests/integration/database/002_prepare_local_roles.sql`
- `CHECKPOINT_CONTINUACAO.md`
- `MEGA_PACK_2_PARALLEL_CHECKPOINT.md`
- `WAVE2_REPORT.md`
- `infrastructure/migrations/053_commercial_partners.sql`
- `infrastructure/migrations/054_partner_campaigns_commercial_partners.sql`
- `services/api/tests/partner-campaigns-http.test.ts`

Assessment:
- This worktree is no longer clean.
- It appears to contain Wave 2 partner/campaign integration beyond the previously reported committed backend slice.

### `feature/mega-contracts`

Dirty files:
- `services/api/src/app.ts`
- `tests/integration/database/002_prepare_local_roles.sql`
- `services/api/src/contracts.ts`
- `services/api/tests/contracts.test.ts`

Assessment:
- Likely a new contracts slice with API wiring and DB grants.
- Needs tests/gates before integration.

### `feature/mega-traveler`

Dirty files:
- `packages/domain/types.ts`
- `services/api/src/app.ts`
- `services/api/src/audit-log.ts`
- `services/api/src/customer-documents.ts`
- `services/api/src/customers.ts`
- `services/api/src/routes/customer-documents.ts`
- `services/api/tests/customer-documents-routes.test.ts`
- `services/api/tests/customers.test.ts`
- `services/api/tests/helpers/fake-database.ts`
- `tests/integration/database/002_prepare_local_roles.sql`
- `infrastructure/migrations/052_traveler_international_profile.sql`
- `services/api/src/customer-loyalty-programs.ts`
- `services/api/tests/customer-loyalty-programs.test.ts`

Assessment:
- Same commit as `main`, but with local uncommitted traveler/customer enhancements.
- Needs highest caution because it touches shared domain types, customer docs, audit logs, DB grants, and app wiring.

### `feature/mega-upsell`

Dirty files:
- `infrastructure/migrations/052_sale_items_upsell.sql`
- `services/api/tests/sale-item-routes.test.ts`
- `tests/integration/database/002_prepare_local_roles.sql`

Assessment:
- Small focused slice, but migration numbering collides with other feature branches and must be normalized before integration.

### Smaller Dirty Worktrees

`feature/mega-catalog`:
- `WAVE2_REPORT.md`

`feature/mega-ocr`:
- `WAVE2_REPORT.md`
- `services/api/vitest-report.json`

`feature/mega-partners`:
- `services/api/tests/partners.test.ts`
- `WAVE2_REPORT.md`

## Integration Risks

Critical:
- Migration number collisions are likely. Examples include multiple `052_*` migrations across traveler and upsell, while campaign branch has `053_*` and `054_*`.
- Multiple branches modify `tests/integration/database/002_prepare_local_roles.sql`, so DB runtime grants need a single consolidated edit.
- Multiple branches modify `services/api/src/app.ts`, while `main` already has a large route modularization diff. Manual integration is required.

High:
- `feature/mega-traveler` touches broad customer/audit/domain surfaces and may overlap with existing main changes.
- `feature/mega-campaigns` now includes commercial partner migration work and HTTP tests that were not part of the previously reported clean state.

Medium:
- `WAVE2_REPORT.md` files may be useful documentation but should not be blindly committed.
- `services/api/vitest-report.json` is probably generated output and should likely be ignored or discarded after explicit approval.

## Recommended Integration Order

1. Freeze `main` dirty-state classification from `ROADMAP_PHASE0_WORKTREE_INVENTORY.md`.
2. Integrate or explicitly exclude small report-only worktrees:
   - `mega-catalog`
   - `mega-ocr`
   - `mega-partners`
3. Integrate focused backend slices with migration renumbering:
   - `mega-upsell`
   - `mega-contracts`
4. Integrate larger domain slices:
   - `mega-insurance`
   - `mega-campaigns`
   - `mega-traveler`
5. Re-run full gates after each integration group:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test:security`
   - `npm run test:db`
   - relevant API/frontend tests
   - `npm run build`

## Current Roadmap Position

Fase 0 - Consolidar `main`: 75%

Fase 1 - Fechar Mega Pack: 55%

Official recovery plan:
- `docs/superpowers/plans/2026-09-13-mega-pack-integration-recovery.md`

Current priority order:
1. `mega-catalog`
2. `mega-ocr`
3. `mega-partners`
4. `mega-upsell`
5. `mega-contracts`
6. `mega-insurance`
7. `mega-campaigns`
8. `mega-traveler`

## Integration Progress

### `mega-catalog`

Status: verified in temporary integration branch, not merged to `main`.

Temporary branch:
- `integration/mega-catalog`

Evidence:
- `npm --workspace @travel-platform/api test -- travel-products-http`: PASS, 21 tests.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS with warnings and 0 errors.
- `npm run build`: PASS.
- `npm run security:check`: PASS.
- `npm run test:security`: PASS, 52 tests.
- `npm run test:db`: PASS, 9 tests.

Required integration fixes beyond source commit:
- Vitest 5 compatibility for `describe.sequential`.
- Vitest dependency/security update across root and app workspaces.
- DB/RLS container isolation.
- DB/RLS expected table/grant updates for migrations through `051` plus catalog tables.
- jest-dom matcher type visibility for root typecheck.
- Lint cleanup in catalog input parser.

Not promoted because:
- `main` is still dirty.
- Repository rules require explicit authorization before committing/merging.
- Source worktree still has untracked `WAVE2_REPORT.md`.

Fase 2 - Freeze do Produto: blocked until:
- `main` is clean;
- all branch-only Mega Pack commits are integrated or explicitly rejected;
- all dirty worktree changes are committed, integrated, moved aside, or explicitly discarded.
