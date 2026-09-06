# AI Context Map

Read this before exploring the repository. It exists to stop agents from
re-deriving structure from scratch or wandering into historical noise.

## Active Runtime

**Apps** (`apps/*`, Vite + React, each its own local dev port):

| App | Port | What it is |
| --- | --- | --- |
| `apps/agency` | 5173 | Staff/back-office app: customers, wishes, offers, proposals, bookings, sales, financial module, reports. Primary agency-facing surface. |
| `apps/platform-admin` | 5174 | Platform-owner SaaS admin: plans, subscriptions, leads, support cases, platform-wide financials. |
| `apps/marketing` | 5175 | Public marketing site (landing, pricing). |
| `apps/customer` | 5176 for its real customer-facing routes | **Misleadingly named**: its default `/` route is actually a second internal staff panel (customers, offers, proposals, bookings, transport, Pescador, Offer & Growth studio) that duplicates parts of `apps/agency`. The real customer/traveler-facing portal lives under `/customer-portal/*` inside this same app (`src/customer-portal/`). See "Known duplication" below. |

All four apps' ports are locked with `strictPort: true` in their
`vite.config.ts` — a real port conflict now fails loudly instead of
silently reassigning which app answers on a given port.

**Backend**: `services/api` (Fastify, single service, port 4000). Route
handlers live in `services/api/src/app.ts` (large, ~5.7k lines — it is
the Fastify route registration file for the whole API, not a god
object to be casually split; see Phase 17 note below). Domain logic is
split into per-entity files next to it (`sales.ts`, `proposals.ts`,
`bookings.ts`, `financial.ts`, `customers.ts`, etc.).

**Shared packages** (`packages/*`):
- `packages/domain` — shared TypeScript domain types (`types.ts`) and
  tenant-context helpers. Canonical source of truth for entity shapes
  used by `services/api`.
- `packages/database` — Prisma schema / DB client plumbing.
- `packages/creative-engine` — creative/offer-growth asset generation.

## Database & Migrations

`infrastructure/migrations/001..037` — sequential, **immutable** history.
Never edit, renumber, combine, or delete an applied migration. New
migrations are always additive, next-numbered files.

`infrastructure/docker-compose.local-postgres.yml` — the disposable
local/test Postgres container definition, reused by many test files
under distinct `-p <project>` names but a **shared, hardcoded
`container_name`**. Only one such container can be `up` at a time
across all of them; if a test run leaves one behind (crash, killed
process), later runs fail with a container-name conflict until it's
removed (`docker rm -f travel-platform-postgres-local`).

## Security Roots (locked — see repository CODE REDUCTION POLICY)

- `services/api/src/dev-auth.ts`, `production-auth.ts`,
  `platform-dev-auth.ts` — authentication providers.
- Tenant isolation: `packages/domain/tenant-context.ts`,
  `DatabaseRuntime.withTenantTransaction`, and Postgres RLS policies in
  the migrations (FORCE ROW LEVEL SECURITY throughout).
- `services/api/src/mfa-provider.ts`, `captcha-provider.ts`,
  `rate-limit.ts`, `audit-log.ts`, `document-masking.ts`,
  `document-verification.ts`.
- `tests/security/*` — tenant isolation and lifecycle security tests;
  `npm run test:security` runs these.

## Test Roots

- `services/api/tests/*.test.ts` — backend integration/unit/HTTP tests
  (Vitest, `fileParallelism: false`; most spin up their own disposable
  Postgres container per file — see the shared-container-name note
  above).
- `apps/*/src/**/*.test.tsx` — frontend component tests (Testing
  Library + Vitest, API calls mocked).
- `tests/security/*`, `tests/integration/database/*` — cross-cutting
  security and DB-role setup tests.

## Demo Data

`scripts/seed-demo-data.cjs`, `scripts/seed-platform-demo-data.cjs`,
`scripts/seed-tenant-demo-data.cjs`, `scripts/demo-business-stories.cjs`
— seed the local demo database. `scripts/demo-business-stories.cjs`
owns the **deterministic Mariana/Cancún story** (fixed UUIDs under
`STORY_IDS.marianaCancun`), the canonical fixture for validating the
full commercial-to-financial journey end to end (see
`docs/product/LOCAL_DEMO_SCRIPT.md` and
`docs/decisions/D5-FINANCIAL-INSTALLMENTS-DEMO-DECISION.md`).

`npm run demo` / `npm run demo:reset` orchestrate bootstrap → migrate →
seed → start all five services (`scripts/demo-orchestrate.cjs`,
`scripts/demo-reset.cjs`).

## Deployment

Not yet centrally documented here — see
`docs/archive/aggressive-release-attack-pack/03_FINANCIAL_COMPLETE.md`
and its sibling numbered docs for historical release-readiness
material (see "Historical / Archived Paths" below).

## Known Duplication (documented, not yet consolidated)

- `apps/customer`'s default routes are a second staff/back-office panel
  overlapping `apps/agency`. Not resolved by this pass; flagged as a
  product decision (which app is the intended long-term staff surface),
  not a code-reduction mechanical fix.
- `apps/agency` and `apps/customer` each define their own
  `TripStatus`/`ProposalStatus` pt-BR label maps and a
  `getBookingStatusLabel`, with byte-identical logic
  (`formatCurrency.ts`/`formatDateBR.ts` were already converged onto
  one canonical copy per app; the status-label overlap has not been).
  Proper consolidation needs a real cross-app shared package — see the
  "Cross-app shared package" note below for why that wasn't done here.
  `apps/platform-admin`'s status domains (Invoice/Payment/Subscription/
  Lead/Support) are genuinely platform-specific, not duplicates.

## Cross-app shared package: not feasible without new build wiring (proven, not assumed)

`services/api` imports from `packages/domain` via a **relative path
straight to the `.ts` source** (`../../../packages/domain/types`), not
via the package name — there is no build step in that path at all.
Tried the same pattern for the frontend apps (a probe file importing
`packages/shared/formatting/money` by relative path from
`apps/agency/src`): `tsc` fails immediately with
`TS6059: File '...' is not under 'rootDir'`, because every app's
`tsconfig.json` sets `rootDir: "."` with `include: ["src/**/*.ts", ...]`
only. Fixing that would mean changing `rootDir`/`include` in all four
app tsconfigs (and verifying Vite's dev-server file-serving and build
output paths still work afterward) — real, first-time build
infrastructure, not a content move. Until a dedicated batch does that
work and proves it end-to-end (typecheck + Vite build + Vite dev clean
in all four apps), do not attempt cross-app package imports; converge
file *contents* instead (see the formatter commits in
`chore/codebase-reduction-batch2`/`-batch3a` history for the pattern).

## Historical / Archived Paths — do not treat as active source

- **`docs/archive/`** — superseded documentation, moved here (not
  deleted; full git history preserved) rather than left cluttering
  `docs/` root:
  - `docs/archive/aggressive-release-attack-pack/` — a full past
    release-wave's numbered docs (`00_README.md` through
    `11_STAGING_UAT_GOLIVE.md`) plus their original zip archive.
  - `docs/archive/waves/{absolute-endgame-sequence,final-audit-swarm,
    p0-remediation-batch,product-completion-wave}/` — four other past
    release-wave report sets (each was also duplicated as a zip
    sitting next to its own extracted folder; the zips were removed in
    an earlier pass after verifying file-list identity).
  - `docs/archive/security-final-reports/` — completed security-audit
    final reports (SEC-B, SEC-F, SEC-G), each pinned to an old base SHA.
- **Sibling worktree directories outside this repo's own working
  tree** (visible via `git worktree list`, e.g. `release-core-a`,
  `security-mfa-phase`, `uat-phase`, and many more under
  `D:/travel-platform-worktrees/*`): other local git worktrees of this
  same repository, checked out at old feature/phase branches. Not part
  of `main`'s tree (the phantom gitlink entries that once pointed at
  eight of them from inside `main`'s own tree were removed — see
  `chore/codebase-reduction` history in `git log`). On this machine
  they're also excluded from `git status`/most IDE search via
  `.git/info/exclude` (local-only, not committed — see that file if
  setting up a new clone/machine). Never search them for "the current
  implementation" of anything; they are frozen snapshots of past
  branches.
- `docs/reduction/`, `.superpowers/reduction/` (when present in a given
  worktree) — scratch output from a prior, separate codebase-reduction
  attempt based on an older commit. Historical, not authoritative.
- Any `dist/`, `dist.bak*/`, `dist.old*/`, `coverage/` directory —
  generated build/test output, gitignored; if one appears tracked, it
  is stale noise, not source (see CODE REDUCTION POLICY, rule 6).

## Agent Ignore Paths

When doing normal source exploration, dead-code search, or duplicate
detection, skip:

- `node_modules/`, `dist/`, `dist.bak*/`, `dist.old*/`, `coverage/`,
  `.tmp/` (session-scratch, gitignored)
- `docs/archive/**` (superseded, historical record only)
- Sibling worktree directories outside the current working tree

Search **active source first**: `apps/*/src`, `services/api/src`,
`packages/*` (excluding generated Prisma output), and their matching
test directories.

## Large-File Note / Batch 3B Prep

The largest active source files (`app.ts` ~5.7k LOC, `financial.ts`
~2.5k LOC, `route-inventory.ts` ~1.8k LOC, `packages/domain/types.ts`
~1.6k LOC) were reviewed for split/dedup potential. `app.ts` is
Fastify route registration for the entire API — splitting it by domain
(sales routes, proposal routes, financial routes, ...) is a legitimate
future refactor but requires its own isolated, fully-tested batch, one
domain extraction at a time. See `docs/refactoring/APP_TS_MAP.md` (the
factual structure map) and `docs/refactoring/BATCH3B_EXTRACTION_PLAN.md`
(the ranked extraction plan) — both documentation only, no code moved
yet. Treat `app.ts`'s size as `KEEP (candidate for a dedicated future
SPLIT pass)`, not evidence of current disorganization.
