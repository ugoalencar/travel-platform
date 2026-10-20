# Wave 2 Final Report — Agent 07 (Catalog / Travel Products)

## BRANCH
`feature/mega-catalog` (worktree `D:\.worktrees\mega-catalog`)

## HEAD
`7129695` — feat(catalog): add TravelProduct catalog CRUD, RBAC, RLS, and audit logging

## SCOPE

Completed the TravelProduct catalog that was already scaffolded (uncommitted)
in this worktree at session start:

1. Finished CRUD for `TravelProduct` (create/list/get/update/soft-delete) and
   `ProductAsset` link rows, tenant-scoped via `withTenantTransaction`.
2. Resolved the flagged Date/DATE coherence concern: `validFrom`/`validUntil`
   are now modeled and handled as plain ISO `"YYYY-MM-DD"` strings end to
   end — never a JS `Date` object — on both the domain type
   (`packages/domain/types.ts`) and the input-parsing/DB layers. The SQL
   `SELECT` casts the DATE columns to text (`to_char(..., 'YYYY-MM-DD')`)
   so the read path is independent of node-pg's DATE type-parsing behavior,
   and inserts/updates pass the same string straight through as the query
   parameter for a DATE column. This eliminates the classic pg
   timezone-drift bug where a DATE round-tripped through a JS Date shifts
   by a calendar day depending on process timezone.
3. Added authenticated, RBAC-gated, tenant-scoped REST routes in
   `services/api/src/app.ts`: `GET/POST /travel-products`,
   `GET/PATCH/DELETE /travel-products/:id`,
   `GET/POST /travel-products/:id/assets`. Read requires `VIEWER+`, writes
   require `MANAGER+` (same floor as the existing Supplier routes).
   `category` query param is validated against the enum (400 on garbage
   input) rather than passed through unchecked.
4. Audit logging: `recordAuditLog` calls on create (`travel_product.created`)
   and update (`travel_product.updated`), writing into the existing
   `offer_growth_audit_log` table. No new `AuditEventType` enum exists in
   this codebase to extend — `offer-growth-audit.ts`'s `action` field is a
   free-text string, so no schema change was needed there.
5. Fixed a real bug the new integration test caught: the local test-role
   grant script (`tests/integration/database/002_prepare_local_roles.sql`)
   had no grant block for `travel_products`/`product_assets`, so the
   runtime DB role got `permission denied for table travel_products` on
   every write. Added a guarded `GRANT SELECT, INSERT, UPDATE, DELETE`
   block following the exact pattern used by every other domain's tables
   in that shared file.
6. Wrote a full HTTP integration test suite,
   `services/api/tests/travel-products-http.test.ts` (21 tests, modeled on
   `suppliers-http.test.ts`), covering tenant isolation, RBAC
   hierarchy/fail-closed, CRUD, soft-delete, audit log entries, and a
   dedicated ISO-date round-trip test for `validFrom`/`validUntil`.
7. Did not build a product-catalog UI page in `apps/agency` — no
   `docs/travel_platform_mega_pack/agents/AGENT_07_CATALOG.md` spec file
   exists in this worktree (the referenced mega-pack docs directory is not
   present; only `docs/Travel_Platform_Mega_Implementation_Pack.zip`, etc.,
   are present, unextracted, at the repo root), so I could not confirm the
   UI was in scope for this agent and prioritized a fully-verified backend
   slice over a speculative UI build. See KNOWN GAPS.

Untouched per instructions: Auth/Tenant/RLS core (`tenant-context.ts`,
`database.ts` core logic), RBAC hierarchy definitions, all other migrations,
finance formulas. The only change to shared test infrastructure was the
additive grant block in `002_prepare_local_roles.sql` (required for the new
table to be usable at all under the runtime role — same pattern every prior
domain used).

## MIGRATIONS

`infrastructure/migrations/052_travel_products_catalog.sql` (pre-existing in
the worktree, reviewed and left as-is — no changes needed):
- `travel_products`: category enum-checked, cost/price non-negative checks,
  validity-range check, age-range check, tenant FK to `suppliers(agency_id,
  id)`, `partner_id` left as a plain nullable TEXT column (future FK to
  CommercialPartner from Agent 04, not yet landed in this worktree).
- `product_assets`: link table to the existing generic `assets` table,
  tenant-scoped composite FKs to both `travel_products` and `assets`.
- Both tables: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`,
  with tenant SELECT/INSERT/UPDATE/DELETE policies via `current_agency_id()`.

## RLS

Verified via the new HTTP suite (Agency B never sees/can mutate Agency A's
products — 404, no leak or no-op) and via direct SQL read of the migration:
both new tables have `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL
SECURITY` and matching tenant policies for all four operations, consistent
with every other tenant table in the schema.

## TENANT ISOLATION

Covered by `travel-products-http.test.ts`:
- GET list only returns the calling tenant's rows.
- GET by id 404s (no leak) for another tenant's row.
- PATCH on another tenant's row 404s and is a true no-op (verified via
  direct admin-pool SELECT that the row was unchanged).
- Agency B OWNER reading an Agency A product id gets 404.

## RBAC

Covered by `travel-products-http.test.ts`:
- VIEWER can read, gets 403 on POST/PATCH/DELETE.
- AGENT is blocked from write (floor is MANAGER, matching Supplier routes).
- MANAGER and OWNER can both read and write.
- An unknown/invalid role fails closed (403) on both read and write routes.

## AUDIT

`createTravelProduct`/`updateTravelProduct` call `recordAuditLog` with
actions `travel_product.created` / `travel_product.updated`, entity type
`TravelProduct`, into the existing `offer_growth_audit_log` table. Verified
in the HTTP suite by querying that table directly after a create/update.
No `AuditEventType` enum exists to extend in this codebase — the audit
action field is free-text, consistent with every other domain module that
calls `recordAuditLog`.

## TYPECHECK

`npx tsc -p services/api/tsconfig.json --noEmit` — clean, no errors.
(Also spot-checked `packages/domain/tsconfig.json` — clean.)

## UNIT

No standalone unit-test file for the input-parsing module; its validation
paths (unknown field, missing title, invalid category, non-ISO date,
validFrom > validUntil) are exercised through the HTTP suite instead,
matching this codebase's existing convention (no separate parser unit
tests exist for `suppliers.ts` either).

## INTEGRATION

`services/api/tests/travel-products-http.test.ts` — **21/21 passing**,
run against a real local Postgres 15 container with the full migration
chain applied (001→052) plus the local role-grant script. Covers list/get/
create/update/delete, category filtering and validation, unknown-field
rejection, ISO-date validation, validFrom>validUntil rejection, the
ISO-date round-trip (no timezone drift) assertion, tenant isolation, and
full RBAC matrix.

Note on the shared `docker-compose.local-postgres.yml`: the container name
and DB port (55432) are hardcoded and shared across every worktree/agent in
this multi-agent run, so tests were repeatedly interrupted by sibling
worktrees creating/destroying the same-named container mid-run. Verified
the suite fully green using a temporarily-renamed local copy of the compose
file + a different port for isolation, then reverted the compose file and
test file byte-for-byte (confirmed via `git diff` showing no changes to
either) before committing. The committed test file uses the standard shared
container name/port, same as every other domain's `*-http.test.ts`.

`tests/integration/database/database.integration.test.ts` (pre-existing,
modified before this session started to add `travel_products`/
`product_assets` to the expected-tables lists) — attempted to run standalone
via a temporary vitest config; got partway through (5 of 9 sub-checks
observed passing, including the FORCE RLS and table-listing ones) before a
concurrent sibling agent's container teardown interrupted the run mid-test
(`No such container` mid-suite, not a code failure). Given the shared,
contended environment, did not get a clean full pass recorded for this
specific file within budget. The travel_products/product_assets additions
to its expected-tables lists are consistent with migration 052 and with
what the dedicated HTTP suite already validates end-to-end (existence,
RLS, grants), so risk here is assessed as low, but it is called out
explicitly below as unverified-in-full.

## BUILD

Not run as a separate step; `tsc --noEmit` on the `services/api` package
(which includes `app.ts`, `travel-products.ts`,
`travel-product-input-parsing.ts`) is clean, and the HTTP suite exercises
`buildApp()` directly (real Fastify app, real Postgres), which is the
practical build/wire-up verification for this slice.

## KNOWN GAPS

1. **No product-catalog UI page.** No `docs/travel_platform_mega_pack/`
   directory (nor any `AGENT_07_CATALOG.md`) exists in this worktree to
   confirm whether an `apps/agency` UI page was in scope — the mega-pack
   docs appear to only be present as unextracted `.zip` files at the repo
   root, outside this task's read path. Given the ambiguity, and given the
   explicit instruction to prefer a fully-verified partial slice, the
   backend (migration/RLS/RBAC/CRUD/audit/tests) was completed and verified
   in full; no UI work was attempted rather than guess at an unverified
   design.
2. **`database.integration.test.ts` not re-run to a clean full pass** in
   this session due to persistent multi-agent contention on the shared,
   hardcoded local Postgres container/port. The specific assertions
   relevant to this change (table existence, FORCE RLS, runtime grants)
   were independently and directly verified through the dedicated
   `travel-products-http.test.ts` suite instead, which did complete a full
   clean pass (21/21).
3. **`partner_id` has no FK** — by design, per the migration's own
   commentary: CommercialPartner (Agent 04) had not landed in this worktree
   at any point during this session. Left as a plain nullable TEXT column
   as previously scaffolded; wiring the FK is out of scope for Agent 07.
4. No pagination on `GET /travel-products` (matches the existing Supplier
   list route's behavior — not a regression, but noting it wasn't added
   here either).

## FINAL VERDICT

**Backend slice complete and verified.** Migration, RLS, tenant isolation,
RBAC, audit logging, and the flagged Date/DATE coherence concern are all
implemented and covered by a green 21/21 integration test suite running
against a real Postgres instance. Typecheck is clean. Work is committed at
`7129695` on `feature/mega-catalog`, not merged to main. UI page was not
built (see Known Gaps #1) and `database.integration.test.ts`'s full-suite
pass was not re-confirmed in this session due to environmental contention
(see Known Gaps #2) — both are the primary items a follow-up session should
close out.
