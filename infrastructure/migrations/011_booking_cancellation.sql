-- ============================================================
-- Booking Cancellation V1
-- ============================================================
--
-- Additive audit fields for whole-booking cancellation only. No refund,
-- passenger-level cancellation, outbound-only cancellation, or return-only
-- cancellation is introduced here.

ALTER TABLE bookings
  ADD COLUMN cancelled_at TIMESTAMPTZ,
  ADD COLUMN cancelled_by_user_id TEXT,
  ADD COLUMN cancellation_reason TEXT;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_cancelled_by_user_tenant_fk
    FOREIGN KEY (agency_id, cancelled_by_user_id) REFERENCES users (agency_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_cancellation_audit_check
    CHECK (
      (cancelled = false AND cancelled_at IS NULL AND cancelled_by_user_id IS NULL AND cancellation_reason IS NULL)
      OR (cancelled = true AND cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL)
    );

CREATE INDEX bookings_agency_cancelled_idx
  ON bookings (agency_id, cancelled, cancelled_at);
