# Booking Cancellation

Batch 02 implements whole-booking cancellation only.

Implemented scope:

- `POST /bookings/:id/cancel` for staff callers.
- Audit columns `cancelled_at`, `cancelled_by_user_id`, and
  `cancellation_reason` in `011_booking_cancellation.sql`.
- Cancelled bookings stop consuming departure capacity because booking
  creation already counts only non-cancelled bookings.
- Tenant-safe cancellation user FK and RLS-compatible test coverage.

Deferred scope:

- Passenger-level cancellation.
- Outbound-only or return-only cancellation.
- Refund/penalty/no-show policy.
- Provider-side cancellation integration.
