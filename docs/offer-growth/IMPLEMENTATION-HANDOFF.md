# Implementation Handoff — Offer & Growth Engine, Stream B

Synthesis of the technical preparation done in this branch
(`feature/offer-growth-preparation`, based on `origin/main` post-PR#16).
Purely technical — no product decisions were made here; where a decision was
required, it's listed under "Stream A dependencies" instead of guessed at.

## Current code map summary

See `docs/offer-growth/CURRENT-INTEGRATION-MAP.md` for the full route →
service → table → RLS → RBAC trace of Offer, CustomerInteraction,
CommercialOpportunity, Proposal, Sale, CommercialTask, Pipeline/
PipelineStage/PipelineAccess, and Customer 360. In short: everything lives
in `services/api/src/app.ts` (routes) + a handful of service files
(`offers.ts`, `commercial-cockpit.ts`, `pipeline-config.ts`,
`commercial-queries.ts`), all tenant-scoped via
`packages/domain/tenant-context.ts` + composite-FK + 4-policy RLS.

## Safe extension points

- New routes belong in `services/api/src/app.ts` next to the existing
  `/commercial/*` block (around line 1210+, after PipelineAccess routes) —
  that's the established location, not a separate router file (this repo
  doesn't have one).
- New service logic: new files under `services/api/src/`, following the
  `commercial-cockpit.ts` / `pipeline-config.ts` pattern (row-shape
  interfaces + `withTenantTransaction` + `getAgencyId()`).
- New frontend nav: `apps/customer/src/components/layout/Sidebar.tsx`'s
  `{label, to}` array + heading-div pattern (see "Frontend nav discovery" in
  the integration map) — not edited by this stream.
- New abstract types: `packages/creative-engine/` now exists with `types.ts`
  (CreativeBlock/CreativeLayout/RenderTarget), `channel.ts`
  (ChannelConnector + in-memory mock), `automation.ts` (Trigger/Action/
  ExecutionResult + mock runner) — all non-persisted, non-travel-specific,
  26 passing tests. This is a safe starting point for real implementations
  once Stream A's product model lands; it does not commit to that model.

## Likely files to modify for a future implementation

- `packages/database/schema.prisma` — add Asset, CreativeTemplate,
  Campaign, Publication, Engagement, Automation, AutomationExecution,
  Coupon, Entitlement models (see DATABASE-IMPACT-PLAN.md for the per-entity
  plan). None added here — no migration, no schema edit made.
- `infrastructure/migrations/010_*.sql` onward — **010 is the next free
  migration number**, confirmed by listing the directory on this branch
  (highest present: `009_configurable_pipelines.sql`). Re-verify at
  implementation time in case another stream lands a migration first.
- `services/api/src/app.ts` — new route blocks per new entity.
- `apps/customer/src/components/layout/Sidebar.tsx` — new "OFERTAS &
  MARKETING" nav group (see integration map for exact slot).
- A new secrets/credentials abstraction (does not exist anywhere in this
  repo today) before any real channel connector can store a token.

## Tests to preserve

- `services/api/tests/offers.test.ts` (derived-EXPIRED-status
  characterization at lines 258-285), `offer-routes.test.ts`,
  `offer-e2e.test.ts`.
- `services/api/tests/proposals.test.ts`, `proposal-routes.test.ts`,
  `proposal-e2e.test.ts`.
- `services/api/tests/sales.test.ts`, `sale-routes.test.ts`,
  `sale-e2e.test.ts`.
- `services/api/tests/commercial-cockpit-security.test.ts` (1099 lines) —
  the primary tenant-isolation/pipeline-access-denial suite; do not
  duplicate it, extend it if new commercial-cockpit behavior is added.
- `tests/security/tenant-isolation.test.ts`,
  `tenant-fastify-lifecycle.test.ts`, `tenant-repository-error-safety.test.ts`
  — untouched, still the source of truth for tenant-context behavior.
- New: `packages/creative-engine/types.test.ts`, `channel.test.ts`,
  `automation.test.ts` (26 tests total) — freeze the shape-guard and mock
  behavior added in this stream.

## Risks

- Engagement/AutomationExecution/Publication-metrics volume — no
  retention/aggregation strategy decided (DATABASE-IMPACT-PLAN.md
  "Performance discovery").
- No encrypted-secrets abstraction exists for future connector credentials
  — must be built before any real connector, not stubbed casually
  (SECURITY-THREAT-MAP.md).
- No Asset/media storage of any kind exists — this is a from-scratch build,
  not an extension of an existing pattern.
- No platform/super-admin or entitlement/feature-flag system exists — any
  plan-gated feature needs this built first, and it's more than a schema
  change (needs a decision on who administers it and how).

## Stream A dependencies (what could NOT be decided/built here)

- **What a "creative" fundamentally is**: single-purpose-per-offer artifact
  vs. reusable template vs. something else. `packages/creative-engine/types.ts`
  deliberately stayed at the CreativeBlock/CreativeLayout/RenderTarget level
  to avoid guessing this.
- **Pescador's actual capture/review/publish flow**: confirmed absent from
  runtime (see integration map); `docs/decisions/PESCADOR-READINESS.md`
  already documents prior thinking, but no schema or code was derived from
  it here — that's Stream A's call.
- **Campaign/Publication/Coupon domain shape**: only prospective, prospective
  tenant/RLS plans exist (DATABASE-IMPACT-PLAN.md); no entity was
  crystallized into schema.prisma.
- **Automation trigger/action catalog**: `automation.ts`'s `Trigger.type`/
  `Action.type` are freeform strings on purpose — no real catalog exists to
  enumerate as an enum yet.
- **Feature gating / entitlements / super-admin model**: gap stated
  honestly in the integration map; needs a product decision on who
  administers plans and how gating is enforced, not just a schema addition.
- **Frontend IA for the new nav group**: a slotting proposal was written
  (integration map, "Frontend nav discovery") but Sidebar.tsx was not
  edited — final grouping/labels are Stream A's to confirm.

## Quality baseline

See the session's gate run for exact pass/fail per command
(`npm run lint`, `typecheck`, `test`, `test:security`,
`migrations:validate`, `npx prisma validate`, `build`). Recorded as-is; no
unrelated pre-existing issue was fixed.

## Zero migrations / schema changes / merges confirmation

No file under `infrastructure/migrations/` was added or edited. No line in
`packages/database/schema.prisma` was changed. No merge, push, or PR was
performed — all commits are local to
`feature/offer-growth-preparation` in this worktree.
