# Batch 3 Candidates

Documented, not implemented, during Batch 2
(`chore/codebase-reduction-batch2`, based on `main@0a87978`). Each
candidate below was identified with concrete evidence but deferred
because implementing it safely needs its own isolated worktree, its
own full test run between steps, and in most cases new build
infrastructure this repo doesn't have yet.

## 1. `services/api/src/app.ts` decomposition (~5,690 lines)

**Benefit:** the single largest source file in the repo; splitting
Fastify route registration by domain (sales, proposals, bookings,
financial, customers, ...) would make each domain's HTTP surface
independently navigable and reviewable.

**Risk:** high if rushed. Every route in the API lives in this one
file today; a decomposition pass touches the entire HTTP surface at
once unless done route-group by route-group with full test runs
between each extraction.

**Estimated affected surface:** all `services/api/tests/*-http.test.ts`
and `*-routes.test.ts` files (import paths, possibly route registration
order dependencies); `route-inventory.ts` (1,771 lines, also a
candidate for the same kind of split, since it appears to mirror
app.ts's route list).

**Recommended approach (per user direction for this exact task):** do
NOT start with "split app.ts." First build a map of the file's actual
structure — bootstrap/plugin registration, per-domain route groups,
shared middleware/hooks, and composition/startup — then extract one
domain at a time, running the full 1214+ test suite after each
extraction, not just at the end.

## 2. Cross-app status-label consolidation (`TripStatus`, `ProposalStatus`, `getBookingStatusLabel`)

**Benefit:** `apps/agency/src/lib/statusLabels.ts` and
`apps/customer/src/lib/statusLabels.ts` both define identical
`TripStatus` → pt-BR mappings, identical `ProposalStatus` → pt-BR
mappings, and an identical `getBookingStatusLabel(cancelled)` — three
concepts genuinely duplicated with byte-identical logic.

**Risk:** low for the mapping content itself, but see next entry —
proper extraction needs the same shared-package infrastructure as
Candidate 3, so it's blocked on the same prerequisite.

**Estimated affected surface:** `apps/agency/src/lib/statusLabels.ts`,
`apps/customer/src/lib/statusLabels.ts`, and every page that imports
`getProposalStatusLabel`/`getTripStatusLabel`/`getBookingStatusLabel`
from either (a handful of pages per app).

**Recommended tests:** characterization tests per status enum value
(already partially covered by existing page tests) before and after
consolidation; explicit assertion that agency and customer render the
exact same label for every shared enum value.

## 3. Cross-app formatting/status shared package infrastructure

**Benefit:** `apps/agency` and `apps/customer` each had byte-identical
`formatCurrency.ts`/`formatDateBR.ts` (converged onto one canonical
copy in Batch 2 — see `refactor(shared)` commit) and have overlapping
status-label domains (Candidate 2). A proper `@travel-platform/shared`
(or similar) workspace package would let both truly import one
implementation instead of keeping two content-synced copies.

**Why deferred in Batch 2:** neither frontend app currently depends on
any workspace package, and neither has Vite path-aliasing configured
for cross-package imports. Introducing a new buildable package (with
its own `package.json`, `tsconfig.build.json`, a `build` step wired
into `turbo.json`'s pipeline, and `vite dev` needing to either consume
prebuilt `dist/` output or a source alias) is real, first-time
infrastructure — a different and larger kind of risk than converging
file contents. Doing it as a side effect of small formatter/label fixes
would make it hard to tell "did the shared package wiring break
something" from "did the actual logic change break something."

**Recommended approach:** a dedicated Batch, isolated to just this
infrastructure: create the package, wire the build, migrate ONE
formatter behind it, verify both apps' full test suites and a live
`npm run demo` smoke test, then migrate the rest (formatters, then the
overlapping status-label domains from Candidate 2) once the plumbing
is proven.

## 4. `apps/customer`'s dual identity (staff panel + real customer portal)

**Not a code-reduction task** — a product/architecture question, not
mechanical duplication. `apps/customer`'s default routes are a second
staff/back-office panel that substantially overlaps `apps/agency`
(customers, offers, proposals, bookings, transport, Pescador, Offer &
Growth). The real customer-facing portal lives under
`/customer-portal/*` inside the same app. Documented in
`docs/AI_CONTEXT.md`; resolving it (e.g., moving the staff panel into
`apps/agency` and leaving `apps/customer` as pure customer-portal, or
an explicit decision to keep both) is a product decision for the team,
not something a reduction pass should decide unilaterally.

## 5. `docs/` root historical-wave consolidation

**Benefit:** `docs/` mixes current product docs with dozens of
numbered historical "wave"/"phase" markdown files, several with
colliding numeric prefixes across unrelated waves (e.g. three
different, unrelated `01_*.md` files). Reduces AI/human context noise
significantly.

**Risk:** medium — requires reading and classifying dozens of files to
determine which numbered docs are still-relevant history vs. safely
archivable, and where a stable "history" location should live
(`docs/archive/<wave-name>/`?). Not a mechanical dedup; needs judgment
per file.

**Recommended approach:** a documentation-focused pass, separate from
code-reduction batches, that reads each numbered doc, classifies it,
and either moves it under an explicit `docs/archive/` tree or confirms
it's still load-bearing (referenced by `AGENTS.md`'s Documentation
Rules or similar).

## 6. `route-inventory.ts` (1,771 lines)

Not investigated in depth this batch. Flagging because its size and
name suggest it may mirror `app.ts`'s route list mechanically (used by
`docs/security/route-security-inventory.md` per earlier work in this
repo's history) — worth checking whether it's generated-by-hand and
could be kept in sync with `app.ts` more cheaply, at the same time as
Candidate 1's `app.ts` decomposition (not before, since decomposing
`app.ts` will change where routes are registered).
