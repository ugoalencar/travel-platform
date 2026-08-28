# D3: Booking Cancellation — Discovery Pack

**Status:** Discovery only. No decision made here. Refund is explicitly a
financial concern (D4), not addressed here beyond noting the boundary.

---

## 1. What exists today (verified against `origin/main`)

- `Booking.cancelled: Boolean @default(false)` and
  `ScheduledDeparture.cancelled: Boolean @default(false)` both exist in
  `packages/database/schema.prisma`.
- `services/api/src/bookings.ts` exports exactly three functions:
  `listBookings`, `getBookingById`, `createBooking`. **No update or cancel
  endpoint of any kind exists.**
- `createBooking` uses `SELECT ... FOR UPDATE` on the relevant
  `ScheduledDeparture` row(s) to serialize capacity checks
  (`services/api/src/bookings.ts`, capacity-check block referencing
  `outbound.cancelled`/`returnDeparture.cancelled` and a count of
  non-cancelled bookings against capacity). This is the concurrency-safe
  capacity engine that any cancellation flow would need to release back
  into.
- `BookingPassenger` is a child table of `Booking` (1 Booking → N
  BookingPassenger) with no `cancelled` field of its own — cancellation
  state exists only at the `Booking` level today, not per-passenger.
- Round-trip bookings reference two `ScheduledDeparture` rows (`outbound`,
  `return`) via `outboundDepartureId`/`returnDepartureId` on the same
  `Booking` row — there is no separate "leg" entity to cancel
  independently.

## 2. Cancellation shapes to weigh (not decided here)

### Whole-booking cancellation
- Simplest to implement against the current schema: flip
  `Booking.cancelled = true`. Capacity-release is then a matter of the
  existing count query (`WHERE b.cancelled = false`) automatically
  excluding it — no new derivation logic needed, since availability is
  already computed by counting non-cancelled bookings/passengers.
- Loses granularity: a family of 4 that wants to cancel 1 seat cannot be
  represented without also inventing partial cancellation.

### Per-passenger partial cancellation
- Requires adding cancellation state to `BookingPassenger` (currently has
  none) — schema change, not just an endpoint.
- Capacity release becomes per-passenger-count rather than per-booking,
  which changes the capacity-check query's shape (today it counts
  `booking_passengers` joined to non-cancelled bookings; it would need to
  also filter on passenger-level cancellation).
- Raises a question current schema doesn't answer: does a `Booking` with
  zero remaining active passengers auto-transition to `cancelled = true`,
  or stay open with zero passengers?

### Outbound-only / return-only cancellation (round-trip bookings)
- Current schema has no per-leg cancellation concept — `cancelled` is a
  single flag on the whole `Booking`, which spans both
  `outboundDepartureId` and `returnDepartureId`.
- Supporting this would require either splitting `cancelled` into two
  flags (`outboundCancelled`/`returnCancelled`) or modeling each leg as its
  own row — a materially different shape from today's single-row
  round-trip `Booking`.
- Capacity release would need to target only the cancelled leg's
  `ScheduledDeparture`, leaving the other leg's reserved seat intact.

### Capacity release into the concurrency-safe engine
- Whatever shape is chosen, it must use the same `SELECT ... FOR UPDATE`
  discipline `createBooking` already uses on `ScheduledDeparture`, to avoid
  a race between a cancellation freeing a seat and a concurrent
  `createBooking` counting capacity — no cancellation code exists yet to
  audit for this, so this is a requirement for whatever gets built, not a
  gap being described in already-written code.

## 3. Audit trail requirements (not currently satisfiable)

- No table today records *when* or *by whom* a booking was cancelled —
  `Booking` has no `cancelledAt`/`cancelledBy` columns, only the boolean.
  Any cancellation flow that needs an audit trail (who cancelled, when, why)
  needs new columns or a separate event/audit table — neither exists.
- `updatedAt` (present on `Booking` via the standard timestamp pattern)
  would change on cancellation but cannot distinguish "cancelled" from any
  other update, and cannot show history if a booking were somehow
  un-cancelled.

## 4. Refund — explicitly out of scope here

Refund is a financial concern belonging to D4
(`docs/decisions/D4-FINANCIAL-DISCOVERY.md`), not this decision. Nothing in
`Booking`/`ScheduledDeparture` links to money — pricing lives on `Sale`
(separate from `Booking` by design, per ADR-004), and `Sale.status` already
includes a `REFUNDED` value with no implementation behind it (see D4 and the
findings registry's "Sale/payment lifecycle" entry). Whatever booking
cancellation shape is chosen should treat "does this booking's cancellation
trigger a refund" as an integration point with D4's eventual payment model,
not something to solve here.

## 5. Financial implications (noted, not resolved)

- If a `Booking` is linked (even loosely, via `Trip.saleId`) to a paid
  `Sale`, cancelling the booking raises the question of whether/how that
  should affect `Sale.status`/`Sale.total` — today there is no code path
  connecting `Booking` cancellation to `Sale` at all, so this is purely a
  future integration question, not an existing gap in booking code per se.

## 6. Cross-cutting facts

- Any new column/table needs the same tenant-scoping pattern as everything
  else in `schema.prisma` (`agencyId` first FK column, composite
  `(agencyId, id)` uniqueness) — not a decision point, a constraint.
- Whatever shape is picked will change the capacity-check query in
  `createBooking` (`services/api/src/bookings.ts`), since that query is
  literally the source of truth for "how many seats are taken," and it
  currently keys off `Booking.cancelled` alone.

## References
- `packages/database/schema.prisma` (`Booking`, `BookingPassenger`, `ScheduledDeparture`)
- `services/api/src/bookings.ts`
- `docs/adr/ADR-004-domain-modeling-wish-customer-sale-booking.md`
- `docs/decisions/D4-FINANCIAL-DISCOVERY.md`
- `docs/adr/ARCHITECTURAL-FINDINGS-REGISTRY.md` (D3 entry)
