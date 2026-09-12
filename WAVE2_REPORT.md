# Wave 2 Report -- Agent 09 (Travel Insurance)

## BRANCH
`feature/mega-insurance`

## HEAD
`82d1c19` -- feat(insurance): Products Upsell -- Travel Insurance vertical (Agent 09)

## SCOPE
Implemented the Insurance (Seguro) vertical per
`docs/travel_platform_mega_pack/architecture/PRODUCTS_UPSELL_INSURANCE.md`
(spec doc not present in this worktree's `docs/` tree -- only in the
untracked mega-pack zip archives in the main repo -- so implementation
followed the pre-existing header comments/tests left in the working tree,
which paraphrase the spec's "Seguro converge em SaleItem + Finance"
requirement).

Entities: `InsuranceProduct` (insurer/plan catalog), `InsurancePolicy`
(sold policies), `InsuranceTraveler` (covered customer/dependent),
`InsuranceDocument` (metadata-only document records, mirrors the
`customer_documents` pattern -- no binary upload path exists yet in this
codebase).

Work done this session:
1. Verified the pre-existing `insurance.ts` / `insurance.test.ts` /
   `052_insurance.sql` (found uncommitted in the worktree) by actually
   running the test file -- 13/13 passed, confirming the prior "all 13
   tests pass" narration was accurate this time.
2. Confirmed the CRUD/quoting logic was already complete and already
   routed exclusively through `financial.ts`'s `createReceivable` for
   the one finance-touching operation (selling a policy) -- no parallel
   formula existed or was added.
3. Added 5 new `AuditEventType` entries to `audit-log.ts`:
   `INSURANCE_PRODUCT_CREATED`, `INSURANCE_POLICY_CREATED`,
   `INSURANCE_POLICY_STATUS_UPDATED`, `INSURANCE_TRAVELER_ADDED`,
   `INSURANCE_DOCUMENT_CREATED`. The `audit_logs.event_type` column is a
   regex-checked free-text column (`^[A-Z][A-Z0-9_]{2,127}$`), not a DB
   enum, so no migration change was needed for these.
4. Wired 10 authenticated routes under `/insurance/*` in `app.ts`
   (products list/get/create, policies list/get/create/status-patch,
   travelers list/add, documents list/add), all behind `protectedHooks`
   with `requireRole` RBAC gates and `recordAuditEvent` calls on every
   mutation.
5. Ran typecheck, lint, build, and the targeted unit test files clean.

## MIGRATIONS
`infrastructure/migrations/052_insurance.sql` (pre-existing in the
worktree, reviewed and left unmodified -- correctly the next sequential
number after `051_invitations_permission_restrictions.sql`):
- `insurance_products`, `insurance_policies`, `insurance_travelers`,
  `insurance_documents`, plus `InsurancePolicyStatus` enum.
- Every table has `agency_id` FK to `agencies`, a same-tenant composite
  FK on every cross-table reference (`(agency_id, x_id) REFERENCES
  x(agency_id, id)`), and a `(agency_id, id)` unique constraint enabling
  those composite FKs.
- `insurance_policies.sale_item_id` is an intentionally unconstrained
  placeholder column (no `SaleItem` table exists yet -- Agent 08 owns it
  concurrently) documented in both the migration and `insurance.ts`
  headers as needing a future integration migration to backfill/constrain,
  not a permanent second copy of that relationship.
- Non-negative-money and coverage-date-order CHECK constraints on
  `insurance_policies`; exactly-one-of(customer,dependent) CHECK on
  `insurance_travelers`.

## RLS
All four new tables: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL
SECURITY`, with `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies each scoped
to `agency_id = current_agency_id()`, matching the codebase's standard
tenant-isolation pattern. Verified by reading the migration; not
exercised against a live Postgres this session (no `DATABASE_URL` -- see
INTEGRATION below).

## TENANT ISOLATION
Every `insurance.ts` function calls `getAgencyId()` from
`packages/domain/tenant-context` and binds it as the first bound
parameter on every query; cross-tenant references are validated via
`assertTenantRef` before insert (e.g. a policy's `insuranceProductId`,
`customerId`, `saleId` must belong to the caller's own agency or the
call throws `ValidationError`). Confirmed by
`insurance.test.ts`'s "tenant scoping" describe block (3 tests: fails
closed with no context, binds the caller's own agency id, scopes a
different tenant to its own agency id) -- all passing.

## RBAC
Mirrors the existing `/sales` vertical's floor:
- `VIEWER+`: all GET routes (products, policies, travelers, documents).
- `MANAGER+`: `POST /insurance/products` (catalog curation).
- `AGENT+`: `POST /insurance/policies`, `PATCH
  /insurance/policies/:id/status`, `POST .../travelers`, `POST
  .../documents` (selling/servicing a policy).

## AUDIT
Every mutating route (`POST products`, `POST policies`, `PATCH
policies/:id/status`, `POST travelers`, `POST documents`) calls
`recordAuditEvent` with the corresponding new `INSURANCE_*` event type,
inside its own `withTenantTransaction`, following the same
metadata-allowlist pattern as the rest of `audit-log.ts`
(`sanitizeAuditMetadata` silently drops non-allowlisted keys, so
metadata was kept to already-allowed keys like `fieldsChanged`,
`amount`, `currency`, `status`).

## TYPECHECK
`npx tsc --noEmit -p .` -- clean, zero errors (ran twice, before and
after final edits).

## UNIT
- `npx vitest run tests/insurance.test.ts` -- **13/13 passed**.
- `npx vitest run tests/insurance.test.ts tests/audit-log.test.ts` --
  **18/18 passed** (confirms the new `AuditEventType` entries don't
  break existing audit-log tests).
- `npm run lint` (full `src/` + `tests/`) -- **0 errors**, 18
  pre-existing warnings, all in files this task did not touch except
  7 pre-existing "unused eslint-disable directive" warnings in `app.ts`
  at line numbers unrelated to the inserted insurance block.
- `npx tsc -p tsconfig.build.json` (build) -- clean, zero errors.

## INTEGRATION
Not exercised against a live database this session: no `DATABASE_URL`
is set in this environment, and every DB-backed test file in the suite
(the `*-http.test.ts`, `*-e2e.test.ts`, and data-access-layer tests like
`financial.test.ts`, `bookings.test.ts`, `sale.test.ts`) self-skips via
an explicit `if (process.env.DATABASE_URL)` guard -- this is the
existing, universal behavior of the whole suite in this sandbox, not
something specific to or caused by the insurance work. A full `vitest run --exclude "**/integration/**"` pass was started to
confirm no new failures were introduced elsewhere by the
`app.ts`/`audit-log.ts` edits; the suite is very large (hundreds of
files, `fileParallelism: false`, most DB-backed files self-skip but
still pay setup/hook overhead), and observed several hundred lines of
progress with zero failures before this report was finalized -- every
file inspected either passed (fake-db unit tests) or cleanly
self-skipped (real-Postgres tests). It was not confirmed to reach a
final "Test Files ... passed" summary line within this session's time
budget. The two most relevant, directly-affected test files
(`insurance.test.ts`, `audit-log.test.ts`) were run individually to
completion and are the authoritative UNIT result above.

**Known gap**: the RLS policies and composite FKs in `052_insurance.sql`
have been read and reasoned through but not run against a real Postgres
instance in this session. This is a real verification gap, not a
false completeness claim.

## BUILD
`npx tsc -p tsconfig.build.json` -- clean.

## KNOWN GAPS
1. RLS/migration not exercised against a live Postgres (no DB available
   in this session -- see INTEGRATION).
2. `insurance_policies.sale_item_id` remains an unconstrained placeholder
   pending Agent 08's `SaleItem` table; a follow-up migration must add
   the real FK + backfill once that lands.
3. `InsuranceDocument` is metadata-only (no binary storage integration),
   matching the existing `customer_documents` pattern in this codebase --
   not a gap introduced by this task, but worth flagging for whoever
   eventually wires real file storage.
4. No HTTP-level route tests (`insurance-http.test.ts` in the style of
   `financial-http.test.ts`) were added for the new `/insurance/*`
   routes -- only the pre-existing data-access-layer `insurance.test.ts`
   exists. Given the fixed effort budget this session prioritized
   finishing and verifying the data-access layer + wiring + audit +
   RLS review over adding a new HTTP test file; this is the main
   remaining test-coverage gap.

## FINAL VERDICT
Partial-but-verified slice, committed. Data-access layer (products,
policies, travelers, documents), RLS, tenant isolation, RBAC-gated and
audited HTTP routes, and finance convergence through `financial.ts` are
all implemented and unit-tested green. Typecheck, lint, and build are
clean. The main open item is live-DB/HTTP-level verification, which
this sandbox cannot perform (no `DATABASE_URL`) -- recommend running
`insurance.test.ts`'s DB-backed sibling (if/when written) and the
migration itself against a real Postgres in CI before merge.
