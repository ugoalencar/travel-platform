# AGENT 03 — PRODUCT CORE B
## Proposals + Bookings + Sales

Branch: `release/b-commercial-flow`

### Goal

Deliver real transactional flow:

Wish → Trip → Proposal → Booking → Sale

Do not invent domain behavior. Inspect ADRs, schema, migrations and existing routes.

### Proposal

Real list/detail/create/edit/items/services/pricing/status/traveler preview.

Traveler preview must not expose cost, margin, internal notes, tenant IDs or staff metadata.

### Booking

Real create/list/detail/update/status. Preserve traveler/passenger privacy. Booking.notes and BookingPassenger.notes stay internal unless explicitly classified otherwise.

### Sale

Real list/detail/create-or-derive/status/totals. Server is authoritative for amounts.

### Transaction safety

Test partial failure, retries, duplicate submit, invalid state transition, audit failure, and no half-created booking/sale state.

### Tenant safety

Cross-tenant proposal, booking and sale access must fail, including guessed IDs.

### Frontend

Preserve approved visual UI; remove operational mocks; handle 400/401/403/404/409/429/500.

### Gates

lint, typecheck, agency tests, security, db, RLS/FORCE, tenant isolation, transaction tests, secrets, build.

### Exit

COMMERCIAL FLOW
PROPOSAL REAL
BOOKING REAL
SALE REAL
PERSISTENCE
TRANSACTION TESTS
PRIVACY
P0
P1
READY FOR INTEGRATION / BLOCKED

Do not push, PR or merge.
