# AGENT 05 — CUSTOMER PORTAL + TRANSPORT

Branch: `release/d-customer-transport`

## Part 1 — Customer Portal real data

Replace fixtures on operational routes for:
- portal home
- own trips/detail
- own proposals
- own bookings
- profile

Customer never selects customer_id or tenant. Use trusted agency+customer context.

Never expose Trip.notes internal, Booking.notes, BookingPassenger.notes, cost, margin, staff metadata, audit data or tenant identifiers.

Add IDOR tests: customer A cannot read B, guessed proposal/booking/trip IDs fail, tenant/customer spoof fails.

Preserve mobile usability.

Run customer tests/typecheck/lint/security/build before Part 2.

## Part 2 — Transport / ancillary

Inventory existing transportation admin and its dependencies on Offer/Proposal/Booking.

If launch-required: complete real CRUD/persistence/tenant isolation/validation/tests.

If not launch-required: do not invent work. Return `SAFE TO DEFER POST-LAUNCH` with evidence that core launch does not depend on it.

## Exit

CUSTOMER REAL DATA
SELF-SCOPE
PRIVACY
MOBILE
TRANSPORT LAUNCH REQUIRED YES/NO
TRANSPORT STATUS
P0
P1
READY FOR INTEGRATION / SAFE TO DEFER / BLOCKED
