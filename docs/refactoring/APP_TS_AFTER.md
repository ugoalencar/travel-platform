# `app.ts` Decomposition — Current State (Batch 3B)

Branch: `refactor/app-ts-decomposition`, based on `main@261b945`.

**This batch is a partial, verified first wave — not a completed
decomposition.** Two of the ~7 steps ranked in
`docs/refactoring/BATCH3B_EXTRACTION_PLAN.md` are done, each individually
tested (full API + security suites) and committed. The remaining steps
(financial parsers, transport parsers, marketing/offer-growth parsers, and
all route-module extraction) were deliberately not attempted in this pass —
see "What remains" below.

## BEFORE

- `app.ts`: 5,690 lines. Responsibilities: plugin registration, auth-hook
  wiring, ~186 route registrations across ~20 domains, and ~2,256 lines of
  input-parsing/validation helpers for every domain.
- No dedicated parsing modules; every domain's `parseCreateXInput` lived
  inline in `app.ts`.

## AFTER (this batch)

- `app.ts`: 5,124 lines (-566 net from the two extractions below; some
  growth from added `export` keywords and doc comments in the new files
  offsets part of the raw line count moved).
- Two new modules:
  - **`services/api/src/request-parsing.ts`** (80 lines) — generic,
    domain-agnostic body/param parsers: `parseObjectBody`,
    `assertAllowedFields`, `parseRequiredString`, `requireStringField`,
    `parseUuidParam`, `parsePositiveNumber`, `parseNonNegativeNumber`,
    `parseRequiredDate`. Every other domain's parsers (extracted or still
    in `app.ts`) depend on these — extracted first per the plan's own
    ordering.
  - **`services/api/src/commercial-input-parsing.ts`** (518 lines) — the
    offer/proposal/sale parsing cluster: `parseOfferDate`,
    `parseOfferPrice`, `parseCreateOfferInput`, `parseUpdateOfferInput`,
    `parseProposalDate`, `parseProposalMoney`, `parseCreateProposalInput`,
    `parseUpdateProposalInput`, `parseSaleMoney`, `parseCreateSaleInput`,
    `parseUpdateSaleInput`, plus their private field-allowlist constants.
    Kept as one file (not three) because the three sub-domains form one
    funnel (offer → proposal → sale), the combined block was small (505
    lines in `app.ts`), and their functions call into each other across
    sub-domain boundaries.
- `app.ts`'s route registrations (`buildApp()`) are **unchanged** — every
  route still lives inline, at the same relative order, calling into the
  now-imported parser functions exactly as before.

## Dependency direction

```
app.ts (routes)
  ├── imports from commercial-input-parsing.ts (offer/proposal/sale parsers)
  │     └── imports from ./errors, and types from ./offers, ./proposals, ./sales
  └── imports from request-parsing.ts (generic parsers)
        └── imports from ./errors only
```

No circular dependencies were introduced (`request-parsing.ts` and
`commercial-input-parsing.ts` do not import from `app.ts`, and
`commercial-input-parsing.ts` does not import from `request-parsing.ts` —
each extracted domain's parsers were self-contained enough not to need the
other yet; a later extraction of, say, financial parsers would likely want
to import from `request-parsing.ts` too, which is fine and expected).

## What remains (see `BATCH3B_EXTRACTION_PLAN.md` for full detail)

Not started in this batch, in the plan's recommended order:

1. Financial parsing helpers (into `financial.ts`) — **intentionally last
   among parser extractions**, per this batch's explicit instruction to
   keep the domain most sensitive to the Mariana/Cancún characterization
   for its own dedicated, extra-careful pass.
2. Booking parsing helpers (into `bookings.ts`).
3. Transport parsing helpers (route points/routes/suppliers/products/
   scheduled departures/operations) — flagged MEDIUM risk, 12 test files,
   recommend splitting into 2–3 sub-steps.
4. Marketing/Offer-Growth parsing helpers (Pescador, campaigns,
   publications, automations, coupons, assets).
5. All route-module extraction (`register<Domain>Routes(app, database,
   hooks)`, following the `platform-routes.ts` precedent) — explicitly
   deferred until *after* all parser extractions land, so each domain's
   route module can import its own already-extracted parsers directly.
   Financial routes (39, the largest domain) should be the very last
   route-module extraction for the same reason as its parsers.

`app.ts` today is still primarily route registration plus the remaining
~1,750 lines of un-extracted parsers (financial, booking, transport,
marketing/offer-growth) — not yet the "provider construction + security
middleware + domain route registration" composition shape described as
the eventual target in `BATCH3B_EXTRACTION_PLAN.md`'s Phase 7. Reaching
that shape requires the route-module extraction step, which this batch did
not attempt.

## Verification performed for this batch's two steps

- `npm --workspace @travel-platform/api run typecheck`: PASS after each step.
- `npm --workspace @travel-platform/api run lint`: PASS after each step
  (0 errors; caught and fixed 6 real unused-import errors after step 2).
- `npm --workspace @travel-platform/api run test`: PASS after each step
  (67 files, 1214 tests, both times).
- `npm run test:security`: PASS after each step (52/52, both times).
- Full monorepo `npm run test` re-run at the end of the batch hit two
  environment-flaky failures (a mid-run Docker interruption causing
  "Connection terminated unexpectedly" in `proposal-e2e.test.ts` and
  `sale-routes.test.ts`'s `resetDatabase`, plus a 1ms timing flake in
  `transport-operations-http.test.ts`, a domain this batch never touched)
  — both files re-run individually afterward and passed clean (2/2 files,
  29/29 and 52/52 tests respectively).
- Live `npm run demo` + Mariana/Cancún characterization: PASS (proposal
  shows "Mariana Alves Silva" and "Aceita", sale detail and financial
  story both show gross R$18.000 / received R$6.000 / receivable
  R$12.000 / margin R$4.000, zero console/network errors). Agency,
  Customer, Marketing, and Platform Admin all smoke-tested at 200.
