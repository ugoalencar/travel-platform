# `services/api/src/app.ts` Structure Map

**Update (Batch 3B, `refactor/app-ts-decomposition`):** two extraction steps
from `docs/refactoring/BATCH3B_EXTRACTION_PLAN.md` are done —
`request-parsing.ts` (step 1) and `commercial-input-parsing.ts` (step 3,
offer/proposal/sale parsers). See `docs/refactoring/APP_TS_AFTER.md` for the
current before/after state and what remains. The structure described below
is the **original, pre-extraction** map and is kept as historical baseline
for planning the remaining steps — line numbers in this document no longer
match current `app.ts`.

Factual map only — **no code was moved to produce this document**. Built by
scanning the file for route registrations (`app.get/post/patch/put/delete(...)`)
and top-level function declarations. Line numbers are as of
`chore/codebase-reduction-batch3a` (based on `main@efe409e`); they will drift
as the file changes, but the four-part structure and the domain groupings
described below are stable enough to plan against.

## Four-part structure (5,690 lines total, as of the original baseline)

| Section | Lines | What it is |
| --- | --- | --- |
| Imports & type declarations | 1–422 | All the domain-function imports (`sales.ts`, `proposals.ts`, `bookings.ts`, `financial.ts`, ...), Fastify types, plugin imports. |
| `buildApp()` | 423–2751 | **One function.** Plugin registration (CORS, Helmet, rate limiting), auth-hook wiring, then ~186 route registrations across ~20 domains (see table below), ending with a call to the *already-extracted* `registerPlatformRoutes()` (see "Precedent" below). |
| Supporting construction helpers | 2753–3433 | `createRateLimitHooks()` and similar factory/hook-builder functions used by `buildApp()`. Not route handlers. |
| Input-parsing/validation helpers | 3434–5690 | **~2,256 lines (40% of the file).** Pure functions: `parseCreateXInput`, `parseUpdateXInput`, `parseXDate`, `parseXMoney`, one small cluster per domain. No Fastify types, no I/O, no side effects — just body/query shape validation and `ValidationError` throwing. |

## Precedent already in this codebase: `platform-routes.ts`

`app.ts` already imports and calls `registerPlatformRoutes(app, database, hooks)`
and `registerPublicPlatformRoutes(...)` from `services/api/src/platform-routes.ts`
(line 361 import, line 2748 call). **Someone already extracted one domain's
routes out of this file, into its own module, registered via a plain function
call taking `(app, database, hooks)`.** This is the pattern Batch 3B should
repeat for every other domain, not invent a new one.

## Route domains inside `buildApp()` (ranked by size)

Grouped by first path segment, in the order they appear in the file. Line
ranges cover the first through last route registration for that prefix (some
domains are not perfectly contiguous — see "Interleaving" below).

| Domain (path prefix) | Routes | Approx. lines | Notes |
| --- | --- | --- | --- |
| `/financial/*` | 39 | 1914–2332 | Largest domain. Revenues, expenses, receivables, payables, payments, cash transactions, reconciliation, reports, sale financial story. |
| `/commercial/*` | 30 | 1427–1774 | Commercial Cockpit: opportunities, tasks, interactions, customer search, travel search, dashboard, pipelines. |
| `/transport/*` (routes, products, suppliers, scheduled departures) | 21 | 1034–1254 | Transportation catalog + scheduling. |
| `/customer-api/*` | 10 | 574–646 | The customer-portal-facing API surface (separate auth: `createCustomerAuthenticateHook`). |
| `/proposals/*` | 8 | 944–1023 | Includes lifecycle actions (`/send`, `/cancel`, `/accept`, `/decline`). |
| `/sales/*` | 7 | 1835–1903 | Includes `/confirm`, `/cancel`, `/mark-paid`. |
| `/publications/*` | 6 | 2470–2530 | Offer Growth publications. |
| `/pescador/*` | 6 | 2338–2382 | External-offer capture review/approval. |
| `/operations/*` + `/operational-staff` | 6 | 1343–1407 | Field operations, staff assignments. |
| `/customers/*` | 6 | 725–792 | Includes `/wishes`, `/trips` sub-resources. |
| `/campaigns/*` | 5 | 2417–2456 | Marketing campaigns. |
| `/automations/*` | 5 | 2553–2595 | Offer Growth automations. |
| `/wishes/*`, `/trips/*`, `/offers/*`, `/settings/*`, `/coupons/*`, `/bookings/*` | 4 each | scattered | Standard list/get/create/update per entity. |
| `/assets/*` | 2 | 2401–2408 | Offer Growth creative assets. |
| `/health`, `/readiness`, `/me`, `/tenant-proof`, `/engagements`, `/entitlements`, `/offer-growth`, `/platform` (call-through) | 1 each | scattered | Single-route utility/entry endpoints. |
| `/__test/*` | 2 | 2729–2733 | Test-only rollback-proof endpoint — verify this is excluded from production before touching. |

**Interleaving:** domains are not perfectly grouped in file order (e.g.
`/operational-staff` at line 1349 sits inside the `/operations` block; a few
single-route utility endpoints are scattered rather than clustered at the
top/bottom). A real extraction pass needs to re-scan each domain's exact
route list at extraction time, not just trust this table's line ranges after
any prior domain has already been moved (moving domain A shifts every line
number after it).

## Parsing-helper clusters (lines 3434–5690)

One cluster per domain, largely already grouped contiguously and named to
match: `parseOffer*` (3434–3606), `parseProposal*` (3607–3796),
`parseSale*` (3797–3956), `parseCreateReceivableInput`/`parseCreatePayableInput`/
`parseRecordPaymentInput`/`parsePaymentAllocationsInput`/
`parseCreateOperationalCostInput`/`parseCashFlowPeriod` (3957–4090, financial),
`parseCreateExternalOfferCaptureInput` (4091–4150, Pescador),
generic helpers `requireStringField`/`parseObjectBody`/`assertAllowedFields`/
`parseRequiredString`/`parseUuidParam`/`parsePositiveNumber`/
`parseNonNegativeNumber`/`parseRequiredDate` (4151–4470 — **shared across
multiple domains, extract last or keep centrally**), `parseAsset*`/
`parseCampaign*`/`parsePublication*`/`parseAutomation*`/`parseCoupon*`
(4156–4349, marketing/offer-growth), `parseRoutePoint*`/`parseRoute*`/
`parseSupplier*`/`parseTransportProduct*`/`parseScheduledDeparture*`/
`parseOperation*` (4471–5344, transport), `parseBooking*` (5345–5475),
`parseFinancialCategory*`/`parseRevenue*`/`parseExpense*`/
`parseCashTransaction*`/`parseReconciliation*` (5476–5690, financial).

This section is the **lowest-risk, highest-yield** extraction target: pure
functions, no Fastify coupling, already naturally clustered by domain, and
each cluster's consumers are exactly that domain's routes in `buildApp()`.

See `docs/refactoring/BATCH3B_EXTRACTION_PLAN.md` for the ranked plan.
