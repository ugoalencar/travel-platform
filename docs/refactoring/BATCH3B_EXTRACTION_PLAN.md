# Batch 3B Extraction Plan — `app.ts` Decomposition

Ranked candidates only. **No code moved in this document's production.**
Built from `docs/refactoring/APP_TS_MAP.md`'s structural map. Batch 3B should
work through these **in order, one candidate at a time, running the full
1214+ test suite after each extraction** — not as one large mechanical pass.

Every candidate below preserves route paths, HTTP methods, RBAC
(`requireRole`), and tenant-context behavior exactly as-is: this is a *file
organization* change, not a behavior change. `services/api/tests/*.test.ts`
exercise the actual HTTP surface (via `app.inject`), so a correct extraction
should require zero test-file changes — if a test needs to change, that is
itself a signal the extraction altered behavior.

## Recommended order

### 1. Generic request-parsing helpers → `services/api/src/request-parsing.ts`

**Risk: LOW.** **Do this first** — every later domain extraction imports
these, so extracting them after a domain would mean re-touching that domain's
new file.

- **Current lines:** 4151 (`requireStringField`), 4350–4400
  (`parseObjectBody`, `assertAllowedFields`, `parseRequiredString`,
  `parseUuidParam`, `parsePositiveNumber`, `parseNonNegativeNumber`), 4407
  (`parseRequiredDate`).
- **Domain:** none — generic body/param validation used across every
  domain (`parseRequiredString`: 79 call sites, `parseObjectBody`: 24,
  `assertAllowedFields`: 8).
- **Dependencies:** only `ValidationError` from `./errors`. No Fastify
  types, no domain imports.
- **Security sensitivity:** none directly, but many domain input parsers
  rely on `assertAllowedFields` to reject unknown fields (mass-assignment
  protection) — verify each domain's parser still calls it with the exact
  same allow-list after the move.
- **Tests protecting it:** indirectly, every `*-routes.test.ts`/
  `*-http.test.ts` file that asserts `400 VALIDATION_ERROR` on bad input.
- **Proposed destination:** new `services/api/src/request-parsing.ts`.
- **Expected LOC moved:** ~260.
- **Rollback:** revert the one commit; these functions have no other
  dependents yet at this point in the plan.

### 2. Financial parsing helpers → merge into `services/api/src/financial.ts`

**Risk: LOW.**

- **Current lines:** 3957–4090 (receivables/payables/payments/allocations/
  operational-cost/cash-flow-period), 5476–5690 (financial
  category/revenue/expense/cash-transaction/reconciliation).
- **Domain:** financial (39 routes at 1914–2332 depend on these).
- **Dependencies:** step 1's shared parsers; domain types from
  `packages/domain/types`.
- **Security sensitivity:** none beyond standard input validation; this is
  the domain the Local Business Simulation's Mariana/Cancún characterization
  covers most heavily — run `services/api/tests/financial*.test.ts` and
  `demo-seed-stability.test.ts` immediately after this step, not just at
  the end of the batch.
- **Tests protecting it:** `financial.test.ts`, `financial-http.test.ts`
  (213 assertions per Task 4/7 history), `demo-seed-stability.test.ts`.
- **Proposed destination:** `services/api/src/financial.ts` already exists
  and already owns the financial domain functions (`getSaleFinancialStory`,
  etc.) — append the parsers there rather than creating a new file.
- **Expected LOC moved:** ~250.
- **Rollback:** revert the one commit.

### 3. Offer / Proposal / Sale parsing helpers → their existing domain files

**Risk: LOW.**

- **Current lines:** 3434–3606 (offers), 3607–3796 (proposals), 3797–3956
  (sales).
- **Domain:** commercial (offers/proposals/sales routes at 898–1023,
  1835–1903).
- **Dependencies:** step 1's shared parsers.
- **Security sensitivity:** none beyond standard validation.
- **Tests protecting it:** `offer-routes.test.ts`, `proposal-routes.test.ts`,
  `sale-routes.test.ts` (recently extended in Batch 2's merge history with
  `customerName` assertions — a good regression signal if this extraction
  breaks anything).
- **Proposed destination:** `services/api/src/offers.ts`,
  `proposals.ts`, `sales.ts` (all three already exist as domain-function
  files; append their respective parsers).
- **Expected LOC moved:** ~525 combined.
- **Rollback:** revert the one commit; each domain can be reverted
  independently if done as 3 separate commits (recommended).

### 4. Booking parsing helpers → `services/api/src/bookings.ts`

**Risk: LOW.**

- **Current lines:** 5345–5475.
- **Domain:** bookings (1279–1313).
- **Tests protecting it:** `bookings.test.ts`, `bookings-http.test.ts`
  (extended in Batch 2's history with `customerName` assertions).
- **Proposed destination:** `services/api/src/bookings.ts`.
- **Expected LOC moved:** ~130.

### 5. Transport parsing helpers → `services/api/src/transport-*.ts`

**Risk: MEDIUM** — largest single cluster (~875 lines) and the routes
themselves (21, at 1034–1254) already span multiple existing files
(`transport-operations.ts` plus route-point/product/supplier concerns not
yet confirmed to have their own files — verify before starting).

- **Current lines:** 4471–5344 (route points, routes, suppliers, transport
  products, scheduled departures, operations).
- **Dependencies:** step 1's shared parsers; likely also
  `transport-operations.ts`'s existing types.
- **Security sensitivity:** none beyond standard validation.
- **Tests protecting it:** `transport-routes.test.ts`,
  `transport-routes-http.test.ts`, `transport-products.test.ts`,
  `transport-products-http.test.ts`, `transport-operations.test.ts`,
  `transport-operations-http.test.ts`, `route-points.test.ts`,
  `route-points-http.test.ts`, `suppliers.test.ts`, `suppliers-http.test.ts`,
  `scheduled-departures.test.ts`, `scheduled-departures-http.test.ts` — 12
  test files, the widest blast radius of any candidate here. Consider
  splitting this into 2–3 sub-steps (route points+routes, then
  suppliers+products, then scheduled-departures+operations) rather than
  one commit.
- **Proposed destination:** confirm exact existing file boundaries first
  (this map did not verify whether route-points/routes/suppliers/products
  already have dedicated domain files or currently live only inline via
  `app.ts` imports) before picking destinations.
- **Expected LOC moved:** ~875.

### 6. Marketing/Offer-Growth parsing helpers → their domain files

**Risk: LOW-MEDIUM.**

- **Current lines:** 4091–4150 (Pescador external capture), 4156–4349
  (assets, campaigns, publications, automations, coupons).
- **Domain:** Pescador (2338–2382), campaigns (2417–2456), publications
  (2470–2530), automations (2553–2595), coupons (2649–2674), assets
  (2401–2408).
- **Tests protecting it:** `pescador-http.test.ts` and the corresponding
  domain test files for each (verify exact names at extraction time).
- **Proposed destination:** likely several small existing files
  (`campaigns.ts`? `automations.ts`? `coupons.ts`? — confirm they exist
  before extraction; `automations.ts` was seen in the large-file audit at
  700 LOC, suggesting a domain file already exists to receive its parsers).
- **Expected LOC moved:** ~260.

### 7. Route registrations by domain (the routes themselves, not just parsers)

**Risk: MEDIUM–HIGH**, and **should only start after steps 1–6 land** (so
each domain's route-registration function can import its own
already-extracted parsers directly, rather than reaching back into `app.ts`).

Follow the exact precedent already in this codebase:
`registerPlatformRoutes(app, database, hooks)` in `platform-routes.ts`.
For each domain, create `register<Domain>Routes(app, database, hooks)` in
that domain's existing file, move its route registrations verbatim (same
`preHandler`, same `requireRole` calls, same response shapes), and replace
the inline block in `buildApp()` with one function call — mirroring line
2748's existing `registerPlatformRoutes(app, options.database,
platformProtectedHooks);` call exactly.

Suggested extraction order (smallest/most isolated first, to prove the
pattern before tackling the two largest domains):

1. `/customer-api/*` (10 routes, separate auth already — lowest coupling
   with the rest of `buildApp()`)
2. `/pescador/*`, `/campaigns/*`, `/publications/*`, `/automations/*`,
   `/coupons/*`, `/assets/*` (marketing/offer-growth cluster, 28 routes
   combined, likely low cross-domain coupling)
3. `/bookings/*`, `/sales/*`, `/proposals/*`, `/offers/*`, `/wishes/*`,
   `/trips/*`, `/customers/*` (commercial-adjacent entities, 41 routes)
4. `/transport/*`, `/operations/*` (27 routes — highest test-file count,
   do last among the "medium" domains so the extraction pattern is
   well-proven by the time you reach it)
5. `/commercial/*` (30 routes — Commercial Cockpit, second-largest domain)
6. `/financial/*` (39 routes — **largest domain, do last**: highest
   business-criticality, and the Mariana/Cancún characterization scenario
   exercises it most directly)

**Rollback strategy for every step in this section:** each domain's
extraction is one commit; revert restores the inline block in `app.ts`
verbatim (git history has it) and deletes the new `register<Domain>Routes`
function. Because `buildApp()`'s route registration order matters only
insofar as it doesn't currently encode any ordering dependency between
domains (verify this holds — search for any route that reads state set by
an earlier route registration in the same request lifecycle; none were
found in this pass, but re-verify before extracting), reverting one domain
should never require reverting another.

## Explicitly out of scope for Batch 3B

- `route-inventory.ts` (1,771 lines) — **security-relevant, not just
  documentation**: a manifest of every route's security classification
  (`registerRoute`/`RouteClassification`), consumed by
  `services/api/tests/sec-a-api-exposure.test.ts` to verify every route in
  `app.ts` is explicitly classified (file header: "Generated from app.ts
  audit. Any new routes must be added here... The default is
  DENY/REQUIRE_AUTH"). It is not imported by `app.ts` itself (no runtime
  coupling), but treat it as security-adjacent: do not touch until after
  `app.ts`'s route registrations are extracted (step 7 above), update it
  in the same commit as each domain's route move, and re-run
  `sec-a-api-exposure.test.ts` after every single domain extraction, not
  just at the end of the batch.
- Auth/RBAC/RLS/tenant/MFA/CAPTCHA/rate-limit/audit logic itself — none of
  the candidates above touch these; they are pure file-organization moves
  of route registration and input parsing. If any extraction step turns
  out to require touching one of these, stop and treat it as a separate,
  security-reviewed task.
