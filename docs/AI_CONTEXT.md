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
- `docs/` root mixes current product docs with dozens of numbered
  historical "wave"/"phase" markdown files from past release efforts
  (`00_*` through `2x_*`, several colliding prefixes across unrelated
  waves — e.g. three different `01_*.md` files with unrelated content).
  Several were also duplicated as zip archives sitting next to their
  own already-extracted folder (removed where verified byte-identical;
  see `docs/reduction/` for one prior partial audit). Full consolidation
  of the numbered doc waves was out of scope for this pass — treat
  `docs/*` numbered files as **historical** unless a task specifically
  asks about release history.

## Historical / Archived Paths — do not treat as active source

- **Sibling worktree directories outside this repo's own working
  tree** (visible via `git worktree list`, e.g. `release-core-a`,
  `security-mfa-phase`, `uat-phase`, and many more under
  `D:/travel-platform-worktrees/*`): these are **other local git
  worktrees of this same repository**, checked out at old feature/phase
  branches. They are not part of `main`'s tree (as of this pass, the
  phantom gitlink entries that once pointed at eight of them from
  inside `main`'s own tree were removed — see `chore/codebase-reduction`
  history). Never search them for "the current implementation" of
  anything; they are frozen snapshots of past branches.
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
- `docs/*` numbered historical wave files and their zip archives
  (treat as historical record, not current spec)
- Sibling worktree directories outside the current working tree

Search **active source first**: `apps/*/src`, `services/api/src`,
`packages/*` (excluding generated Prisma output), and their matching
test directories.

## Large-File Note (Phase 17 audit)

The largest active source files (`app.ts` ~5.7k LOC, `financial.ts`
~2.5k LOC, `route-inventory.ts` ~1.8k LOC, `packages/domain/types.ts`
~1.6k LOC) were reviewed for split/dedup potential during this pass.
`app.ts` is Fastify route registration for the entire API — splitting
it by domain (sales routes, proposal routes, financial routes, ...)
is a legitimate future refactor but was **not done in this pass**
because it touches every route in the app and needs its own careful,
fully-tested batch rather than being folded into a dead-code/artifact
cleanup pass. Treat it as `KEEP (candidate for a dedicated future
SPLIT pass)`, not evidence of current disorganization.
