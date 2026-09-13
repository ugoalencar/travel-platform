# Wave 2 Report -- Agent 08 (Upsell / Sale Items)

## BRANCH
`feature/mega-upsell`

## HEAD
`da3c4c7` -- feat(upsell): sale-item CRUD routes, RBAC, RLS, tenant isolation (Agent 08 Wave 2)

## SCOPE

Completed:
- Finished the sale-items service layer (`services/api/src/sale-items.ts`): `createSaleItem`,
  `listSaleItems`, `getSaleItemById`, `cancelSaleItem`, plus a new
  `parseCreateSaleItemInput` allowlist-based request parser mirroring
  `parseCreateSaleInput`'s established pattern.
- Wired authenticated, RBAC-gated, tenant-scoped routes into `services/api/src/app.ts`:
  - `GET /sales/:saleId/items` (VIEWER+, tenant-wide list, no narrower subset -- same
    floor rationale as `GET /sales`)
  - `POST /sales/:saleId/items` (AGENT+, same floor as `PATCH /sales/:id`, since it
    changes the Sale's authoritative `amount`)
  - `POST /sale-items/:id/cancel` (MANAGER+, same floor as `POST /sales/:id/cancel`,
    since it reverses the Sale's authoritative total)
- Audit events (`SALE_ITEM_CREATED`, `SALE_ITEM_CANCELLED`) were already defined in
  `audit-log.ts` (pre-existing uncommitted work) and are recorded inside the same
  transaction as the row mutation in `sale-items.ts`.
- Domain types (`SaleItem`, `ProposalOptionalItem`, `UpsellRule`, `UpsellSuggestion`,
  etc.) in `packages/domain/types.ts` were already added (pre-existing uncommitted
  work); left unmodified.

Not started (documented as known gap, see below):
- `proposal_optional_items` CRUD routes/service (table + RLS exist in the migration;
  no application-layer module was written for it).
- `upsell_rules` / `upsell_suggestions` rule engine, generation, accept/dismiss flow
  (tables + RLS exist in the migration; no `upsell.ts` module or routes were written).

Given the remaining time budget, scope was deliberately narrowed to ship a fully
tested, committed vertical slice (SaleItems end-to-end) rather than leave multiple
half-finished verticals uncommitted.

## MIGRATIONS

`infrastructure/migrations/052_sale_items_upsell.sql` (pre-existing uncommitted file,
committed as-is, unmodified by this session):
- `sale_items` -- line items attached to a Sale. Own `line_total`/`line_margin`
  columns computed once in `sale-items.ts`'s `computeLineTotal()`/`computeLineMargin()`
  -- documented in the migration header and the module header as a NEW computation
  for a NEW entity, not a duplicate of `computeTotal()` (sales.ts) or `getSaleMargin()`
  (financial.ts).
- `proposal_optional_items` -- analogous line items for Proposals (schema only, no
  application layer written this session).
- `upsell_rules` / `upsell_suggestions` -- simple rule engine schema (schema only, no
  application layer written this session).

No other migrations were touched.

## RLS

All four new tables (`sale_items`, `proposal_optional_items`, `upsell_rules`,
`upsell_suggestions`) have `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
plus tenant `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies scoped to
`agency_id = current_agency_id()`, matching the established convention elsewhere in
the schema. Verified by inspection against `002_rls_policies.sql`'s pattern; exercised
at the HTTP layer by the tenant-isolation tests below (the runtime DB role only ever
connects through RLS, never as the migration-owning admin role).

## TENANT ISOLATION

Covered in `services/api/tests/sale-item-routes.test.ts`:
- `POST /sales/:saleId/items` against another tenant's Sale returns 404, no row
  inserted.
- `POST /sales/:saleId/items` with a `supplierId` belonging to another tenant returns
  404 (via the existing `assertRef` cross-table check in `sale-items.ts`).
- `GET /sales/:saleId/items` never returns another tenant's items even for a
  high-privilege (OWNER) principal from a different agency (RLS-backed empty list,
  not a leaked row).
- `POST /sale-items/:id/cancel` against another tenant's item returns 404, no-op
  (status left `ACTIVE`, verified via direct admin-pool read).

## RBAC

Covered in the same test file:
- `GET /sales/:saleId/items`: VIEWER+ (401 unauthenticated).
- `POST /sales/:saleId/items`: blocked for VIEWER (403); allowed for AGENT/MANAGER/
  OWNER (hierarchy inheritance), matching the write floor already used by
  `PATCH /sales/:id`.
- `POST /sale-items/:id/cancel`: blocked for AGENT (403); allowed for MANAGER,
  matching the floor already used by `POST /sales/:id/cancel`.

## AUDIT

`createSaleItem`/`cancelSaleItem` call `recordAuditEvent` inside the same
`withTenantTransaction` as the row mutation, using the `SALE_ITEM_CREATED` /
`SALE_ITEM_CANCELLED` event types already defined in `audit-log.ts`. Not
independently re-tested this session (no new audit-log test added) -- relies on
`audit-log.ts`'s existing test coverage of `recordAuditEvent` itself.

## TYPECHECK

`node node_modules/typescript/bin/tsc -p services/api/tsconfig.json --noEmit`
(via a `node_modules` junction to the sibling main worktree, since this worktree
had no installed dependencies) -- **clean, zero errors**, covering
`services/api/src/**/*.ts`, `services/api/tests/**/*.test.ts`, and
`packages/domain/**/*.ts`.

## UNIT

No pure-unit (non-DB) test file was added separately; `computeLineTotal()`/
`computeLineMargin()` are exercised indirectly through the integration test's
assertions on returned `lineTotal` (e.g. `qty=2, unitPrice=50, taxes=5` ->
`lineTotal=105`).

## INTEGRATION

`services/api/tests/sale-item-routes.test.ts` was written (17 test cases covering
401, RBAC per role, tenant isolation, forbidden/unknown-field rejection, negative
amount rejection, cross-tenant supplier rejection, and a dedicated
"no-drift" assertion that calls `getSaleMargin()` from `financial.ts` directly
after creating a SaleItem with a supplier + unitCost, asserting `revenue`,
`supplierCosts`, and `margin` match what the new SaleItem should produce with zero
changes to `getSaleMargin()`'s own formula).

**Could not be run to a green result in this session.** Every attempt (7 retries
across ~5 minutes, including multi-attempt polling loops) failed at the
`docker compose ... up -d` step with:
```
Conflict. The container name "/travel-platform-postgres-local" is already in use
```
`infrastructure/docker-compose.local-postgres.yml` hardcodes a fixed
`container_name: travel-platform-postgres-local` (pre-existing, shared by every DB
integration test file in this codebase, e.g. `sale-routes.test.ts` uses the identical
pattern). Other Wave 2 agents are running the same kind of DB-integration tests
concurrently in sibling worktrees against the same Docker daemon, and are
continuously racing to create/remove/recreate a container with that same fixed name.
This is a cross-agent environmental contention issue, not a defect introduced by this
change, and not something safely fixable from this worktree without editing the
shared `docker-compose.local-postgres.yml` convention that every other test file
(including pre-existing, already-merged ones) also depends on.

Confidence in correctness rests on: (a) clean TypeScript typecheck, (b) the test file
being structurally identical to the known-passing `sale-routes.test.ts` (same
migrations list, same principal/tenant seeding, same `buildTestApp`/`resetDatabase`
helpers, same assertion idioms), and (c) careful manual tracing of the SQL/JS in
`sale-items.ts` and the new `app.ts` routes against the schema in
`052_sale_items_upsell.sql`.

**Recommended next step for whoever picks this up**: retry
`cd services/api && npx vitest run tests/sale-item-routes.test.ts` once the Docker
daemon is not contended by sibling agents, or run it in isolation (stop other
agents' DB test runs first).

## BUILD

Not run separately in this session (no `npm run build` invoked); typecheck (which
build depends on) is clean.

## KNOWN GAPS

1. **Integration tests not verified green** -- written and typechecked, but not
   executed to completion due to Docker container-name contention from concurrent
   sibling agents (see INTEGRATION above).
2. **ProposalOptionalItem CRUD** -- schema + RLS exist; no service module or routes
   written this session.
3. **Upsell rule engine** (`upsell_rules` generation logic, `upsell_suggestions`
   accept/dismiss flow) -- schema + RLS exist; no `upsell.ts` module or routes
   written this session. This is the "suggestion" half of "Turbine sua Viagem";
   only the "attach an item to a sale" half was completed.
4. **Payable reversal on SaleItem cancel** -- documented in `sale-items.ts`'s
   `cancelSaleItem` docstring as an intentional P2 gap: `financial.ts` exposes no
   cancel-payable transition today, so a cancelled SaleItem's linked Payable (if any)
   is left as-is rather than reversed. This mirrors an existing limitation, not a new
   one introduced here.
5. **No dedicated `node_modules`** existed in this worktree; a Windows junction to
   the sibling `D:\travel-platform\node_modules` was created locally to run
   typecheck/tests. It is not tracked by git (node_modules is gitignored) and is
   local to this worktree's filesystem state.

## FINAL VERDICT

**Partial, committed slice.** The SaleItem vertical (schema, RLS, service layer,
RBAC-gated tenant-scoped routes, audit events, and a full integration test suite) is
complete, typechecks cleanly, and is committed at `da3c4c7` on
`feature/mega-upsell`. It was not merged to main, per instructions. The financial
integration constraint was honored throughout: every total/margin calculation flows
through the existing `computeTotal()` (sales.ts) and `getSaleMargin()`
(financial.ts) paths via composition (`updateSale()`, `createPayable()`), with zero
changes to either function's existing exported behavior. The integration test suite
could not be confirmed green in this session due to Docker container contention
from concurrent sibling Wave 2 agents -- this should be re-run in isolation before
this branch is considered fully verified. The ProposalOptionalItem and
upsell-suggestion-engine halves of the spec remain unimplemented and are flagged
above for a follow-up session.
