# Repository Final Stabilization Report

Date: 2026-09-17
CI run confirming green: https://github.com/ugoalencar/travel-platform/actions/runs/35164234475

## MAIN HEAD

```
ad5582d5035db7e9b7ac650a8b644161496faebe
```

## WORKTREE STATUS

Clean. `git status --short` returns nothing outstanding on `main`.

## CI GATE RESULTS (all local + confirmed on real GitHub Actions run)

| Gate | Result |
|---|---|
| CI (overall) | **GREEN** |
| Typecheck | PASS |
| Lint | PASS (only pre-existing warnings, 0 errors) |
| Secrets scan | PASS |
| Security audit (`npm audit`) | PASS — no vulnerabilities at/above moderate |
| Migrations validate | PASS — 75 sequential files, 001→075, no gaps |
| Unit tests | PASS — 1472/1472 (services/api) + 117/117 (agency) + 537/537 (customer) + 26/26 (domain) + 26/26 (creative-engine) |
| Security tests | PASS — 58/58 |
| Database/RLS integration tests | PASS — 9/9 |
| Build | PASS — all 4 frontend apps + api build cleanly |

## PROTOCOL FIX

**PASS.** `tests/security/tenant-repository-error-safety.test.ts`'s `CreateInput<Customer>` fixture was missing the now-required `protocolNumber` field (migration 068). Added a synthetic value (`'CLI-2026-000001'`) matching the documented format. No type weakening.

## EXCURSION FK

**REAL BUG, FIXED.** `excursion_customers_trip_tenant_fk` (migration 071) was a composite `(agency_id, trip_id)` FK with `ON DELETE SET NULL`. Postgres nulls out every column in a composite FK's referencing side on that action — including `agency_id`, which is `NOT NULL` — so deleting any Trip referenced by an excursion roster row would fail with a NOT NULL violation. Reproduced directly against a real migrated database (not theoretical): `DELETE FROM trips WHERE id = ...` raised `null value in column "agency_id"`. No application code path currently deletes a Trip, so this was dormant, not yet hit in production traffic — but the first delete path added would have failed immediately.

Fixed via a new forward-only migration (`075_excursion_customers_trip_fk_fix.sql`) that swaps the composite FK for a single-column FK on the trip's globally-unique `id`. Migration 071 itself is untouched, preserving historical migration integrity. Added a DB-level regression test (`001_constraints_test.sql`) that inserts a real roster row pointing at a real trip, deletes the trip, and asserts both that the delete succeeds and that the roster row survives with `trip_id` nulled and `agency_id` intact — confirmed passing in the DB/RLS integration suite (9/9).

## REGRESSION FROM PROTOCOL CHANGE

Confirmed fully reflected across tests/types:
- Full monorepo `typecheck` passes — every `CreateInput<Customer>`-shaped literal in the codebase compiles.
- `tests/security` suite (58/58) includes the fixed fixture.
- 11 `services/api` disposable-DB test suites (customer-e2e, customer-routes, customers, demo-seed-stability, enrollment, financial-http, partners, trip-e2e, trip-routes, trips, wish-routes) were missing migration 068 from their hand-curated migration lists entirely — every one of them 500'd the instant any code path touched the `customers` table (`column "protocol_number" does not exist`). Fixed by adding 068 (and its own dependency, 049, which 068 also ALTERs `enrollment_submissions` for) to each file's migration list. All now pass locally against a real disposable Postgres container.

## OPEN PR AUDIT

**#19 — "Staging readiness remediation"**
STATUS: fully superseded (0 commits ahead of `main`, 350 behind).
UNIQUE COMMITS/FILES: none.
ALREADY IN MAIN: yes, entirely.
ACTION: **CLOSE AS SUPERSEDED**

**#20 — "Offer & Growth Engine architecture contract"**
STATUS: fully superseded (2 commits ahead, 350 behind) — but both commits' file content is byte-identical to what's already on `main` (`docs/adr/ADR-OFFER-GROWTH-001-core-architecture.md`, `docs/offer-growth/*`), verified via `git diff` showing zero lines changed.
UNIQUE COMMITS/FILES: 2 doc commits, content already present on main.
ALREADY IN MAIN: yes, entirely (verbatim).
ACTION: **CLOSE AS SUPERSEDED**

**#27 — "feat(ui): visual reconstruction"**
STATUS: partially superseded (15 commits ahead of `main`, 111 behind — merge-base `382f8f2` is recent, main's own HEAD from just before this session's work began).
UNIQUE COMMITS/FILES: 15 commits — a full agency-shell visual rebuild (sidebar/topbar/tokens, dashboard, Customer 360 profile, Finance overview, Air/Land Services polish, Platform Admin dashboard, Customer portal CRM/home rebuild), plus one genuine correctness fix: `fix(financial): eliminate LEFT JOIN fan-out inflating monthly margin ratio` (`1624e24`).
ALREADY IN MAIN: no — confirmed by direct inspection that `services/api/src/financial.ts`'s `getFinancialSummary()` on current `main` still has the exact 3-way `LEFT JOIN` fan-out bug this PR already fixed (a sale with matching rows in more than one of `payables`/`operational_costs`/`commissions` simultaneously will inflate `revenue`/`supplierCosts`/`operationalCosts` by a cross-product factor, producing a nonsensical margin). This is a **live, currently-active bug on `main`**, not just stale PR content.
ACTION: **NEEDS HUMAN REVIEW** — recommend REBASE/RECOVER, specifically prioritizing commit `1624e24` (the financial fan-out fix) given it's an active correctness bug; the 14 visual-rebuild commits are a larger, more subjective design decision that should be reviewed by the user before merging, not auto-applied by this stabilization pass.

## UNMERGED UNIQUE WORK

- `origin/feature/visual-reconstruction` (PR #27, above) — visual rebuild + the financial fan-out bugfix.
- `origin/docs/offer-growth-engine-architecture` (PR #20) — no unique content (verbatim duplicate of main).
- `origin/audit/consolidated-01` — one doc-only commit (`docs(audit): consolidated post-batch-01 audit`, 2026-08-24) adding `docs/audits/PRODUCT-CONSOLIDATED-AUDIT.md`, not present on `main`. Low priority (documentation snapshot, not code), flagged for completeness.
- All other 27 remote branches are 0 commits ahead of `main` — fully merged/superseded, safe deletion candidates (not deleted per instructions).

## STALE BRANCHES / WORKTREES

Full inventory of 30 non-main remote branches computed via `git rev-list --count origin/main..<branch>`:

| Ahead of main | Branches |
|---|---|
| 0 (fully merged) | `architecture/api-foundation`, `architecture/arch-01-schema-source-of-truth`, `docs/agent-readiness`, `docs/product-batch-01`, `feature/booking-vertical`, `feature/commercial-cockpit`, `feature/commission-repair`, `feature/customer-app`, `feature/customer-vertical`, `feature/field-operations`, `feature/financial-foundation`, `feature/offer-growth-backend-foundation`, `feature/offer-growth-convergence-batch-04-5`, `feature/offer-vertical`, `feature/productization-integration`, `feature/proposal-vertical`, `feature/sale-vertical`, `feature/security-wave1-integration`, `feature/security-wave2-integration`, `feature/staging-readiness-remediation` (#19), `feature/transportation-admin`, `feature/trip-vertical`, `feature/wish-vertical`, `fix/field-operations-concurrency`, `release/final-rc-02-p0-remediated`, `release/product-completion-final`, `release/rc-03-defects-fixed` |
| 1 | `audit/consolidated-01` (doc-only, see above) |
| 2 | `docs/offer-growth-engine-architecture` (#20, verbatim duplicate) |
| 15 | `feature/visual-reconstruction` (#27, see above) |

No branch was deleted. All destructive cleanup left for explicit user authorization.

## BRANCH PROTECTION RECOMMENDATION

GitHub branch protection ruleset for `main`:

- **Require a pull request before merging** — enabled, no direct pushes to `main` except a documented emergency/admin bypass policy if the team wants one (not configured here; recommend leaving disabled by default).
- **Require status checks to pass before merging** — enabled, required check: **`Quality Gates`** (the single job name in `.github/workflows/ci.yml`; GitHub Actions surfaces this exact job name as the check name — there is only one job, so no per-step check names apply).
- **Require branches to be up to date before merging** — enabled if the team's PR volume is low enough that this doesn't become a bottleneck; recommended given the monorepo's cross-package coupling (a stale branch could merge a change that passed CI against an older `main` but conflicts with something merged since).
- **Do not allow force pushes** — enabled (block force-push to `main`).
- **Do not allow deletions** — enabled (block branch deletion for `main`).
- **Require conversation resolution before merging** — recommended, not strictly required by this mission.
- Administrators: recommend *not* exempting admins from these rules, so the same gate applies to everyone, unless the team has a specific emergency-fix workflow that needs it.

This was **not applied automatically** — GitHub repository settings changes require explicit authorization per this mission's constraints. The exact toggles above are ready to apply via Settings → Branches → Add branch protection rule on `main`.

## P0

**0** — no remaining CI-blocking or data-integrity-blocking issues found.

## P1

**1** — PR #27's financial fan-out bug (`getFinancialSummary()`'s 3-way LEFT JOIN) is a live, currently-active correctness bug on `main` (confirmed by direct code inspection, not just PR content) that inflates the financial dashboard's monthly margin figure when a sale has multiple matching rows in more than one of `payables`/`operational_costs`/`commissions`. Recommend recovering commit `1624e24` from `feature/visual-reconstruction` as a follow-up, reviewed and applied deliberately (not swept in by this stabilization pass, since it touches business-critical financial calculations and deserves its own focused review/merge).

## FINAL VERDICT

# STAGING BASELINE CANDIDATE

---

## Appendix: build/version identifiers

- **MAIN HEAD:** `ad5582d5035db7e9b7ac650a8b644161496faebe`
- **APP VERSION:** `0.1.0` (all workspace packages, per their `package.json`)
- **BUILD SHA:** `ad5582d5035db7e9b7ac650a8b644161496faebe` (build ran against this exact commit in the confirming CI run)
- **MIGRATION VERSION:** `075_excursion_customers_trip_fk_fix.sql` (75 sequential migrations, 001→075, no gaps, validated by `npm run migrations:validate`)
- **CI RUN:** https://github.com/ugoalencar/travel-platform/actions/runs/35164234475
- **CI STATUS:** SUCCESS
- **TEST COUNT:** 2,178 unit tests passing (1472 api + 117 agency + 537 customer + 26 domain + 26 creative-engine)
- **SECURITY TEST COUNT:** 58
- **DB/RLS TEST COUNT:** 9
