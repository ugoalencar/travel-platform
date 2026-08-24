# Architectural Findings Registry

Consolidated, living registry of open architectural findings and decisions
that are **known and tracked but not yet resolved**. This is a status
tracker, not a place to resolve anything — each entry below records current
real state and what is blocking it. Detailed per-topic discovery is kept in
its own file and linked from here; this registry does not duplicate that
detail.

Last updated: 2026-08-24, against `origin/main` (verified via `git fetch`)
plus explicitly-labeled unmerged branches.

---

## ARCH-CUSTOMER-APP-01 — `apps/customer` contains two products

**Status:** OPEN — recorded, not resolved.

**Full detail:** `docs/adr/ARCH-CUSTOMER-APP-01-findings.md` (original
finding + impact analysis, not duplicated here).

**Summary:** `apps/customer` contains both the staff/admin app and the
`customer-portal` route tree in one Vite app, one build, one deployment.
Recommendation on file (not executed): split into `apps/agency`,
`apps/customer` (portal only), `apps/operations` (Field Operations). No code
has moved. Confirmed still true against `origin/main` as of this pass —
`apps/customer/src/customer-portal/CustomerPortalShell.tsx` still lives
alongside the staff `src/pages/*` tree in the same package.

---

## D2 — Driver/Guide operational identity

**Status:** UNDECIDED.

**Full detail:** `docs/decisions/D2-DRIVER-GUIDE-DISCOVERY.md`.

**Current real state:** No dedicated driver/guide model exists.
`OperationCheckpoint` confirmations and `TransportOperation` creation are
attributed only to whichever `User` (staff role) performs the action via
the existing RBAC (`OWNER`/`ADMIN`/`MANAGER`/`AGENT`/`VIEWER` — see
`UserRole` enum in `packages/database/schema.prisma`). There is no
assignment relation between a driver/guide and a `ScheduledDeparture` or
`TransportOperation` — any authorized staff user can act on any operation
in the agency.

**Blocking:** No decision yet on whether to extend `User`, add a
Staff/Profile record, or introduce a dedicated operational-identity model.

---

## D3 — Booking cancellation

**Status:** UNDECIDED.

**Full detail:** `docs/decisions/D3-BOOKING-CANCELLATION-DISCOVERY.md`.

**Current real state:** `Booking.cancelled` and `ScheduledDeparture.cancelled`
booleans exist in schema (`packages/database/schema.prisma` lines 598, 568).
`services/api/src/bookings.ts` exports only `listBookings`,
`getBookingById`, `createBooking` — no update/cancel endpoint of any kind.
No partial (per-passenger) cancellation exists. No capacity-release logic
runs on cancellation because no cancellation code path exists at all.

**Blocking:** No decision on whole-vs-partial cancellation, outbound-only vs
return-only, or how cancellation interacts with the capacity engine
(`SELECT ... FOR UPDATE` in `createBooking`).

---

## D4 — Financial model

**Status:** UNDECIDED.

**Full detail:** `docs/decisions/D4-FINANCIAL-DISCOVERY.md`.

**Current real state:** No financial tables exist in
`packages/database/schema.prisma` or `infrastructure/migrations/`. `Sale`
(schema merged on `origin/main`, API on open PR #13 `feature/sale-vertical`)
has `amount`, `discount`, `total`, `status` (PENDING/CONFIRMED/PAID/
CANCELLED/REFUNDED) and `paidAt` — these are unmanaged/read-only fields:
nothing in the codebase transitions `status` or sets `paidAt` other than
direct writes on create/update, there is no payment-processing or
partial-payment concept. `Commission` is structural-only (see registry entry
below). `Supplier` and `TransportOperation` carry no cost fields at all.

**Blocking:** No ADR/decision on receivables, payables, payments, partial
payments, cash flow, margin, or commission settlement architecture.

---

## Location / IBGE persistence

**Status:** DEFERRED — not started.

**Current real state:** No `LocationAutocomplete.tsx` or any IBGE-related
file exists anywhere in the repository as of this pass
(`find . -iname "LocationAutocomplete*"` across the full working tree,
excluding `node_modules`, returned no results). If such a standalone,
unwired component existed in an earlier version of this codebase, it is not
present in the current `origin/main` checkout used for this audit — this
entry should not be read as confirming its existence, and any documentation
elsewhere claiming it exists should be treated as unverified until someone
locates it in a specific branch/commit.

**Blocking:** No schema, no component, no ADR. Fully deferred.

---

## Sale/payment lifecycle status

**Status:** OPEN GAP — unmanaged/read-only fields, real gap.

**Current real state:** `Sale.status` enum (PENDING, CONFIRMED, PAID,
CANCELLED, REFUNDED) and `Sale.paidAt` exist in schema on `origin/main`.
The API implementing Sale CRUD lives only on the open, unmerged PR #13
(`feature/sale-vertical`, `services/api/src/sales.ts`, 283 lines). Neither
the merged schema nor the open PR contains any lifecycle transition logic
(e.g. an endpoint that moves a Sale from PENDING to PAID as a side effect of
a payment event) — `status` and `paidAt` are plain writable fields with no
business rule enforcing valid transitions.

**Blocking:** Depends on D4 (financial model) for what a real payment event
even is.

---

## Proposal lifecycle status

**Status:** OPEN GAP — accept/decline not implemented, real gap.

**Current real state:** `Proposal.status` enum includes ACCEPTED and
DECLINED (`packages/database/schema.prisma`, `ProposalStatus`). No
accept/decline transition endpoint was found in
`services/api/src/proposals.ts` or `services/api/src/customer-portal.ts` in
this pass — a customer viewing a proposal in the Customer Portal has no way
to accept or decline it that changes `status` through any dedicated
business action; only a generic field update (if exposed) would touch the
column directly, without lifecycle validation.

**Blocking:** No ADR on what accepting a Proposal should trigger (creation
of a Sale? Booking? both?) — likely entangled with the Sale vertical landing
first.

---

## Commission — structural only

**Status:** OPEN GAP — schema repaired, no calculation/lifecycle.

**Current real state:** PR #12 (`feature/commission-repair`, merged) added
`UNIQUE(agencyId, id)` to `Commission` so it can be referenced by future
composite tenant-safe FKs (see comment in `schema.prisma` lines 305-309).
No `services/api/src/commissions.ts` exists on `origin/main`. No automatic
calculation from `Sale` exists anywhere in the codebase.

**Blocking:** Depends on Sale merging and on D4 (financial model) for how
commission settlement should work.

---

## Registry maintenance note

This file is a status tracker. When any of the above moves (a branch merges,
an endpoint ships, a decision is made), update the relevant entry's status
line and evidence — do not delete history of what was previously undecided
without noting the resolution and its ADR/PR reference.
