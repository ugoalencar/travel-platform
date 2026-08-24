# Bot Query Readiness Audit

**Status:** Audit only. Does not build a bot, does not build a shared query
layer. Documents what exists today and what's missing.

---

## 1. Does `services/api/src/commercial-queries.ts` exist on `origin/main`?

**No.** Verified: `git show origin/main:services/api/src/commercial-queries.ts`
fails ("path does not exist"). The file exists only on the local, unpushed
`feature/commercial-cockpit` branch (no PR, not on `origin` per
`git branch -r`) — see `docs/adr/ARCHITECTURAL-FINDINGS-REGISTRY.md` and
`docs/PRODUCT-VISION-AND-SCOPE.md` for the merge status of that branch. This
audit covers what exists there, since it's the only real candidate code, but
readers must not assume any of it is deployed.

The file's own header comment states its intent explicitly:

> Plain, HTTP-independent query functions intended to be reusable by any
> future consumer of this domain (a future bot/WhatsApp integration is
> explicitly NOT implemented here...). Each function takes an explicit
> agencyId... rather than reading it off ambient tenant context, so a
> non-HTTP caller can use them directly.

This is a deliberate design decision already made on that branch, not
something this audit is proposing.

---

## 2. Customer-facing questions

| Question | Coverage | Evidence |
|---|---|---|
| Next trip | Covered | `getCustomerNextTrip(client, agencyId, customerId)` — earliest non-cancelled/non-completed `Trip` with `end_date >= CURRENT_DATE`, ordered by `start_date`. |
| Next departure time | Covered | `getNextDepartureForCustomerBooking(client, agencyId, customerId)` — joins `bookings` → `scheduled_departures` → `transport_products` → `routes`, earliest future `departure_at` for that customer's outbound bookings. Deliberately kept separate from "next trip" (commercial vs operational date concept — documented in the source comment). |
| Their bookings | Partially covered | No single "list all bookings for a customer" query exists in `commercial-queries.ts`; `listBookings`/`getBookingById` in `services/api/src/bookings.ts` (merged, `origin/main`) support this via existing filters, but that file is HTTP-request-shaped (reads tenant context ambiently), not the explicit-agencyId reusable-function shape the commercial-queries layer uses. A bot would need to either call the HTTP layer or a new explicit-param wrapper — not a blocker, just an inconsistency to note. |
| Their proposals | Partially covered | `isProposalStillValid(client, agencyId, proposalId)` answers validity for one known proposal; there is no "list this customer's proposals" reusable query in `commercial-queries.ts`. `services/api/src/proposals.ts` (merged) can list proposals but again in the ambient-tenant-context HTTP shape. |
| Proposal validity | Covered | `isProposalStillValid` — read-only, checks `status IN ('DRAFT','SENT')` and `valid_until` in the future. Comment explicitly notes it never mutates `Proposal.status` (consistent with the "Proposal lifecycle status" gap recorded in the findings registry — this query works around, not around, that gap). |

## 3. Staff-facing questions

| Question | Coverage | Evidence |
|---|---|---|
| Follow-ups due today | Covered | `listFollowUpsDueTodayForUser(client, agencyId, assignedUserId)` — `commercial_tasks` where `completed_at IS NULL` and `due_at <= CURRENT_DATE + 1 day`. |
| Overdue follow-ups | **Duplicated, not reusable** | No standalone reusable function exists for "overdue" in `commercial-queries.ts`. `services/api/src/commercial-cockpit.ts` computes an overdue count **inline** (around line 1140: a separate `client.query<{ count: string }>(...)` call distinct from `listFollowUpsDueTodayForUser`) rather than exposing it as a named, reusable query alongside its sibling `listFollowUpsDueTodayForUser`. This is the one concrete DRY finding from this audit — see below. |
| Stalled proposals | Covered (as "no response") | `listProposalsWithNoResponse(client, agencyId)` — `Proposal.status = 'SENT'` with no linked `commercial_opportunities` row in stage `WON`/`LOST`. Reused directly by `commercial-cockpit.ts` (imported, not reimplemented) for its dashboard endpoint. |
| Upcoming trips | Covered | `listTravelersToDestination(client, agencyId, destination, dateFrom, dateTo)` answers a superset (date range + destination filter); an "all upcoming trips" query without a destination filter would just be this with the `ILIKE` predicate dropped — trivial to add, not present as a separate function today. |
| Customers by destination | Covered | Same `listTravelersToDestination` function directly answers this. |

## 4. DRY finding (the one duplication actually found)

**Overdue follow-up count is computed twice, in two different shapes.**
`commercial-queries.ts` defines `listFollowUpsDueTodayForUser` as the
reusable, explicit-agencyId query pattern the file's own header comment
commits to. But "overdue" (a closely related, arguably more bot-relevant
question — "what's late," not just "what's due today") is implemented as an
ad-hoc inline query directly inside `commercial-cockpit.ts`'s dashboard
handler (`overdueFollowUps = await client.query<{ count: string }>(...)`,
around line 1140), not lifted into `commercial-queries.ts` next to its
sibling. Anyone building a bot answering "what follow-ups are overdue"
would currently have to either duplicate that inline SQL a third time or
refactor it out first. This is a real, code-level DRY gap in the one file
that exists specifically to prevent this kind of duplication — not a
guess.

No other duplication was found: `listProposalsWithNoResponse` and
`listFollowUpsDueTodayForUser` are both imported and reused (not
reimplemented) by `commercial-cockpit.ts`, confirming the reusable-layer
pattern is actually followed for those two.

## 5. What would be needed beyond what exists

1. **Bookings/proposals listing in the explicit-param shape** — the
   ambient-tenant-context HTTP handlers (`bookings.ts`, `proposals.ts`) are
   not directly reusable by a non-HTTP caller (a bot) the way
   `commercial-queries.ts` functions are; either the bot calls the HTTP API
   like any other client, or someone adds explicit-param wrapper functions
   matching the existing pattern.
2. **The overdue-follow-ups DRY gap above** — should become a named,
   reusable function alongside `listFollowUpsDueTodayForUser` before any
   bot depends on it, per the same principle the file already documents for
   itself.
3. **The whole `commercial-queries.ts` file is unmerged** — none of this is
   usable until `feature/commercial-cockpit` (or a successor PR) lands on
   `origin/main`. This audit assumes it as the best-available candidate,
   not as shipped capability.
4. **No bot exists, no shared "domain query layer" package exists.** This
   audit does not create either — it only assesses gap/readiness as
   instructed.

## References
- `feature/commercial-cockpit` branch (local-only, unpushed):
  `services/api/src/commercial-queries.ts`, `services/api/src/commercial-cockpit.ts`
- `services/api/src/bookings.ts`, `services/api/src/proposals.ts` (merged, `origin/main`)
- `docs/adr/ARCHITECTURAL-FINDINGS-REGISTRY.md` (Commission/Proposal/Sale entries — Proposal lifecycle is why `isProposalStillValid` is read-only by design)
- `docs/PRODUCT-VISION-AND-SCOPE.md`
